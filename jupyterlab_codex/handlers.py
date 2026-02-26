import asyncio
import base64
import hashlib
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
from .protocol import (
    ProtocolParseError,
    build_cli_defaults_payload,
    build_delete_all_payload,
    build_done_payload,
    build_error_payload,
    build_event_payload,
    build_output_payload,
    build_rate_limits_payload,
    build_status_payload,
    parse_client_message,
)


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

_AUTH_REQUIRED_HINT = (
    "Authentication required: open a terminal and run `codex` (or `codex login`) to sign in, then retry."
)
_RESUME_FALLBACK_HINT = (
    "Resume was unavailable for this turn. This turn was handled in fallback mode."
)
_PY_CELL_MARKER_RE = re.compile(r"^\s*#\s*%%(?:\s|$|\[)")
_PY_JUPYTEXT_HEADER_HINTS = (
    "jupytext:",
    "formats:",
    "format_name:",
    "text_representation:",
)


def _strip_noisy_stderr_lines(text: str) -> str:
    if not text:
        return ""

    lines = text.splitlines(keepends=True)
    kept = [
        line for line in lines if not any(pattern.search(line) for pattern in _NOISY_STDERR_PATTERNS)
    ]
    return "".join(kept)


def _is_missing_auth_stderr(text: str) -> bool:
    lower = (text or "").lower()
    if not lower:
        return False
    if "missing bearer or basic authentication" in lower:
        return True
    return "401 unauthorized" in lower and "api.openai.com" in lower


def _coerce_command_path(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()


def _coerce_session_context_key(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()


def _coerce_bool_flag(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "y", "yes", "on"}
    return False


def _coerce_ui_selection_preview(value: Any) -> Dict[str, str] | None:
    if not isinstance(value, dict):
        return None

    location_raw = value.get("locationLabel")
    preview_raw = value.get("previewText")
    if not isinstance(location_raw, str) or not isinstance(preview_raw, str):
        return None

    location = re.sub(r"\s+", " ", location_raw).strip()
    preview_text = preview_raw.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not location or not preview_text:
        return None

    return {
        "locationLabel": location[:80],
        "previewText": preview_text[:1000],
    }


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


class _ResumeFallbackRequested(Exception):
    """Raised when resume did not continue the requested thread."""


class CodexWSHandler(WebSocketHandler):
    def initialize(self, server_app):
        self._server_app = server_app
        self._runner = CodexRunner()
        self._store = SessionStore()
        self._active_runs: Dict[str, Dict[str, Any]] = {}

    def check_origin(self, origin: str) -> bool:
        return super().check_origin(origin)

    def open(self):
        self.write_message(json.dumps(build_status_payload(state="ready")))
        self._send_cli_defaults()
        self._send_model_catalog()
        self._send_rate_limits_snapshot()

    async def on_message(self, message: str):
        try:
            payload = json.loads(message)
        except json.JSONDecodeError:
            self.write_message(json.dumps(build_error_payload(message="Invalid JSON")))
            return

        try:
            msg_type, normalized_payload = parse_client_message(payload)
        except ProtocolParseError as exc:
            self.write_message(json.dumps(build_error_payload(message=str(exc))))
            return

        if msg_type == "start_session":
            await self._handle_start_session(normalized_payload)
            return

        if msg_type == "send":
            await self._handle_send(normalized_payload)
            return

        if msg_type == "delete_session":
            self._handle_delete_session(normalized_payload)
            return

        if msg_type == "delete_all_sessions":
            self._handle_delete_all_sessions(normalized_payload)
            return

        if msg_type == "cancel":
            await self._handle_cancel(normalized_payload)
            return

        if msg_type == "end_session":
            await self._handle_end_session(normalized_payload)
            return

        if msg_type == "refresh_rate_limits":
            self._send_rate_limits_snapshot(force=True)
            return

        self.write_message(json.dumps(build_error_payload(message="Unknown message type")))

    def _send_cli_defaults(self) -> None:
        try:
            defaults = load_cli_defaults_for_ui()
        except Exception:  # pragma: no cover - best-effort
            defaults = {"model": None, "reasoningEffort": None}

        try:
            self.write_message(json.dumps(build_cli_defaults_payload(**defaults)))
        except Exception:
            return

    def _send_model_catalog(self, command: str | None = None, force_refresh: bool = False) -> None:
        requested_command = _coerce_command_path(command)

        async def _send() -> None:
            models = await self._runner.list_available_models(
                command=requested_command or None, force_refresh=force_refresh
            )
            if not models:
                return
            try:
                self.write_message(json.dumps(build_cli_defaults_payload(available_models=models)))
            except Exception:
                return

        try:
            asyncio.create_task(_send())
        except Exception:
            return

    async def _handle_start_session(self, payload: Dict[str, Any]):
        requested_session_id = payload.get("sessionId") or ""
        if not isinstance(requested_session_id, str):
            requested_session_id = str(requested_session_id)
        requested_session_id = requested_session_id.strip()
        force_new_thread = _coerce_bool_flag(payload.get("forceNewThread"))
        requested_command_path = _coerce_command_path(payload.get("commandPath"))
        self._send_model_catalog(command=requested_command_path, force_refresh=force_new_thread)
        notebook_path = payload.get("notebookPath", "")
        if not isinstance(notebook_path, str):
            notebook_path = str(notebook_path)
        notebook_path = notebook_path.strip()
        session_context_key = _coerce_session_context_key(payload.get("sessionContextKey"))
        notebook_os_path = self._resolve_notebook_os_path(notebook_path)

        resolved_session_id = requested_session_id
        session_resolution = "client"
        session_resolution_notice = ""
        mapped_session_id = self._store.resolve_session_for_notebook(notebook_path, notebook_os_path)
        if force_new_thread:
            session_resolution = "force-new"
            previous_session_id = mapped_session_id
            if previous_session_id and previous_session_id != resolved_session_id:
                self._store.delete_session(previous_session_id)
            if not resolved_session_id:
                resolved_session_id = str(uuid.uuid4())
                session_resolution = "new"
        else:
            # Prefer the client-provided thread id when available, but validate
            # that it belongs to the current notebook before trusting it.
            if resolved_session_id:
                requested_matches_notebook = self._store.session_matches_notebook(
                    resolved_session_id, notebook_path, notebook_os_path
                )
                if requested_matches_notebook:
                    session_resolution = "client"
                else:
                    if mapped_session_id and mapped_session_id != resolved_session_id:
                        resolved_session_id = mapped_session_id
                        session_resolution = "mapping-on-mismatch"
                    else:
                        resolved_session_id = str(uuid.uuid4())
                        session_resolution = "new-on-mismatch"
                    session_resolution_notice = (
                        "Thread mismatch detected. Switched to a notebook-matched thread to avoid context loss."
                    )
            else:
                resolved_session_id = mapped_session_id or ""
                session_resolution = "mapping" if resolved_session_id else "new"
                if not resolved_session_id:
                    resolved_session_id = str(uuid.uuid4())

        self._store.ensure_session(resolved_session_id, notebook_path, notebook_os_path)
        if notebook_path:
            self._store.update_notebook_path(resolved_session_id, notebook_path, notebook_os_path)

        raw_history = self._store.load_messages(resolved_session_id)
        history = []
        for item in raw_history:
            role = item.get("role")
            content = item.get("content")
            if role not in {"user", "assistant", "system"}:
                continue
            if not isinstance(content, str):
                continue
            entry: Dict[str, Any] = {"role": role, "content": content}
            ui = item.get("ui")
            if isinstance(ui, dict):
                selection_preview = _coerce_ui_selection_preview(ui.get("selectionPreview"))
                if selection_preview:
                    entry["selectionPreview"] = selection_preview
            history.append(entry)

        paired_ok, paired_path, paired_os_path, paired_message, notebook_mode = _compute_pairing_status(
            notebook_path, notebook_os_path
        )
        effective_sandbox = load_effective_sandbox_for_thread(resolved_session_id)
        status_payload = build_status_payload(
            state="ready",
            session_id=resolved_session_id,
            notebook_path=notebook_path,
            session_context_key=session_context_key,
            session_resolution=session_resolution,
            session_resolution_notice=session_resolution_notice if session_resolution_notice else None,
            history=history,
            paired_ok=paired_ok,
            paired_path=paired_path,
            paired_os_path=paired_os_path,
            paired_message=paired_message,
            notebook_mode=notebook_mode,
            effective_sandbox=effective_sandbox,
        )
        self.write_message(json.dumps(status_payload))

    async def _handle_send(self, payload: Dict[str, Any]):
        session_id = payload.get("sessionId") or ""
        if not isinstance(session_id, str):
            session_id = str(session_id)
        session_id = session_id.strip() or str(uuid.uuid4())
        content = payload.get("content", "")
        session_context_key = _coerce_session_context_key(payload.get("sessionContextKey"))
        selection = payload.get("selection", "")
        if not isinstance(selection, str):
            selection = str(selection) if selection is not None else ""
        cell_output = payload.get("cellOutput", "")
        if not isinstance(cell_output, str):
            cell_output = str(cell_output) if cell_output is not None else ""
        ui_selection_preview = _coerce_ui_selection_preview(payload.get("uiSelectionPreview"))
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
            self.write_message(
                json.dumps(
                    build_error_payload(
                        message="Empty content",
                        run_id=run_id,
                        session_id=session_id,
                        session_context_key=session_context_key,
                        notebook_path=notebook_path,
                    )
                )
            )
            return
        if requested_model_raw and not requested_model:
            self.write_message(
                json.dumps(
                    build_error_payload(
                        message="Invalid model name",
                        run_id=run_id,
                        session_id=session_id,
                        session_context_key=session_context_key,
                        notebook_path=notebook_path,
                    )
                )
            )
            return
        if requested_reasoning_raw and not requested_reasoning:
            self.write_message(
                json.dumps(
                    build_error_payload(
                        message="Invalid reasoning level",
                        run_id=run_id,
                        session_id=session_id,
                        session_context_key=session_context_key,
                        notebook_path=notebook_path,
                    )
                )
            )
            return
        if requested_sandbox_raw and not requested_sandbox:
            self.write_message(
                json.dumps(
                    build_error_payload(
                        message="Invalid sandbox mode",
                        run_id=run_id,
                        session_id=session_id,
                        session_context_key=session_context_key,
                        notebook_path=notebook_path,
                    )
                )
            )
            return

        images: list[dict[str, str]] = []
        if images_payload:
            if not isinstance(images_payload, list):
                self.write_message(
                    json.dumps(
                        build_error_payload(
                            message="Invalid images payload",
                            run_id=run_id,
                            session_id=session_id,
                            session_context_key=session_context_key,
                            notebook_path=notebook_path,
                        )
                    )
                )
                return
            if len(images_payload) > _MAX_IMAGE_ATTACHMENTS:
                self.write_message(
                    json.dumps(
                        build_error_payload(
                            message="Too many images attached",
                            run_id=run_id,
                            session_id=session_id,
                            session_context_key=session_context_key,
                            notebook_path=notebook_path,
                        )
                    )
                )
                return
            for item in images_payload:
                if not isinstance(item, dict):
                    self.write_message(
                        json.dumps(
                            build_error_payload(
                                message="Invalid images payload",
                                run_id=run_id,
                                session_id=session_id,
                                session_context_key=session_context_key,
                                notebook_path=notebook_path,
                            )
                        )
                    )
                    return
                data_url = item.get("dataUrl")
                if not isinstance(data_url, str) or not data_url.strip():
                    self.write_message(
                        json.dumps(
                            build_error_payload(
                                message="Invalid images payload",
                                run_id=run_id,
                                session_id=session_id,
                                session_context_key=session_context_key,
                                notebook_path=notebook_path,
                            )
                        )
                    )
                    return
                name = item.get("name")
                images.append({"dataUrl": data_url, "name": name if isinstance(name, str) else ""})

        paired_ok, paired_path, paired_os_path, paired_message, notebook_mode = _compute_pairing_status(
            notebook_path, notebook_os_path
        )
        run_mode = "resume"

        def _build_status_payload(state: str) -> Dict[str, Any]:
            return build_status_payload(
                state=state,
                run_id=run_id,
                session_id=session_id,
                session_context_key=session_context_key,
                notebook_path=notebook_path,
                run_mode=run_mode,
                paired_ok=paired_ok,
                paired_path=paired_path,
                paired_os_path=paired_os_path,
                paired_message=paired_message,
                notebook_mode=notebook_mode,
                effective_sandbox=load_effective_sandbox_for_thread(session_id),
            )

        if not paired_ok:
            # Enforce paired workflow on the server as well (front-end can be bypassed).
            self.write_message(
                json.dumps(
                    build_error_payload(
                        run_id=run_id,
                        session_id=session_id,
                        session_context_key=session_context_key,
                        notebook_path=notebook_path,
                        message=(
                            paired_message
                            or "Jupytext paired file is required for this extension."
                        ),
                        run_mode=run_mode,
                        paired_ok=paired_ok,
                        paired_path=paired_path,
                        paired_os_path=paired_os_path,
                        paired_message=paired_message,
                        notebook_mode=notebook_mode,
                    )
                )
            )
            self.write_message(json.dumps(_build_status_payload("ready")))
            return

        self._store.ensure_session(session_id, notebook_path, notebook_os_path)
        if notebook_path:
            self._store.update_notebook_path(session_id, notebook_path, notebook_os_path)

        prior_messages = self._store.load_messages(session_id)
        has_conversation_history = any(
            isinstance(item, dict)
            and item.get("role") in {"user", "assistant"}
            and isinstance(item.get("content"), str)
            for item in prior_messages
        )
        is_first_turn = not has_conversation_history

        cwd = None
        if notebook_os_path:
            candidate = os.path.dirname(os.path.abspath(notebook_os_path))
            if candidate and os.path.isdir(candidate):
                cwd = candidate
        watch_paths = _refresh_watch_paths(notebook_os_path)
        before_file_signatures = _capture_file_signatures(watch_paths)

        prompt = self._store.build_prompt(
            session_id,
            content,
            selection,
            cell_output,
            cwd=cwd,
            notebook_mode=notebook_mode,
            include_history=False,
        )
        resume_target_session_id = None if is_first_turn else session_id

        async def _run():
            nonlocal run_mode
            self.write_message(
                json.dumps(_build_status_payload("running"))
            )

            temp_images_dir = None
            image_paths: list[str] = []
            assistant_buffer = []
            auth_hint_sent = False
            user_message_logged = False
            current_resume_session_id = resume_target_session_id

            def _append_user_message_once() -> None:
                nonlocal user_message_logged
                if user_message_logged:
                    return
                ui_payload = {"selectionPreview": ui_selection_preview} if ui_selection_preview else None
                self._store.append_message(session_id, "user", content, ui=ui_payload)
                user_message_logged = True

            async def on_event(event: Dict[str, Any]):
                nonlocal auth_hint_sent, session_id
                if event.get("type") == "thread.started":
                    thread_id_raw = event.get("thread_id")
                    if isinstance(thread_id_raw, str):
                        thread_id = thread_id_raw.strip()
                    else:
                        thread_id = ""
                    if (
                        current_resume_session_id
                        and thread_id
                        and thread_id != current_resume_session_id
                    ):
                        raise _ResumeFallbackRequested(
                            f"requested={current_resume_session_id}, started={thread_id}"
                        )
                    if thread_id and thread_id != session_id:
                        session_id = self._store.rename_session(session_id, thread_id)
                        run_context = self._active_runs.get(run_id)
                        if isinstance(run_context, dict):
                            run_context["sessionId"] = session_id
                        self.write_message(
                            json.dumps(_build_status_payload("running"))
                        )
                    return

                if event.get("type") == "stderr":
                    raw_stderr = event.get("text", "")
                    if isinstance(raw_stderr, str) and _is_missing_auth_stderr(raw_stderr):
                        if not auth_hint_sent:
                            auth_hint_sent = True
                            self.write_message(
                                json.dumps(
                                    build_output_payload(
                                        run_id=run_id,
                                        session_id=session_id,
                                        session_context_key=session_context_key,
                                        notebook_path=notebook_path,
                                        text=_AUTH_REQUIRED_HINT,
                                        role="system",
                                    )
                                )
                            )
                        return

                text = event_to_text(event)
                if text:
                    assistant_buffer.append(text)
                    self.write_message(
                        json.dumps(
                            build_output_payload(
                                run_id=run_id,
                                session_id=session_id,
                                session_context_key=session_context_key,
                                notebook_path=notebook_path,
                                text=text,
                            )
                        )
                    )
                elif event.get("type") == "stderr":
                    # Ignore filtered/no-op stderr chunks to avoid rendering them
                    # again via the generic "event" UI path.
                    return
                else:
                    self.write_message(
                        json.dumps(
                            build_event_payload(
                                run_id=run_id,
                                session_id=session_id,
                                session_context_key=session_context_key,
                                notebook_path=notebook_path,
                                payload=event,
                            )
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

                exit_code = None
                try:
                    exit_code = await self._runner.run(
                        prompt,
                        on_event,
                        cwd=cwd,
                        model=requested_model,
                        reasoning_effort=requested_reasoning,
                        sandbox=requested_sandbox,
                        command=requested_command_path,
                        images=image_paths,
                        resume_session_id=current_resume_session_id,
                    )
                except _ResumeFallbackRequested:
                    run_mode = "fallback"
                    current_resume_session_id = ""
                    assistant_buffer = []
                    self.write_message(
                        json.dumps(
                            build_output_payload(
                                run_id=run_id,
                                session_id=session_id,
                                session_context_key=session_context_key,
                                notebook_path=notebook_path,
                                text=_RESUME_FALLBACK_HINT,
                                role="system",
                            )
                        )
                    )
                    self.write_message(json.dumps(_build_status_payload("running")))
                    fallback_prompt = self._store.build_prompt(
                        session_id,
                        content,
                        selection,
                        cell_output,
                        cwd=cwd,
                        notebook_mode=notebook_mode,
                        include_history=True,
                    )
                    exit_code = await self._runner.run(
                        fallback_prompt,
                        on_event,
                        cwd=cwd,
                        model=requested_model,
                        reasoning_effort=requested_reasoning,
                        sandbox=requested_sandbox,
                        command=requested_command_path,
                        images=image_paths,
                        resume_session_id=None,
                    )
                if exit_code is None:
                    exit_code = 1
                if (
                    exit_code != 0
                    and current_resume_session_id
                    and not assistant_buffer
                    and not auth_hint_sent
                ):
                    run_mode = "fallback"
                    current_resume_session_id = ""
                    self.write_message(
                        json.dumps(
                            build_output_payload(
                                run_id=run_id,
                                session_id=session_id,
                                session_context_key=session_context_key,
                                notebook_path=notebook_path,
                                text=_RESUME_FALLBACK_HINT,
                                role="system",
                            )
                        )
                    )
                    self.write_message(json.dumps(_build_status_payload("running")))
                    fallback_prompt = self._store.build_prompt(
                        session_id,
                        content,
                        selection,
                        cell_output,
                        cwd=cwd,
                        notebook_mode=notebook_mode,
                        include_history=True,
                    )
                    assistant_buffer = []
                    exit_code = await self._runner.run(
                        fallback_prompt,
                        on_event,
                        cwd=cwd,
                        model=requested_model,
                        reasoning_effort=requested_reasoning,
                        sandbox=requested_sandbox,
                        command=requested_command_path,
                        images=image_paths,
                        resume_session_id=None,
                    )
                _append_user_message_once()
                if assistant_buffer:
                    self._store.append_message(session_id, "assistant", "".join(assistant_buffer))
                file_changed = _has_path_changes(before_file_signatures, _capture_file_signatures(watch_paths))
                self.write_message(
                    json.dumps(
                        build_done_payload(
                            run_id=run_id,
                            session_id=session_id,
                            session_context_key=session_context_key,
                            notebook_path=notebook_path,
                            exit_code=exit_code,
                            file_changed=file_changed,
                            run_mode=run_mode,
                            paired_ok=paired_ok,
                            paired_path=paired_path,
                            paired_os_path=paired_os_path,
                            paired_message=paired_message,
                            notebook_mode=notebook_mode,
                        )
                    )
                )
                self.write_message(
                    json.dumps(_build_status_payload("ready"))
                )
            except asyncio.CancelledError:
                _append_user_message_once()
                file_changed = _has_path_changes(before_file_signatures, _capture_file_signatures(watch_paths))
                self.write_message(
                    json.dumps(
                        build_done_payload(
                            run_id=run_id,
                            session_id=session_id,
                            session_context_key=session_context_key,
                            notebook_path=notebook_path,
                            exit_code=None,
                            file_changed=file_changed,
                            run_mode=run_mode,
                            paired_ok=paired_ok,
                            paired_path=paired_path,
                            paired_os_path=paired_os_path,
                            paired_message=paired_message,
                            notebook_mode=notebook_mode,
                            cancelled=True,
                        )
                    )
                )
                self.write_message(
                    json.dumps(_build_status_payload("ready"))
                )
                raise
            except FileNotFoundError:
                _append_user_message_once()
                hint = _build_command_not_found_hint(requested_command_path)
                self.write_message(
                    json.dumps(
                        build_error_payload(
                            run_id=run_id,
                            session_id=session_id,
                            session_context_key=session_context_key,
                            notebook_path=notebook_path,
                            message=hint["message"],
                            run_mode=run_mode,
                            suggested_command_path=hint.get("suggestedCommandPath"),
                            paired_ok=paired_ok,
                            paired_path=paired_path,
                            paired_os_path=paired_os_path,
                            paired_message=paired_message,
                            notebook_mode=notebook_mode,
                        )
                    )
                )
                self.write_message(
                    json.dumps(_build_status_payload("ready"))
                )
            except Exception as exc:  # pragma: no cover - defensive path
                _append_user_message_once()
                self.write_message(
                    json.dumps(
                        build_error_payload(
                            run_id=run_id,
                            session_id=session_id,
                            session_context_key=session_context_key,
                            notebook_path=notebook_path,
                            message=str(exc),
                            run_mode=run_mode,
                            paired_ok=paired_ok,
                            paired_path=paired_path,
                            paired_os_path=paired_os_path,
                            paired_message=paired_message,
                            notebook_mode=notebook_mode,
                        )
                    )
                )
                self.write_message(
                    json.dumps(_build_status_payload("ready"))
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
            "sessionContextKey": session_context_key,
        }

    def _handle_delete_session(self, payload: Dict[str, Any]) -> None:
        session_id = payload.get("sessionId")
        if not isinstance(session_id, str):
            session_id = str(session_id) if session_id else ""
        session_id = session_id.strip()
        if session_id:
            self._store.delete_session(session_id)

    def _handle_delete_all_sessions(self, payload: Dict[str, Any]) -> None:
        del payload
        try:
            deleted_count, failed_count = self._store.delete_all_sessions()
            ok = failed_count == 0
            message = (
                f"Deleted {deleted_count} conversations" if deleted_count else "No conversations found to delete"
            )
            if failed_count:
                message = f"Deleted {deleted_count} conversations, failed to delete {failed_count}"
        except Exception as exc:  # pragma: no cover - defensive path
            ok = False
            deleted_count = 0
            failed_count = 1
            message = str(exc)

        try:
            self.write_message(
                json.dumps(
                    build_delete_all_payload(
                        ok=ok,
                        deleted_count=deleted_count,
                        failed_count=failed_count,
                        message=message,
                    )
                )
            )
        except Exception:
            return

    def _send_rate_limits_snapshot(self, force: bool = False) -> None:
        try:
            snapshot = load_latest_rate_limits(force=force)
        except Exception:  # pragma: no cover - best-effort telemetry
            snapshot = None

        try:
            self.write_message(json.dumps(build_rate_limits_payload(snapshot)))
        except Exception:
            # Socket may already be closed; ignore.
            return

    async def _handle_cancel(self, payload: Dict[str, Any]):
        run_id = payload.get("runId")
        run_context = self._active_runs.get(run_id)

        if not run_context:
            self.write_message(
                json.dumps(
                    build_error_payload(
                        run_id=run_id,
                        message="Run not found",
                    )
                )
            )
            return

        task = run_context["task"]
        task.cancel()
        session_context_key = _coerce_session_context_key(run_context.get("sessionContextKey"))
        session_id = run_context["sessionId"]
        status_payload = build_status_payload(
            state="ready",
            run_id=run_id,
            session_id=session_id,
            session_context_key=session_context_key,
            notebook_path=run_context["notebookPath"],
            effective_sandbox=load_effective_sandbox_for_thread(session_id),
        )
        self.write_message(json.dumps(status_payload))

    async def _handle_end_session(self, payload: Dict[str, Any]):
        session_id = payload.get("sessionId")
        if session_id:
            self._store.close_session(session_id)
        self.write_message(json.dumps(build_status_payload(state="ready")))

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
_EFFECTIVE_SANDBOX_CACHE_TTL_SECONDS = 5.0
_EFFECTIVE_SANDBOX_CACHE: Dict[str, Dict[str, Any]] = {}


def load_effective_sandbox_for_thread(thread_id: str, force: bool = False) -> str | None:
    normalized_thread_id = (thread_id or "").strip()
    if not normalized_thread_id:
        return None

    now = time.time()
    cached = _EFFECTIVE_SANDBOX_CACHE.get(normalized_thread_id)
    if (
        not force
        and isinstance(cached, dict)
        and isinstance(cached.get("fetched_at"), (int, float))
        and now - float(cached["fetched_at"]) < _EFFECTIVE_SANDBOX_CACHE_TTL_SECONDS
    ):
        cached_mode = cached.get("mode")
        return cached_mode if isinstance(cached_mode, str) else None

    mode = _scan_effective_sandbox_for_thread(normalized_thread_id)
    _EFFECTIVE_SANDBOX_CACHE[normalized_thread_id] = {"fetched_at": now, "mode": mode}
    return mode


def _scan_effective_sandbox_for_thread(thread_id: str) -> str | None:
    base = Path(os.path.expanduser("~")) / ".codex" / "sessions"
    if not base.is_dir():
        return None

    pattern = f"rollout-*{thread_id}.jsonl"
    candidates: list[tuple[float, Path]] = []
    for path in base.rglob(pattern):
        try:
            candidates.append((path.stat().st_mtime, path))
        except OSError:
            continue
    candidates.sort(key=lambda item: item[0], reverse=True)

    for _mtime, path in candidates[:8]:
        mode = _extract_effective_sandbox_from_rollout_file(path)
        if mode:
            return mode
    return None


def _extract_effective_sandbox_from_rollout_file(path: Path) -> str | None:
    tail = _read_file_tail(path, max_bytes=512 * 1024)
    if not tail:
        return None

    for line in reversed(tail.splitlines()):
        text = line.strip()
        if not text or "sandbox" not in text:
            continue
        try:
            obj = json.loads(text)
        except json.JSONDecodeError:
            continue

        mode = _extract_effective_sandbox_from_rollout_event(obj)
        if mode:
            return mode
    return None


def _extract_effective_sandbox_from_rollout_event(obj: Dict[str, Any]) -> str | None:
    turn_context_payload: Dict[str, Any] | None = None

    if obj.get("type") == "event_msg":
        payload = obj.get("payload")
        if isinstance(payload, dict) and payload.get("type") == "turn_context":
            nested_payload = payload.get("payload")
            if isinstance(nested_payload, dict):
                turn_context_payload = nested_payload
    elif obj.get("type") == "turn_context":
        payload = obj.get("payload")
        if isinstance(payload, dict):
            turn_context_payload = payload

    if turn_context_payload is None:
        payload = obj.get("payload")
        if isinstance(payload, dict) and payload.get("type") == "turn_context":
            nested_payload = payload.get("payload")
            if isinstance(nested_payload, dict):
                turn_context_payload = nested_payload

    if not isinstance(turn_context_payload, dict):
        return None

    sandbox_policy = turn_context_payload.get("sandbox_policy")
    if not isinstance(sandbox_policy, dict):
        sandbox_policy = turn_context_payload.get("sandboxPolicy")
    if not isinstance(sandbox_policy, dict):
        return None

    mode = sandbox_policy.get("type")
    if mode is None:
        mode = sandbox_policy.get("mode")
    return _coerce_effective_sandbox_mode(mode)


def _coerce_effective_sandbox_mode(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower().replace("_", "-")
    return _sanitize_sandbox_mode(normalized)


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
        "contextWindow": _coerce_context_window_snapshot(payload.get("info")),
    }


def _coerce_rate_limit_window(window: Dict[str, Any]) -> Dict[str, Any]:
    used = _coerce_number(_pick(window, "used_percent", "usedPercent"))
    window_mins = _coerce_int(
        _pick(window, "window_minutes", "windowDurationMins", "window_duration_mins")
    )
    resets_at = _coerce_int(_pick(window, "resets_at", "resetsAt"))
    return {"usedPercent": used, "windowMinutes": window_mins, "resetsAt": resets_at}


def _coerce_context_window_snapshot(info: Any) -> Dict[str, Any] | None:
    if not isinstance(info, dict):
        return None

    window_tokens = _coerce_int(_pick(info, "model_context_window", "modelContextWindow"))
    if window_tokens is not None and window_tokens < 0:
        window_tokens = None

    last_usage = info.get("last_token_usage")
    if not isinstance(last_usage, dict):
        last_usage = info.get("lastTokenUsage")
    total_usage = info.get("total_token_usage")
    if not isinstance(total_usage, dict):
        total_usage = info.get("totalTokenUsage")

    used_tokens: int | None = None
    if isinstance(last_usage, dict):
        used_tokens = _coerce_int(_pick(last_usage, "input_tokens", "inputTokens"))
    if used_tokens is None and isinstance(total_usage, dict):
        used_tokens = _coerce_int(_pick(total_usage, "input_tokens", "inputTokens"))
    if used_tokens is not None and used_tokens < 0:
        used_tokens = 0

    left_tokens: int | None = None
    used_percent: float | None = None
    if window_tokens is not None and used_tokens is not None:
        used_tokens = min(used_tokens, window_tokens)
        left_tokens = max(0, window_tokens - used_tokens)
        if window_tokens > 0:
            used_percent = (used_tokens / window_tokens) * 100.0
        else:
            used_percent = 0.0

    if window_tokens is None and used_tokens is None and left_tokens is None:
        return None

    return {
        "windowTokens": window_tokens,
        "usedTokens": used_tokens,
        "leftTokens": left_tokens,
        "usedPercent": used_percent,
    }


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
    if not re.fullmatch(r"[a-z][a-z0-9._-]*", effort):
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
    ext = ext.lower()
    paths = [absolute]
    if ext == ".ipynb":
        paths.append(f"{root}.py")
    elif ext == ".py":
        paths.append(f"{root}.ipynb")
    return paths


def _read_file_prefix_lines(
    path: str,
    *,
    max_lines: int = 240,
    max_chars: int = 128_000,
) -> list[str]:
    if not path:
        return []

    lines: list[str] = []
    total_chars = 0
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as handle:
            for _ in range(max_lines):
                line = handle.readline()
                if not line:
                    break
                lines.append(line)
                total_chars += len(line)
                if total_chars >= max_chars:
                    break
    except OSError:
        return []

    return lines


def _has_jupytext_yaml_header(lines: list[str]) -> bool:
    if not lines:
        return False

    idx = 0
    while idx < len(lines) and not lines[idx].strip():
        idx += 1
    if idx >= len(lines) or lines[idx].strip() != "# ---":
        return False

    header_lines: list[str] = []
    for line in lines[idx + 1 : idx + 120]:
        stripped = line.strip()
        if stripped == "# ---":
            break
        # Jupytext YAML headers are comment blocks. Abort if code appears before closing marker.
        if stripped and not line.lstrip().startswith("#"):
            return False
        header_lines.append(line)

    if not header_lines:
        return False

    normalized = "\n".join(part.lstrip("#").strip().lower() for part in header_lines)
    return any(hint in normalized for hint in _PY_JUPYTEXT_HEADER_HINTS)


def _detect_python_notebook_mode(notebook_os_path: str) -> str:
    lines = _read_file_prefix_lines(notebook_os_path)
    if not lines:
        return "plain_py"

    if _has_jupytext_yaml_header(lines):
        return "jupytext_py"

    if any(_PY_CELL_MARKER_RE.match(line) for line in lines):
        return "jupytext_py"

    return "plain_py"


def _compute_pairing_status(notebook_path: str, notebook_os_path: str) -> tuple[bool, str, str, str, str]:
    """
    Determine run gating status and notebook mode.

    Supported modes:
    - ipynb: requires a paired .py file to exist.
    - jupytext_py: .py file with Jupytext metadata/cell markers.
    - plain_py: regular .py script opened as a notebook.
    """
    nb_path = (notebook_path or "").strip()
    nb_os_path = (notebook_os_path or "").strip()
    nb_path_lower = nb_path.lower()
    nb_os_path_lower = nb_os_path.lower()

    paired_path = ""
    if nb_path_lower.endswith(".ipynb"):
        paired_path = nb_path[:-6] + ".py"
    elif nb_path_lower.endswith(".py"):
        paired_path = nb_path[:-3] + ".ipynb"

    paired_os_path = ""
    if nb_os_path_lower.endswith(".ipynb"):
        paired_os_path = nb_os_path[:-6] + ".py"
    elif nb_os_path_lower.endswith(".py"):
        paired_os_path = nb_os_path[:-3] + ".ipynb"

    # If we cannot resolve OS paths (e.g. non-local content manager), be conservative and block.
    if (nb_path_lower.endswith(".ipynb") or nb_os_path_lower.endswith(".ipynb")) and not paired_os_path:
        return (
            False,
            paired_path,
            "",
            "Jupytext paired file is required, but the server could not resolve a local path for this notebook.",
            "ipynb",
        )

    if nb_path_lower.endswith(".ipynb") or nb_os_path_lower.endswith(".ipynb"):
        exists = bool(paired_os_path) and os.path.isfile(paired_os_path)
        if exists:
            return True, paired_path, paired_os_path, "", "ipynb"
        message = (
            "Jupytext paired file not found. This extension requires a paired .py file.\n"
            f"Expected: {paired_os_path or paired_path or '<notebook>.py'}"
        )
        return False, paired_path, paired_os_path, message, "ipynb"

    if nb_path_lower.endswith(".py") or nb_os_path_lower.endswith(".py"):
        notebook_mode = _detect_python_notebook_mode(nb_os_path)
        return True, paired_path, paired_os_path, "", notebook_mode

    # Unknown/unsupported path types: block to avoid telling Codex to edit the wrong thing.
    return (
        False,
        paired_path,
        paired_os_path,
        "Only .ipynb and .py notebook documents are supported.",
        "unsupported",
    )


def _capture_file_signatures(paths: list[str]) -> Dict[str, str | None]:
    signatures: Dict[str, str | None] = {}
    for path in paths:
        try:
            digest = hashlib.sha256()
            with open(path, "rb") as handle:
                for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                    digest.update(chunk)
            signatures[path] = digest.hexdigest()
        except OSError:
            signatures[path] = None
    return signatures


def _has_path_changes(before: Dict[str, str | None], after: Dict[str, str | None]) -> bool:
    keys = set(before.keys()) | set(after.keys())
    for key in keys:
        if before.get(key) != after.get(key):
            return True
    return False
