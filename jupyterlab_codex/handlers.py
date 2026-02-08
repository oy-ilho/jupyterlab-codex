import asyncio
import json
import os
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

from tornado.websocket import WebSocketHandler

from .runner import CodexRunner
from .sessions import SessionStore


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

    async def _handle_start_session(self, payload: Dict[str, Any]):
        session_id = payload.get("sessionId") or str(uuid.uuid4())
        notebook_path = payload.get("notebookPath", "")
        notebook_os_path = self._resolve_notebook_os_path(notebook_path)

        self._store.ensure_session(session_id, notebook_path, notebook_os_path)
        if notebook_path:
            self._store.update_notebook_path(session_id, notebook_path, notebook_os_path)

        self.write_message(
            json.dumps(
                {
                    "type": "status",
                    "state": "ready",
                    "sessionId": session_id,
                    "notebookPath": notebook_path,
                }
            )
        )

    async def _handle_send(self, payload: Dict[str, Any]):
        session_id = payload.get("sessionId") or str(uuid.uuid4())
        content = payload.get("content", "")
        selection = payload.get("selection", "")
        notebook_path = payload.get("notebookPath", "")
        requested_model_raw = payload.get("model")
        requested_model = _sanitize_model_name(requested_model_raw)
        requested_reasoning_raw = payload.get("reasoningEffort")
        requested_reasoning = _sanitize_reasoning_effort(requested_reasoning_raw)
        notebook_os_path = self._resolve_notebook_os_path(notebook_path)
        run_id = str(uuid.uuid4())

        if not content:
            self.write_message(json.dumps({"type": "error", "message": "Empty content"}))
            return
        if requested_model_raw and not requested_model:
            self.write_message(json.dumps({"type": "error", "message": "Invalid model name"}))
            return
        if requested_reasoning_raw and not requested_reasoning:
            self.write_message(json.dumps({"type": "error", "message": "Invalid reasoning level"}))
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

        prompt = self._store.build_prompt(session_id, content, selection, cwd=cwd)
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
                    }
                )
            )

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
                exit_code = await self._runner.run(
                    prompt,
                    on_event,
                    cwd=cwd,
                    model=requested_model,
                    reasoning_effort=requested_reasoning,
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
                        }
                    )
                )
                raise
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
                        }
                    )
                )
            finally:
                # Rate limits are recorded by the Codex Desktop app/CLI in ~/.codex/sessions/*.
                # Reading the latest snapshot here lets the UI surface "Session" / "Weekly" usage.
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
