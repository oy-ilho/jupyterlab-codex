from __future__ import annotations

from typing import Any, Dict, Literal, Tuple

ProtocolVersion = Literal["1.0.0"]

PROTOCOL_VERSION: ProtocolVersion = "1.0.0"


class ProtocolParseError(ValueError):
    """Raised when an incoming client payload cannot be interpreted."""


def _coerce_string(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "y", "yes", "on"}
    return False


def parse_client_message(raw: Any) -> Tuple[str, Dict[str, Any]]:
    """
    Parse and normalize incoming websocket payloads.

    Returns (msg_type, payload) with normalized string/bool fields.
    """
    if not isinstance(raw, dict):
        raise ProtocolParseError("Invalid message payload")

    msg_type = raw.get("type")
    if msg_type == "start_session":
        return (
            "start_session",
            {
                "sessionId": _coerce_string(raw.get("sessionId")),
                "notebookPath": _coerce_string(raw.get("notebookPath")),
                "sessionContextKey": _coerce_string(raw.get("sessionContextKey")),
                "forceNewThread": _coerce_bool(raw.get("forceNewThread")),
                "commandPath": _coerce_string(raw.get("commandPath")),
            },
        )

    if msg_type == "send":
        return (
            "send",
            {
                "sessionId": _coerce_string(raw.get("sessionId")),
                "sessionContextKey": _coerce_string(raw.get("sessionContextKey")),
                "content": _coerce_string(raw.get("content")),
                "notebookPath": _coerce_string(raw.get("notebookPath")),
                "commandPath": _coerce_string(raw.get("commandPath")),
                "model": _coerce_string(raw.get("model")),
                "reasoningEffort": _coerce_string(raw.get("reasoningEffort")),
                "sandbox": _coerce_string(raw.get("sandbox")),
                "selection": _coerce_string(raw.get("selection")),
                "cellOutput": _coerce_string(raw.get("cellOutput")),
                "images": raw.get("images") if isinstance(raw.get("images"), list) else [],
                "uiSelectionPreview": raw.get("uiSelectionPreview"),
            },
        )

    if msg_type == "delete_session":
        return ("delete_session", {"sessionId": _coerce_string(raw.get("sessionId"))})

    if msg_type == "delete_all_sessions":
        return ("delete_all_sessions", {})

    if msg_type == "cancel":
        return ("cancel", {"runId": _coerce_string(raw.get("runId"))})

    if msg_type == "end_session":
        return ("end_session", {"sessionId": _coerce_string(raw.get("sessionId"))})

    if msg_type == "refresh_rate_limits":
        return ("refresh_rate_limits", {})

    raise ProtocolParseError("Unknown message type")


def _build_base_message(msg_type: str) -> Dict[str, Any]:
    return {"type": msg_type, "protocolVersion": PROTOCOL_VERSION}


def build_cli_defaults_payload(
    *,
    model: str | None = None,
    reasoning_effort: str | None = None,
    available_models: list[dict[str, Any]] | None = None,
) -> Dict[str, Any]:
    payload = _build_base_message("cli_defaults")
    if model is not None:
        payload["model"] = model
    if reasoning_effort is not None:
        payload["reasoningEffort"] = reasoning_effort
    if available_models is not None:
        payload["availableModels"] = available_models
    return payload


def build_status_payload(
    *,
    state: str,
    run_id: str | None = None,
    session_id: str | None = None,
    session_context_key: str | None = None,
    notebook_path: str | None = None,
    run_mode: str | None = None,
    paired_ok: bool | None = None,
    paired_path: str = "",
    paired_os_path: str = "",
    paired_message: str = "",
    notebook_mode: str = "",
    effective_sandbox: str | None = None,
    history: list[dict[str, Any]] | None = None,
    session_resolution: str | None = None,
    session_resolution_notice: str | None = None,
) -> Dict[str, Any]:
    payload = _build_base_message("status")
    payload["state"] = state

    if run_id:
        payload["runId"] = run_id
    if session_id:
        payload["sessionId"] = session_id
    if session_context_key:
        payload["sessionContextKey"] = session_context_key
    if notebook_path:
        payload["notebookPath"] = notebook_path
    if run_mode:
        payload["runMode"] = run_mode
    if paired_ok is not None:
        payload["pairedOk"] = paired_ok
    if paired_path:
        payload["pairedPath"] = paired_path
    if paired_os_path:
        payload["pairedOsPath"] = paired_os_path
    if paired_message:
        payload["pairedMessage"] = paired_message
    if notebook_mode:
        payload["notebookMode"] = notebook_mode
    if history is not None:
        payload["history"] = history
    if session_resolution is not None:
        payload["sessionResolution"] = session_resolution
    if session_resolution_notice:
        payload["sessionResolutionNotice"] = session_resolution_notice
    if effective_sandbox:
        payload["effectiveSandbox"] = effective_sandbox
    return payload


def build_output_payload(
    *,
    run_id: str,
    session_id: str,
    session_context_key: str,
    notebook_path: str,
    text: str,
    role: str = "assistant",
) -> Dict[str, Any]:
    return _build_base_message("output") | {
        "runId": run_id,
        "sessionId": session_id,
        "sessionContextKey": session_context_key,
        "notebookPath": notebook_path,
        "text": text,
        "role": role,
    }


def build_event_payload(
    *,
    run_id: str,
    session_id: str,
    session_context_key: str,
    notebook_path: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    return _build_base_message("event") | {
        "runId": run_id,
        "sessionId": session_id,
        "sessionContextKey": session_context_key,
        "notebookPath": notebook_path,
        "payload": payload,
    }


def build_done_payload(
    *,
    run_id: str,
    session_id: str,
    session_context_key: str,
    notebook_path: str,
    exit_code: int | None,
    file_changed: bool,
    run_mode: str,
    paired_ok: bool,
    paired_path: str,
    paired_os_path: str,
    paired_message: str,
    notebook_mode: str,
    cancelled: bool = False,
) -> Dict[str, Any]:
    payload = _build_base_message("done") | {
        "runId": run_id,
        "sessionId": session_id,
        "sessionContextKey": session_context_key,
        "notebookPath": notebook_path,
        "exitCode": exit_code,
        "fileChanged": file_changed,
        "runMode": run_mode,
        "pairedOk": paired_ok,
    }
    payload["pairedPath"] = paired_path
    payload["pairedOsPath"] = paired_os_path
    payload["pairedMessage"] = paired_message
    payload["notebookMode"] = notebook_mode
    if cancelled:
        payload["cancelled"] = True
    return payload


def build_error_payload(
    *,
    run_id: str | None = None,
    session_id: str | None = None,
    session_context_key: str = "",
    notebook_path: str = "",
    message: str,
    run_mode: str | None = None,
    suggested_command_path: str | None = None,
    paired_ok: bool | None = None,
    paired_path: str = "",
    paired_os_path: str = "",
    paired_message: str = "",
    notebook_mode: str = "",
) -> Dict[str, Any]:
    payload = _build_base_message("error")
    if run_id:
        payload["runId"] = run_id
    if session_id:
        payload["sessionId"] = session_id
    if session_context_key:
        payload["sessionContextKey"] = session_context_key
    if notebook_path:
        payload["notebookPath"] = notebook_path
    payload["message"] = message
    if run_mode is not None:
        payload["runMode"] = run_mode
    if suggested_command_path:
        payload["suggestedCommandPath"] = suggested_command_path
    if paired_ok is not None:
        payload["pairedOk"] = paired_ok
    if paired_path:
        payload["pairedPath"] = paired_path
    if paired_os_path:
        payload["pairedOsPath"] = paired_os_path
    if paired_message:
        payload["pairedMessage"] = paired_message
    if notebook_mode:
        payload["notebookMode"] = notebook_mode
    return payload


def build_rate_limits_payload(snapshot: Any) -> Dict[str, Any]:
    return _build_base_message("rate_limits") | {"snapshot": snapshot}


def build_delete_all_payload(
    *,
    ok: bool,
    deleted_count: int,
    failed_count: int,
    message: str,
) -> Dict[str, Any]:
    payload = _build_base_message("delete_all_sessions")
    payload["ok"] = ok
    payload["deletedCount"] = deleted_count
    payload["failedCount"] = failed_count
    payload["message"] = message
    return payload
