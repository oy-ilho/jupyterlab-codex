import asyncio
import base64
import json
import os
import shutil
import re
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

from tornado.websocket import WebSocketHandler

from .cli_defaults import load_cli_defaults_for_ui
from .runner import CodexRunner
from .sessions import SessionStore


_MAX_IMAGE_ATTACHMENTS = 4
_MAX_IMAGE_ATTACHMENT_BYTES = 4 * 1024 * 1024
_MAX_IMAGE_ATTACHMENTS_TOTAL_BYTES = 6 * 1024 * 1024
_IMAGE_SUFFIX_BY_MIME = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
}

_NOISY_STDERR_PATTERNS = (
    re.compile(
        r"\bcodex_core::rollout::list:\s+state db (?:missing|returned stale) rollout path for thread\b",
        re.IGNORECASE,
    ),
)


def _strip_noisy_stderr_lines(text: str) -> str:
    if not text:
        return ""

    lines = text.splitlines(keepends=True)
    kept = [
        line for line in lines if not any(pattern.search(line) for pattern in _NOISY_STDERR_PATTERNS)
    ]
    return "".join(kept)


def _coerce_command_path(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()


def _build_command_not_found_hint(requested_path: str) -> dict[str, str]:
    requested_label = requested_path or "codex"
    detected = shutil.which("codex")
    if detected:
        return {
            "message":
                f"Cannot find executable '{requested_label}'. "
                f"Detected server-side path: {detected}. "
                "Set this path in settings and retry.",
            "suggestedCommandPath": detected,
        }
    return {
        "message":
            f"Cannot find executable '{requested_label}'. "
            "Run `which codex` in terminal and paste the output path into settings.",
    }


class CodexWSHandler(WebSocketHandler):
    def initialize(self, server_app):
        self._server_app = server_app
        self._runner = CodexRunner()
        self._store = SessionStore()
        self._active_runs: Dict[str, Dict[str, Any]] = {}

    def check_origin(self, origin: str) -> bool:
        return super().check_origin(origin)

    def open(self):
        self.write_message(json.dumps({"type": "status", "state": "ready"}))
        self._send_cli_defaults()
        self._send_rate_limits_snapshot()

    async def on_message(self, message: str):
        try:
            payload = json.loads(message)
        except json.JSONDecodeError:
            self.write_message(json.dumps({"type": "error", "message": "Invalid JSON"}))
            return

        msg_type = payload.get("type")

        if msg_type == "start_session":
            await self._handle_start_session(payload)
            return

        if msg_type == "send":
            await self._handle_send(payload)
            return

        if msg_type == "cancel":
            await self._handle_cancel(payload)
            return

        if msg_type == "end_session":
            await self._handle_end_session(payload)
            return

        if msg_type == "refresh_rate_limits":
            self._send_rate_limits_snapshot(force=True)
            return

        self.write_message(json.dumps({"type": "error", "message": "Unknown message type"}))

    def _send_cli_defaults(self) -> None:
        try:
            defaults = load_cli_defaults_for_ui()
        except Exception:  # pragma: no cover - best-effort
            defaults = {"model": None, "reasoningEffort": None}

        try:
            self.write_message(json.dumps({"type": "cli_defaults", **defaults}))
        except Exception:
            return

    async def _handle_start_session(self, payload: Dict[str, Any]):
        session_id = payload.get("sessionId") or str(uuid.uuid4())
        notebook_path = payload.get("notebookPath", "")
        notebook_os_path = self._resolve_notebook_os_path(notebook_path)

        self._store.ensure_session(session_id, notebook_path, notebook_os_path)
        if notebook_path:
            self._store.update_notebook_path(session_id, notebook_path, notebook_os_path)

        paired_ok, paired_path, paired_os_path, paired_message = _compute_pairing_status(
            notebook_path, notebook_os_path
        )
        self.write_message(
            json.dumps(
                {
                    "type": "status",
                    "state": "ready",
                    "sessionId": session_id,
                    "notebookPath": notebook_path,
                    "pairedOk": paired_ok,
                    "pairedPath": paired_path,
                    "pairedOsPath": paired_os_path,
                    "pairedMessage": paired_message,
                }
            )
        )

    async def _handle_send(self, payload: Dict[str, Any]):
        session_id = payload.get("sessionId") or str(uuid.uuid4())
        content = payload.get("content", "")
        selection = payload.get("selection", "")
        cell_output = payload.get("cellOutput", "")
        images_payload = payload.get("images")
        notebook_path = payload.get("notebookPath", "")
        requested_model_raw = payload.get("model")
        requested_model = _sanitize_model_name(requested_model_raw)
        requested_reasoning_raw = payload.get("reasoningEffort")
        requested_reasoning = _sanitize_reasoning_effort(requested_reasoning_raw)
        requested_sandbox_raw = payload.get("sandbox")
        requested_sandbox = _sanitize_sandbox_mode(requested_sandbox_raw)
        requested_command_path = _coerce_command_path(payload.get("commandPath"))
        notebook_os_path = self._resolve_notebook_os_path(notebook_path)
        run_id = str(uuid.uuid4())

        has_images = bool(images_payload)
        if not content and not has_images:
            self.write_message(json.dumps({"type": "error", "message": "Empty content"}))
            return
        if requested_model_raw and not requested_model:
            self.write_message(json.dumps({"type": "error", "message": "Invalid model name"}))
            return
        if requested_reasoning_raw and not requested_reasoning:
            self.write_message(json.dumps({"type": "error", "message": "Invalid reasoning level"}))
            return
        if requested_sandbox_raw and not requested_sandbox:
            self.write_message(json.dumps({"type": "error", "message": "Invalid sandbox mode"}))
            return

        images: list[dict[str, str]] = []
        if images_payload:
            if not isinstance(images_payload, list):
                self.write_message(json.dumps({"type": "error", "message": "Invalid images payload"}))
                return
            if len(images_payload) > _MAX_IMAGE_ATTACHMENTS:
                self.write_message(json.dumps({"type": "error", "message": "Too many images attached"}))
                return
            for item in images_payload:
                if not isinstance(item, dict):
                    self.write_message(json.dumps({"type": "error", "message": "Invalid images payload"}))
                    return
                data_url = item.get("dataUrl")
                if not isinstance(data_url, str) or not data_url.strip():
                    self.write_message(json.dumps({"type": "error", "message": "Invalid images payload"}))
                    return
                name = item.get("name")
                images.append({"dataUrl": data_url, "name": name if isinstance(name, str) else ""})

        paired_ok, paired_path, paired_os_path, paired_message = _compute_pairing_status(
            notebook_path, notebook_os_path
        )
        if not paired_ok:
            # Enforce paired workflow on the server as well (front-end can be bypassed).
            self.write_message(
                json.dumps(
                    {
                        "type": "error",
                        "runId": run_id,
                        "sessionId": session_id,
                        "notebookPath": notebook_path,
                        "message": paired_message
                        or "Jupytext paired file is required for this extension.",
                        "pairedOk": paired_ok,
                        "pairedPath": paired_path,
                        "pairedOsPath": paired_os_path,
                        "pairedMessage": paired_message,
                    }
                )
            )
            self.write_message(
                json.dumps(
                    {
                        "type": "status",
                        "state": "ready",
                        "runId": run_id,
                        "sessionId": session_id,
                        "notebookPath": notebook_path,
                        "pairedOk": paired_ok,
                        "pairedPath": paired_path,
                        "pairedOsPath": paired_os_path,
                        "pairedMessage": paired_message,
                    }
                )
            )
            return

        self._store.ensure_session(session_id, notebook_path, notebook_os_path)
        if notebook_path:
            self._store.update_notebook_path(session_id, notebook_path, notebook_os_path)

        cwd = None
        if notebook_os_path:
            candidate = os.path.dirname(os.path.abspath(notebook_os_path))
            if candidate and os.path.isdir(candidate):
                cwd = candidate
        watch_paths = _refresh_watch_paths(notebook_os_path)
        before_mtimes = _capture_mtimes(watch_paths)

        prompt = self._store.build_prompt(session_id, content, selection, cell_output, cwd=cwd)
        self._store.append_message(session_id, "user", content)

        async def _run():
            self.write_message(
                json.dumps(
                    {
                        "type": "status",
                        "state": "running",
                        "runId": run_id,
                        "sessionId": session_id,
                        "notebookPath": notebook_path,
                        "pairedOk": paired_ok,
                        "pairedPath": paired_path,
                        "pairedOsPath": paired_os_path,
                        "pairedMessage": paired_message,
                    }
                )
            )

            temp_images_dir = None
            image_paths: list[str] = []
            assistant_buffer = []

            async def on_event(event: Dict[str, Any]):
                text = event_to_text(event)
                if text:
                    assistant_buffer.append(text)
                    self.write_message(
                        json.dumps(
                            {
                                "type": "output",
                                "runId": run_id,
                                "sessionId": session_id,
                                "notebookPath": notebook_path,
                                "text": text,
                            }
                        )
                    )
                elif event.get("type") == "stderr":
                    # Ignore filtered/no-op stderr chunks to avoid rendering them
                    # again via the generic "event" UI path.
                    return
                else:
                    self.write_message(
                        json.dumps(
                            {
                                "type": "event",
                                "runId": run_id,
                                "sessionId": session_id,
                                "notebookPath": notebook_path,
                                "payload": event,
                            }
                        )
                    )

            try:
                if images:
                    temp_images_dir = tempfile.TemporaryDirectory(prefix="jupyterlab-codex-images-")
                    total_bytes = 0
                    for idx, item in enumerate(images):
                        mime, decoded = _decode_image_data_url(item["dataUrl"])
                        if len(decoded) > _MAX_IMAGE_ATTACHMENT_BYTES:
                            raise ValueError("Image attachment too large")
                        total_bytes += len(decoded)
                        if total_bytes > _MAX_IMAGE_ATTACHMENTS_TOTAL_BYTES:
                            raise ValueError("Image attachments too large")
                        suffix = _IMAGE_SUFFIX_BY_MIME.get(mime.lower(), ".png")
                        out_path = os.path.join(temp_images_dir.name, f"attachment-{idx}{suffix}")
                        with open(out_path, "wb") as handle:
                            handle.write(decoded)
                        image_paths.append(out_path)

                exit_code = await self._runner.run(
                    prompt,
                    on_event,
                    cwd=cwd,
                    model=requested_model,
                    reasoning_effort=requested_reasoning,
                    sandbox=requested_sandbox,
                    command=requested_command_path,
                    images=image_paths,
                )
                if assistant_buffer:
                    self._store.append_message(session_id, "assistant", "".join(assistant_buffer))
                file_changed = _has_path_changes(before_mtimes, _capture_mtimes(watch_paths))
                self.write_message(
                    json.dumps(
                        {
                            "type": "done",
                            "runId": run_id,
                            "sessionId": session_id,
                            "notebookPath": notebook_path,
                            "exitCode": exit_code,
                            "fileChanged": file_changed,
                            "pairedOk": paired_ok,
                            "pairedPath": paired_path,
                            "pairedOsPath": paired_os_path,
                            "pairedMessage": paired_message,
                        }
                    )
                )
                self.write_message(
                    json.dumps(
                        {
                            "type": "status",
                            "state": "ready",
                            "runId": run_id,
                            "sessionId": session_id,
                            "notebookPath": notebook_path,
                            "pairedOk": paired_ok,
                            "pairedPath": paired_path,
                            "pairedOsPath": paired_os_path,
                            "pairedMessage": paired_message,
                        }
                    )
                )
            except asyncio.CancelledError:
                file_changed = _has_path_changes(before_mtimes, _capture_mtimes(watch_paths))
                self.write_message(
                    json.dumps(
                        {
                            "type": "done",
                            "runId": run_id,
                            "sessionId": session_id,
                            "notebookPath": notebook_path,
                            "exitCode": None,
                            "cancelled": True,
                            "fileChanged": file_changed,
                            "pairedOk": paired_ok,
                            "pairedPath": paired_path,
                            "pairedOsPath": paired_os_path,
                            "pairedMessage": paired_message,
                        }
                    )
                )
                self.write_message(
                    json.dumps(
                        {
                            "type": "status",
                            "state": "ready",
                            "runId": run_id,
                            "sessionId": session_id,
                            "notebookPath": notebook_path,
                            "pairedOk": paired_ok,
                            "pairedPath": paired_path,
                            "pairedOsPath": paired_os_path,
                            "pairedMessage": paired_message,
                        }
                    )
                )
                raise
            except FileNotFoundError:
                hint = _build_command_not_found_hint(requested_command_path)
                error_payload = {
                    "type": "error",
                    "runId": run_id,
                    "sessionId": session_id,
                    "notebookPath": notebook_path,
                    "message": hint["message"],
                    "pairedOk": paired_ok,
                    "pairedPath": paired_path,
                    "pairedOsPath": paired_os_path,
                    "pairedMessage": paired_message,
                }
                if suggested_command_path := hint.get("suggestedCommandPath"):
                    error_payload["suggestedCommandPath"] = suggested_command_path
                self.write_message(json.dumps(error_payload))
                self.write_message(
                    json.dumps(
                        {
                            "type": "status",
                            "state": "ready",
                            "runId": run_id,
                            "sessionId": session_id,
                            "notebookPath": notebook_path,
                            "pairedOk": paired_ok,
                            "pairedPath": paired_path,
                            "pairedOsPath": paired_os_path,
                            "pairedMessage": paired_message,
                        }
                    )
                )
            except Exception as exc:  # pragma: no cover - defensive path
                self.write_message(
                    json.dumps(
                        {
                            "type": "error",
                            "runId": run_id,
                            "sessionId": session_id,
                            "notebookPath": notebook_path,
                            "message": str(exc),
                        }
                    )
                )
                self.write_message(
                    json.dumps(
                        {
                            "type": "status",
                            "state": "ready",
                            "runId": run_id,
                            "sessionId": session_id,
                            "notebookPath": notebook_path,
                            "pairedOk": paired_ok,
                            "pairedPath": paired_path,
                            "pairedOsPath": paired_os_path,
                            "pairedMessage": paired_message,
                        }
                    )
                )
            finally:
                # Rate limits are recorded by the Codex Desktop app/CLI in ~/.codex/sessions/*.
                # Reading the latest snapshot here lets the UI surface "Session" / "Weekly" usage.
                if temp_images_dir is not None:
                    temp_images_dir.cleanup()
                self._send_rate_limits_snapshot()
                self._active_runs.pop(run_id, None)

        task = asyncio.create_task(_run())
        self._active_runs[run_id] = {
            "task": task,
            "sessionId": session_id,
            "notebookPath": notebook_path,
        }

    def _send_rate_limits_snapshot(self, force: bool = False) -> None:
        try:
            snapshot = load_latest_rate_limits(force=force)
        except Exception:  # pragma: no cover - best-effort telemetry
            snapshot = None

        try:
            self.write_message(json.dumps({"type": "rate_limits", "snapshot": snapshot}))
        except Exception:
            # Socket may already be closed; ignore.
            return

    async def _handle_cancel(self, payload: Dict[str, Any]):
        run_id = payload.get("runId")
        run_context = self._active_runs.get(run_id)

        if not run_context:
            self.write_message(json.dumps({"type": "error", "message": "Run not found"}))
            return

        task = run_context["task"]
        task.cancel()
        self.write_message(
            json.dumps(
                {
                    "type": "status",
                    "state": "ready",
                    "runId": run_id,
                    "sessionId": run_context["sessionId"],
                    "notebookPath": run_context["notebookPath"],
                }
            )
        )

    async def _handle_end_session(self, payload: Dict[str, Any]):
        session_id = payload.get("sessionId")
        if session_id:
            self._store.close_session(session_id)
        self.write_message(json.dumps({"type": "status", "state": "ready"}))

    def _resolve_notebook_os_path(self, notebook_path: str) -> str:
        if not notebook_path:
            return ""

        normalized = notebook_path.lstrip("/")
        contents_manager = getattr(self._server_app, "contents_manager", None)
        if contents_manager is not None:
            try:
                resolved = contents_manager.get_os_path(normalized)
                if resolved:
                    return os.path.abspath(resolved)
            except Exception:
                pass

        if os.path.isabs(notebook_path):
            return os.path.abspath(notebook_path)

        root_dir = ""
        if contents_manager is not None:
            root_dir = getattr(contents_manager, "root_dir", "") or ""
        if not root_dir:
            root_dir = getattr(self._server_app, "root_dir", "") or ""
        if root_dir:
            return os.path.abspath(os.path.join(root_dir, normalized))

        return ""


_RATE_LIMITS_CACHE_TTL_SECONDS = 30.0
_RATE_LIMITS_CACHE: Dict[str, Any] = {"fetched_at": 0.0, "snapshot": None}


def load_latest_rate_limits(force: bool = False) -> Dict[str, Any] | None:
    """
    Best-effort lookup of the latest Codex account rate limits ("Session" / "Weekly").

    The Codex CLI/Desktop app persists rich JSONL session logs under ~/.codex/sessions.
    These logs include `token_count` events with `rate_limits` fields that expose:
    - primary window (typically 5h / 300 mins)
    - secondary window (typically 7d / 10080 mins)
    """
    now = time.time()
    if (
        not force
        and isinstance(_RATE_LIMITS_CACHE.get("fetched_at"), (int, float))
        and now - float(_RATE_LIMITS_CACHE["fetched_at"]) < _RATE_LIMITS_CACHE_TTL_SECONDS
    ):
        return _RATE_LIMITS_CACHE.get("snapshot")

    snapshot = _scan_latest_rate_limits()
    _RATE_LIMITS_CACHE["fetched_at"] = now
    _RATE_LIMITS_CACHE["snapshot"] = snapshot
    return snapshot


def _scan_latest_rate_limits() -> Dict[str, Any] | None:
    base = Path(os.path.expanduser("~")) / ".codex" / "sessions"
    if not base.is_dir():
        return None

    candidates: list[tuple[float, Path]] = []
    for path in base.rglob("*.jsonl"):
        try:
            candidates.append((path.stat().st_mtime, path))
        except OSError:
            continue
    candidates.sort(key=lambda item: item[0], reverse=True)

    # Most recent sessions tend to have the freshest snapshot. Limit work to a small set.
    for _mtime, path in candidates[:25]:
        snapshot = _extract_rate_limits_from_session_file(path)
        if snapshot:
            return snapshot

    return None


def _extract_rate_limits_from_session_file(path: Path) -> Dict[str, Any] | None:
    # Read the tail only; large sessions can be tens of MBs.
    tail = _read_file_tail(path, max_bytes=1024 * 1024)
    if not tail:
        return None

    lines = tail.splitlines()
    for line in reversed(lines):
        line = line.strip()
        if not line or ("rate_limits" not in line and "rateLimits" not in line):
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue

        snapshot = _extract_rate_limits_from_session_event(obj)
        if snapshot:
            return snapshot

    return None


def _read_file_tail(path: Path, max_bytes: int) -> str:
    try:
        with path.open("rb") as f:
            f.seek(0, os.SEEK_END)
            size = f.tell()
            start = max(0, size - max_bytes)
            f.seek(start, os.SEEK_SET)
            data = f.read()
    except OSError:
        return ""
    return data.decode("utf-8", errors="replace")


def _extract_rate_limits_from_session_event(obj: Dict[str, Any]) -> Dict[str, Any] | None:
    if obj.get("type") != "event_msg":
        return None
    payload = obj.get("payload")
    if not isinstance(payload, dict):
        return None
    if payload.get("type") != "token_count":
        return None

    rl = payload.get("rate_limits")
    if not isinstance(rl, dict):
        rl = payload.get("rateLimits")
    if not isinstance(rl, dict):
        return None

    primary = rl.get("primary")
    secondary = rl.get("secondary")
    if not isinstance(primary, dict) or not isinstance(secondary, dict):
        return None

    updated_at = obj.get("timestamp")
    if not isinstance(updated_at, str) or not updated_at.strip():
        updated_at = None

    return {
        "updatedAt": _normalize_iso8601(updated_at) if updated_at else None,
        "primary": _coerce_rate_limit_window(primary),
        "secondary": _coerce_rate_limit_window(secondary),
    }


def _coerce_rate_limit_window(window: Dict[str, Any]) -> Dict[str, Any]:
    used = _coerce_number(_pick(window, "used_percent", "usedPercent"))
    window_mins = _coerce_int(
        _pick(window, "window_minutes", "windowDurationMins", "window_duration_mins")
    )
    resets_at = _coerce_int(_pick(window, "resets_at", "resetsAt"))
    return {"usedPercent": used, "windowMinutes": window_mins, "resetsAt": resets_at}


def _pick(d: Dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in d:
            return d.get(key)
    return None


def _coerce_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and value == value:
        return float(value)
    return None


def _coerce_int(value: Any) -> int | None:
    num = _coerce_number(value)
    if num is None:
        return None
    try:
        return int(num)
    except Exception:
        return None


def _normalize_iso8601(value: str) -> str:
    """
    Ensure timestamps are parseable by JS `Date.parse` across browsers.
    """
    raw = (value or "").strip()
    if not raw:
        return raw

    # Already well-formed with timezone
    if raw.endswith("Z") or "+" in raw or raw.endswith("z"):
        return raw.replace("z", "Z")

    # If it looks like a naive timestamp, assume UTC.
    try:
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except Exception:
        return raw


def event_to_text(event: Dict[str, Any]) -> str:
    """
    Map Codex JSONL events to text for chat output.

    This is intentionally conservative because the exact event schema may vary.
    Customize this when integrating with a specific Codex CLI JSON format.
    """
    event_type = event.get("type", "")

    # Skip internal events that should not be shown to users
    if event_type in ("thread.started", "turn.started", "turn.completed"):
        return ""

    # Codex may emit rollout index repair warnings on stderr. They are noisy and
    # non-actionable for extension users, so filter only those specific lines.
    if event_type == "stderr":
        text = event.get("text", "")
        if not isinstance(text, str):
            return ""
        return _strip_noisy_stderr_lines(text)

    # Handle item.completed events with nested item
    if event_type == "item.completed" and "item" in event:
        item = event["item"]
        item_type = item.get("type")

        # Extract visible assistant response only
        if item_type == "agent_message":
            text = item.get("text", "")
            if text:
                return text

        # Skip unstable features warning (show only once in logs)
        if item_type == "error":
            msg = item.get("message", "")
            if "suppress_unstable_features_warning" in msg:
                return ""
            if msg:
                return f"⚠️ {msg}\n"

    # Fallback: try direct text fields
    if "text" in event and isinstance(event["text"], str):
        return event["text"]
    if "message" in event and isinstance(event["message"], str):
        return event["message"]
    if "delta" in event and isinstance(event["delta"], str):
        return event["delta"]

    return ""


def _decode_image_data_url(data_url: str) -> tuple[str, bytes]:
    raw = (data_url or "").strip()
    if not raw.startswith("data:"):
        raise ValueError("Invalid image attachment")

    header, sep, data = raw.partition(",")
    if not sep:
        raise ValueError("Invalid image attachment")

    header_lower = header.lower()
    if ";base64" not in header_lower:
        raise ValueError("Invalid image attachment")

    mime = header[5:].split(";", 1)[0].strip().lower()
    if not mime.startswith("image/"):
        raise ValueError("Invalid image attachment")

    try:
        decoded = base64.b64decode(data, validate=True)
    except Exception:
        raise ValueError("Invalid image attachment") from None

    if not decoded:
        raise ValueError("Invalid image attachment")

    return mime, decoded


def _sanitize_model_name(value: Any) -> str | None:
    if not isinstance(value, str):
        return None

    model = value.strip()
    if not model or len(model) > 128:
        return None
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]*", model):
        return None

    return model


def _sanitize_reasoning_effort(value: Any) -> str | None:
    if not isinstance(value, str):
        return None

    effort = value.strip().lower()
    if not effort:
        return None
    if effort not in {"none", "minimal", "low", "medium", "high", "xhigh"}:
        return None

    return effort


def _sanitize_sandbox_mode(value: Any) -> str | None:
    if not isinstance(value, str):
        return None

    mode = value.strip().lower()
    if not mode:
        return None
    if mode not in {"read-only", "workspace-write", "danger-full-access"}:
        return None

    return mode


def _refresh_watch_paths(notebook_os_path: str) -> list[str]:
    if not notebook_os_path:
        return []

    absolute = os.path.abspath(notebook_os_path)
    root, ext = os.path.splitext(absolute)
    paths = [absolute]
    if ext == ".ipynb":
        paths.append(f"{root}.py")
    elif ext == ".py":
        paths.append(f"{root}.ipynb")
    return paths


def _compute_pairing_status(notebook_path: str, notebook_os_path: str) -> tuple[bool, str, str, str]:
    """
    This extension assumes a Jupytext paired workflow: <notebook>.ipynb <-> <notebook>.py.

    We treat the session as "paired" only when the derived paired file exists on disk.
    """
    nb_path = (notebook_path or "").strip()
    nb_os_path = (notebook_os_path or "").strip()

    paired_path = ""
    if nb_path.endswith(".ipynb"):
        paired_path = nb_path[:-6] + ".py"

    paired_os_path = ""
    if nb_os_path.endswith(".ipynb"):
        paired_os_path = nb_os_path[:-6] + ".py"

    # If we cannot resolve OS paths (e.g. non-local content manager), be conservative and block.
    if nb_path.endswith(".ipynb") and not paired_os_path:
        return (
            False,
            paired_path,
            "",
            "Jupytext paired file is required, but the server could not resolve a local path for this notebook.",
        )

    if nb_path.endswith(".ipynb"):
        exists = bool(paired_os_path) and os.path.isfile(paired_os_path)
        if exists:
            return True, paired_path, paired_os_path, ""
        message = (
            "Jupytext paired file not found. This extension requires a paired .py file.\n"
            f"Expected: {paired_os_path or paired_path or '<notebook>.py'}"
        )
        return False, paired_path, paired_os_path, message

    # Unknown/unsupported path types: block to avoid telling Codex to edit the wrong thing.
    return (
        False,
        paired_path,
        paired_os_path,
        "Jupytext paired workflow is required, but this file type is not supported.",
    )


def _capture_mtimes(paths: list[str]) -> Dict[str, float | None]:
    mtimes: Dict[str, float | None] = {}
    for path in paths:
        try:
            mtimes[path] = os.path.getmtime(path)
        except OSError:
            mtimes[path] = None
    return mtimes


def _has_path_changes(before: Dict[str, float | None], after: Dict[str, float | None]) -> bool:
    keys = set(before.keys()) | set(after.keys())
    for key in keys:
        if before.get(key) != after.get(key):
            return True
    return False
