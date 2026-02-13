import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Tuple


_TRUE_VALUES = {"1", "true", "y", "yes", "on"}
_FALSE_VALUES = {"0", "false", "n", "no", "off"}
_DEFAULT_SESSION_RETENTION_DAYS = 30
_DEFAULT_MAX_MESSAGE_CHARS = 12000

_SENSITIVE_PATTERNS = [
    (
        re.compile(
            r"(?i)(\b(?:api[\-_ ]?key|authorization|bearer|access[\-_ ]?token|secret|password)\b\s*[:=]\s*)([\"']?)[^\s\"';,]+"
        ),
        r"\1\2[REDACTED]\2",
    ),
    (re.compile(r"(?i)\b(?:gh[pousr]|ghr|ghs|ghl|ghu|github_pat_)[A-Za-z0-9]{20,}\b"), "[REDACTED_TOKEN]"),
    (re.compile(r"(?i)\b(?:sk|pk|xoxb|xoxp)_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)?\b"), "[REDACTED_TOKEN]"),
    (re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"), "[REDACTED_TOKEN]"),
]


class SessionStore:
    def __init__(self, base_dir: str | None = None):
        root = base_dir or os.path.join(os.path.expanduser("~"), ".jupyter", "codex-sessions")
        self._base = Path(root)
        self._logging_enabled = _as_bool(
            os.environ.get("JUPYTERLAB_CODEX_SESSION_LOGGING"), default=True
        )
        self._retention_days = _as_non_negative_int(
            os.environ.get("JUPYTERLAB_CODEX_SESSION_RETENTION_DAYS"), _DEFAULT_SESSION_RETENTION_DAYS
        )
        self._max_message_chars = _as_positive_int(
            os.environ.get("JUPYTERLAB_CODEX_SESSION_MAX_MESSAGE_CHARS"), _DEFAULT_MAX_MESSAGE_CHARS
        )
        if self._logging_enabled:
            self._base.mkdir(parents=True, exist_ok=True)
            self.prune_expired_sessions()

    def ensure_session(self, session_id: str, notebook_path: str, notebook_os_path: str = "") -> None:
        if not self._logging_enabled:
            return

        meta_path = self._meta_path(session_id)
        if meta_path.exists():
            return

        paired_path, paired_os_path = _derive_paired_paths(notebook_path, notebook_os_path)
        meta = {
            "session_id": session_id,
            "notebook_path": notebook_path,
            "notebook_os_path": notebook_os_path,
            "paired_path": paired_path,
            "paired_os_path": paired_os_path,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }
        meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    def append_message(self, session_id: str, role: str, content: str) -> None:
        if not self._logging_enabled:
            return

        record = {
            "role": role,
            "content": _sanitize_message(content, self._max_message_chars),
            "timestamp": _now_iso(),
        }
        with self._jsonl_path(session_id).open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record))
            handle.write("\n")
        self._touch_meta(session_id)
        self.prune_expired_sessions()

    def load_messages(self, session_id: str) -> List[Dict[str, str]]:
        if not self._logging_enabled:
            return []

        path = self._jsonl_path(session_id)
        if not path.exists():
            return []

        messages = []
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    messages.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        return messages

    def build_prompt(
        self,
        session_id: str,
        user_content: str,
        selection: str,
        cell_output: str,
        cwd: str | None = None,
    ) -> str:
        messages = self.load_messages(session_id)
        meta = self._load_meta(session_id)
        notebook_path = meta.get("notebook_path", "")
        notebook_os_path = meta.get("notebook_os_path", "")
        paired_path = meta.get("paired_path", "")
        paired_os_path = meta.get("paired_os_path", "")

        if not paired_path and not paired_os_path:
            paired_path, paired_os_path = _derive_paired_paths(notebook_path, notebook_os_path)

        parts = [
            "System: You are Codex running inside JupyterLab with file editing capabilities.",
            "System: The user is working in a Jupyter notebook environment.",
        ]

        if notebook_path:
            parts.append(f"System: Current notebook (Jupyter path): {notebook_path}")
        if notebook_os_path:
            parts.append(f"System: Current notebook (absolute path): {notebook_os_path}")
        if cwd:
            parts.append(f"System: Current working directory: {cwd}")

        if paired_os_path:
            parts.extend(
                [
                    f"System: Jupytext paired file (absolute path): {paired_os_path}",
                    f"System: IMPORTANT - Edit this file directly: {paired_os_path}",
                    "System: The notebook will prompt reload when the paired file changes on disk.",
                ]
            )
        elif paired_path:
            parts.extend(
                [
                    f"System: Jupytext paired file (Jupyter path): {paired_path}",
                    f"System: IMPORTANT - Edit this file directly: {paired_path}",
                    "System: The notebook will prompt reload when the paired file changes on disk.",
                ]
            )

        parts.extend(
            [
                "",
                "System: Instructions:",
                "System: 1. For code changes, modify the paired file directly using file editing tools.",
                "System: 2. Keep edits minimal and aligned with the user request.",
                "System: 3. The 'Current Cell Content' shows what the user is currently viewing/editing.",
                "System: 4. If you cannot proceed due to sandbox/permission restrictions, say so explicitly and ask the user to switch Permission (shield icon) to 'Full access' and retry. If authentication is required, tell them to run `codex login` in a terminal first.",
                "",
            ]
        )

        if messages:
            parts.append("Conversation:")
            for msg in messages:
                role = msg.get("role", "user")
                content = msg.get("content", "")
                parts.append(f"{role.title()}: {content}")
            parts.append("")

        if selection:
            parts.append("Current Cell Content:")
            parts.append(selection)
            parts.append("")

        if cell_output:
            parts.append("Current Cell Output:")
            parts.append(cell_output)
            parts.append("")

        parts.append("User:")
        parts.append(user_content)

        return "\n".join(parts)

    def get_notebook_path(self, session_id: str) -> str:
        meta = self._load_meta(session_id)
        return meta.get("notebook_path", "")

    def update_notebook_path(
        self, session_id: str, notebook_path: str, notebook_os_path: str = ""
    ) -> None:
        if not self._logging_enabled:
            return

        meta_path = self._meta_path(session_id)
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, IOError):
                meta = {}
        else:
            meta = {
                "session_id": session_id,
                "created_at": _now_iso(),
            }

        paired_path, paired_os_path = _derive_paired_paths(notebook_path, notebook_os_path)
        meta["notebook_path"] = notebook_path
        meta["notebook_os_path"] = notebook_os_path
        meta["paired_path"] = paired_path
        meta["paired_os_path"] = paired_os_path
        meta["updated_at"] = _now_iso()
        meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    def close_session(self, session_id: str) -> None:
        if not self._logging_enabled:
            return

        self._touch_meta(session_id)

    def _touch_meta(self, session_id: str) -> None:
        if not self._logging_enabled:
            return

        meta_path = self._meta_path(session_id)
        if not meta_path.exists():
            return

        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, IOError):
            return

        meta["updated_at"] = _now_iso()
        meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    def _load_meta(self, session_id: str) -> Dict[str, str]:
        if not self._logging_enabled:
            return {}

        meta_path = self._meta_path(session_id)
        if not meta_path.exists():
            return {}

        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, IOError):
            return {}

        return meta if isinstance(meta, dict) else {}

    def _jsonl_path(self, session_id: str) -> Path:
        return self._base / f"{session_id}.jsonl"

    def _meta_path(self, session_id: str) -> Path:
        return self._base / f"{session_id}.meta.json"

    def prune_expired_sessions(self) -> None:
        if not self._logging_enabled or self._retention_days <= 0:
            return

        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=self._retention_days)
        for path in self._base.glob("*.meta.json"):
            session_id = path.stem.removesuffix(".meta")
            try:
                meta = json.loads(path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, IOError):
                continue
            if not isinstance(meta, dict):
                continue

            updated_at = meta.get("updated_at") or meta.get("created_at")
            when = _parse_iso_datetime(updated_at)
            if not when:
                continue
            if when < cutoff:
                self._delete_session_files(session_id)

    def _delete_session_files(self, session_id: str) -> None:
        for path in (self._jsonl_path(session_id), self._meta_path(session_id)):
            try:
                path.unlink()
            except OSError:
                continue


def _derive_paired_paths(notebook_path: str, notebook_os_path: str) -> Tuple[str, str]:
    paired_path = ""
    paired_os_path = ""

    if notebook_path.endswith(".ipynb"):
        paired_path = notebook_path[:-6] + ".py"
    if notebook_os_path.endswith(".ipynb"):
        paired_os_path = notebook_os_path[:-6] + ".py"

    return paired_path, paired_os_path


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _as_bool(raw_value: str | None, default: bool) -> bool:
    if raw_value is None:
        return default
    value = raw_value.strip().lower()
    if value in _TRUE_VALUES:
        return True
    if value in _FALSE_VALUES:
        return False
    return default


def _as_positive_int(raw_value: str | None, default: int) -> int:
    if raw_value is None:
        return default
    try:
        parsed = int(raw_value)
    except ValueError:
        return default
    return parsed if parsed > 0 else default


def _as_non_negative_int(raw_value: str | None, default: int) -> int:
    if raw_value is None:
        return default
    try:
        parsed = int(raw_value)
    except ValueError:
        return default
    return parsed if parsed >= 0 else default


def _parse_iso_datetime(raw_value: str | None) -> datetime | None:
    if not raw_value:
        return None
    try:
        parsed = datetime.fromisoformat(raw_value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _sanitize_message(content: str, max_chars: int) -> str:
    return _truncate_text(_sanitize_sensitive_values(content), max_chars)


def _sanitize_sensitive_values(raw: str) -> str:
    sanitized = raw
    for pattern, replacement in _SENSITIVE_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)
    return sanitized


def _truncate_text(raw: str, max_chars: int) -> str:
    if not raw:
        return raw
    if max_chars <= 0:
        return ""
    if len(raw) <= max_chars:
        return raw
    if max_chars <= 3:
        return raw[:max_chars]
    return f"{raw[: max_chars - 3]}..."
