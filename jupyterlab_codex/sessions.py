import json
import os
import re
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple
from uuid import uuid4


_TRUE_VALUES = {"1", "true", "y", "yes", "on"}
_FALSE_VALUES = {"0", "false", "n", "no", "off"}
_DEFAULT_SESSION_RETENTION_DAYS = 30
_DEFAULT_SESSION_MAX_MESSAGES = 300
_DEFAULT_SESSION_MAX_BYTES = 2_000_000
_DEFAULT_SESSION_PRUNE_INTERVAL_MINUTES = 15
_DEFAULT_MAX_MESSAGE_CHARS = 12000
_DEFAULT_UI_LABEL_MAX_CHARS = 80
_DEFAULT_UI_PREVIEW_MAX_CHARS = 500
_DEFAULT_UI_PREVIEW_MAX_ITEMS_PER_SESSION = 10
_SESSION_FILE_VERSION = 1

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
    """Session persistence with bounded growth and recoverable file handling."""

    _file_lock = threading.RLock()

    def __init__(self, base_dir: str | None = None):
        root = base_dir or os.path.join(os.path.expanduser("~"), ".jupyter", "codex-sessions")
        self._base = Path(root)
        self._logging_enabled = _as_bool(
            os.environ.get("JUPYTERLAB_CODEX_SESSION_LOGGING"), default=True
        )
        self._retention_days = _as_non_negative_int(
            os.environ.get("JUPYTERLAB_CODEX_SESSION_RETENTION_DAYS"),
            _DEFAULT_SESSION_RETENTION_DAYS,
        )
        self._max_message_chars = _as_positive_int(
            os.environ.get("JUPYTERLAB_CODEX_SESSION_MAX_MESSAGE_CHARS"), _DEFAULT_MAX_MESSAGE_CHARS
        )
        self._max_messages_per_session = _as_positive_int(
            os.environ.get("JUPYTERLAB_CODEX_SESSION_MAX_MESSAGES"),
            _DEFAULT_SESSION_MAX_MESSAGES,
        )
        self._max_session_bytes = _as_non_negative_int(
            os.environ.get("JUPYTERLAB_CODEX_SESSION_MAX_BYTES"),
            _DEFAULT_SESSION_MAX_BYTES,
        )
        self._prune_interval = timedelta(
            minutes=_as_positive_int(
                os.environ.get("JUPYTERLAB_CODEX_SESSION_PRUNE_INTERVAL_MINUTES"),
                _DEFAULT_SESSION_PRUNE_INTERVAL_MINUTES,
            )
        )
        self._last_global_prune = datetime.min.replace(tzinfo=timezone.utc)

        if self._logging_enabled:
            self._base.mkdir(parents=True, exist_ok=True)
            with self._file_lock:
                self._prune_expired_sessions_locked()

    def ensure_session(self, session_id: str, notebook_path: str, notebook_os_path: str = "") -> None:
        if not self._logging_enabled:
            return
        if not session_id:
            return

        existing_meta = self._load_meta(session_id)
        if existing_meta:
            return

        paired_path, paired_os_path = _derive_paired_paths(notebook_path, notebook_os_path)
        meta = {
            "schema_version": _SESSION_FILE_VERSION,
            "session_id": session_id,
            "notebook_path": notebook_path,
            "notebook_os_path": notebook_os_path,
            "paired_path": paired_path,
            "paired_os_path": paired_os_path,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
            "retention_days": self._retention_days,
            "max_messages_per_session": self._max_messages_per_session,
        }
        with self._file_lock:
            self._write_meta_atomic(self._meta_path(session_id), meta)

    def append_message(
        self, session_id: str, role: str, content: str, ui: Dict[str, Any] | None = None
    ) -> None:
        if not self._logging_enabled:
            return
        if not session_id:
            return

        normalized_role = role if role in {"system", "user", "assistant"} else "system"
        record = {
            "role": normalized_role,
            "content": _sanitize_message(content, self._max_message_chars),
            "timestamp": _now_iso(),
        }
        ui_payload = _sanitize_ui_payload(ui)
        if ui_payload:
            record["ui"] = ui_payload

        with self._file_lock:
            path = self._jsonl_path(session_id)
            try:
                with path.open("a", encoding="utf-8") as handle:
                    handle.write(json.dumps(record))
                    handle.write("\n")
            except OSError:
                return

            self._touch_meta_locked(session_id)
            self._enforce_session_limits_locked(session_id)
            if self._is_global_prune_due():
                self._prune_expired_sessions_locked()

    def load_messages(self, session_id: str) -> List[Dict[str, Any]]:
        if not self._logging_enabled:
            return []
        if not session_id:
            return []

        path = self._jsonl_path(session_id)
        if not path.exists():
            return []

        messages: List[Dict[str, Any]] = []
        with self._file_lock:
            try:
                with path.open("r", encoding="utf-8") as handle:
                    for line in handle:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            payload = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        if isinstance(payload, dict):
                            messages.append(payload)
            except OSError:
                return []
        return messages

    def _prune_user_ui_previews(self, session_id: str, keep_latest: int) -> None:
        if keep_latest <= 0:
            return
        with self._file_lock:
            self._trim_session_records_locked(session_id, keep_ui_previews=keep_latest)

    def build_prompt(
        self,
        session_id: str,
        user_content: str,
        selection: str,
        cell_output: str,
        cwd: str | None = None,
        notebook_mode: str = "",
        include_history: bool = True,
    ) -> str:
        messages = self.load_messages(session_id) if include_history else []
        meta = self._load_meta(session_id)
        notebook_path = meta.get("notebook_path", "")
        notebook_os_path = meta.get("notebook_os_path", "")
        paired_path = meta.get("paired_path", "")
        paired_os_path = meta.get("paired_os_path", "")
        mode = _normalize_notebook_mode(notebook_mode, notebook_path, notebook_os_path)

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

        if mode == "ipynb" and paired_os_path:
            parts.extend(
                [
                    f"System: Jupytext paired file (absolute path): {paired_os_path}",
                    f"System: IMPORTANT - Edit this file directly: {paired_os_path}",
                    "System: The notebook will prompt reload when the paired file changes on disk.",
                ]
            )
        elif mode == "ipynb" and paired_path:
            parts.extend(
                [
                    f"System: Jupytext paired file (Jupyter path): {paired_path}",
                    f"System: IMPORTANT - Edit this file directly: {paired_path}",
                    "System: The notebook will prompt reload when the paired file changes on disk.",
                ]
            )
        elif mode == "jupytext_py":
            target = notebook_os_path or notebook_path or "<notebook>.py"
            parts.extend(
                [
                    "System: Current file mode: Jupytext Python notebook script (.py).",
                    f"System: IMPORTANT - Edit this file directly: {target}",
                ]
            )
        elif mode == "plain_py":
            target = notebook_os_path or notebook_path or "<script>.py"
            parts.extend(
                [
                    "System: Current file mode: Plain Python script (.py).",
                    f"System: IMPORTANT - Edit this file directly: {target}",
                ]
            )

        if mode == "ipynb":
            instructions = [
                "System: 1. For code changes, modify the paired file directly using file editing tools.",
                "System: 2. Keep edits minimal and aligned with the user request.",
                "System: 3. The 'Current Cell Content' shows what the user is currently viewing/editing.",
                "System: 4. If you cannot proceed due to sandbox/permission restrictions, say so explicitly and ask the user to switch Permission (shield icon) to 'Full access' and retry. If authentication is required, tell them to run `codex login` in a terminal first.",
            ]
        elif mode == "jupytext_py":
            instructions = [
                "System: 1. For code changes, modify the current .py file directly using file editing tools.",
                "System: 2. Preserve existing Jupytext structure and metadata (YAML header and # %% cell markers) unless the user asks to change them.",
                "System: 3. The 'Current Cell Content' is a notebook cell snippet from the .py file.",
                "System: 4. If you cannot proceed due to sandbox/permission restrictions, say so explicitly and ask the user to switch Permission (shield icon) to 'Full access' and retry. If authentication is required, tell them to run `codex login` in a terminal first.",
            ]
        elif mode == "plain_py":
            instructions = [
                "System: 1. For code changes, modify the current .py file directly using file editing tools.",
                "System: 2. Do not introduce Jupytext YAML headers or notebook cell markers (for example, # %%) unless the user explicitly requests it.",
                "System: 3. If no context snippet is provided, inspect files directly before making edits.",
                "System: 4. If you cannot proceed due to sandbox/permission restrictions, say so explicitly and ask the user to switch Permission (shield icon) to 'Full access' and retry. If authentication is required, tell them to run `codex login` in a terminal first.",
            ]
        else:
            instructions = [
                "System: 1. For code changes, inspect files directly and edit the correct target file.",
                "System: 2. Keep edits minimal and aligned with the user request.",
                "System: 3. The provided context snippet, if any, may be partial.",
                "System: 4. If you cannot proceed due to sandbox/permission restrictions, say so explicitly and ask the user to switch Permission (shield icon) to 'Full access' and retry. If authentication is required, tell them to run `codex login` in a terminal first.",
            ]

        parts.extend(["", "System: Instructions:", *instructions, ""])

        if include_history and messages:
            parts.append("Conversation:")
            for msg in messages:
                role = msg.get("role", "user")
                content = msg.get("content", "")
                parts.append(f"{role.title()}: {content}")
            parts.append("")

        include_selection = mode in {"ipynb", "jupytext_py", "plain_py"}
        include_cell_output = mode == "ipynb"

        if include_selection and selection:
            parts.append("Current Cell Content:")
            parts.append(selection)
            parts.append("")

        if include_cell_output and cell_output:
            parts.append("Current Cell Output:")
            parts.append(cell_output)
            parts.append("")

        parts.append("User:")
        parts.append(user_content)

        return "\n".join(parts)

    def get_notebook_path(self, session_id: str) -> str:
        meta = self._load_meta(session_id)
        return meta.get("notebook_path", "")

    def has_session(self, session_id: str) -> bool:
        normalized_session_id = (session_id or "").strip()
        if not normalized_session_id:
            return False
        if not self._logging_enabled:
            return False
        meta = self._load_meta(normalized_session_id)
        return isinstance(meta, dict) and bool(meta)

    def session_matches_notebook(
        self, session_id: str, notebook_path: str, notebook_os_path: str = ""
    ) -> bool:
        """
        Validate whether an existing session id belongs to the current notebook.
        """
        normalized_session_id = (session_id or "").strip()
        if not normalized_session_id:
            return False
        if not self._logging_enabled:
            return True

        meta = self._load_meta(normalized_session_id)
        if not isinstance(meta, dict) or not meta:
            return False

        normalized_notebook_path = (notebook_path or "").strip()
        normalized_notebook_os_path = (notebook_os_path or "").strip()
        stored_notebook_path = (meta.get("notebook_path") or "").strip()
        stored_notebook_os_path = (meta.get("notebook_os_path") or "").strip()

        if normalized_notebook_path and stored_notebook_path == normalized_notebook_path:
            return True
        if normalized_notebook_os_path and stored_notebook_os_path == normalized_notebook_os_path:
            return True
        if not normalized_notebook_path and not normalized_notebook_os_path:
            return True
        return False

    def resolve_session_for_notebook(self, notebook_path: str, notebook_os_path: str = "") -> str:
        if not self._logging_enabled:
            return ""

        normalized_notebook_path = (notebook_path or "").strip()
        normalized_notebook_os_path = (notebook_os_path or "").strip()
        if not normalized_notebook_path and not normalized_notebook_os_path:
            return ""

        latest_session_id = ""
        latest_updated_at = None

        with self._file_lock:
            for path in self._base.glob("*.meta.json"):
                session_id = path.stem.removesuffix(".meta")
                try:
                    meta = json.loads(path.read_text(encoding="utf-8"))
                except (json.JSONDecodeError, IOError):
                    continue
                if not isinstance(meta, dict):
                    continue

                matched = False
                path_match = (meta.get("notebook_path") or "").strip()
                os_path_match = (meta.get("notebook_os_path") or "").strip()
                if normalized_notebook_path and path_match == normalized_notebook_path:
                    matched = True
                if not matched and normalized_notebook_os_path and os_path_match == normalized_notebook_os_path:
                    matched = True
                if not matched:
                    continue

                updated_at = meta.get("updated_at") or meta.get("created_at")
                parsed_updated_at = _parse_iso_datetime(updated_at)
                if parsed_updated_at is None:
                    continue
                if latest_updated_at is None or parsed_updated_at > latest_updated_at:
                    latest_updated_at = parsed_updated_at
                    latest_session_id = session_id

        return latest_session_id

    def delete_session(self, session_id: str) -> None:
        if not self._logging_enabled:
            return
        normalized_session_id = (session_id or "").strip()
        if not normalized_session_id:
            return

        with self._file_lock:
            self._delete_session_files(normalized_session_id)

    def delete_all_sessions(self) -> tuple[int, int]:
        if not self._logging_enabled:
            return (0, 0)
        if not self._base.exists():
            return (0, 0)

        deleted_count = 0
        failed_count = 0
        with self._file_lock:
            for path in self._base.glob("*.meta.json"):
                session_id = path.stem.removesuffix(".meta")
                if self._delete_session_files(session_id):
                    deleted_count += 1
                else:
                    failed_count += 1

        return (deleted_count, failed_count)

    def update_notebook_path(
        self, session_id: str, notebook_path: str, notebook_os_path: str = ""
    ) -> None:
        if not self._logging_enabled:
            return
        if not session_id:
            return

        with self._file_lock:
            meta = self._load_meta(session_id)
            if not meta:
                meta = {
                    "session_id": session_id,
                    "created_at": _now_iso(),
                    "schema_version": _SESSION_FILE_VERSION,
                }

            paired_path, paired_os_path = _derive_paired_paths(notebook_path, notebook_os_path)
            meta["session_id"] = session_id
            meta["notebook_path"] = notebook_path
            meta["notebook_os_path"] = notebook_os_path
            meta["paired_path"] = paired_path
            meta["paired_os_path"] = paired_os_path
            meta["schema_version"] = _SESSION_FILE_VERSION
            meta["updated_at"] = _now_iso()
            meta["retention_days"] = self._retention_days
            meta["max_messages_per_session"] = self._max_messages_per_session
            self._write_meta_atomic(self._meta_path(session_id), meta)

    def close_session(self, session_id: str) -> None:
        if not self._logging_enabled:
            return

        self._touch_meta(session_id)

    def rename_session(self, old_session_id: str, new_session_id: str) -> str:
        """
        Move session files to a new id (for example, when Codex returns a real
        `thread_id` after the first run).
        """
        old_id = (old_session_id or "").strip()
        new_id = (new_session_id or "").strip()
        if not old_id or not new_id or old_id == new_id:
            return new_id or old_id
        if not self._logging_enabled:
            return new_id

        with self._file_lock:
            old_jsonl = self._jsonl_path(old_id)
            new_jsonl = self._jsonl_path(new_id)
            if old_jsonl.exists():
                if new_jsonl.exists():
                    try:
                        with old_jsonl.open("r", encoding="utf-8") as source, new_jsonl.open(
                            "a", encoding="utf-8"
                        ) as target:
                            for line in source:
                                if not line:
                                    continue
                                if line.endswith("\n"):
                                    target.write(line)
                                else:
                                    target.write(f"{line}\n")
                        old_jsonl.unlink()
                    except OSError:
                        pass
                else:
                    try:
                        old_jsonl.rename(new_jsonl)
                    except OSError:
                        pass

            merged_meta: Dict[str, Any] = {}
            for candidate in (self._meta_path(new_id), self._meta_path(old_id)):
                if not candidate.exists():
                    continue
                try:
                    loaded = json.loads(candidate.read_text(encoding="utf-8"))
                except (json.JSONDecodeError, IOError):
                    continue
                if isinstance(loaded, dict):
                    merged_meta.update(loaded)

            if merged_meta:
                merged_meta["session_id"] = new_id
                merged_meta["updated_at"] = _now_iso()
                merged_meta["schema_version"] = _SESSION_FILE_VERSION
                merged_meta["retention_days"] = self._retention_days
                merged_meta["max_messages_per_session"] = self._max_messages_per_session
                try:
                    self._write_meta_atomic(self._meta_path(new_id), merged_meta)
                except OSError:
                    pass

            old_meta = self._meta_path(old_id)
            new_meta = self._meta_path(new_id)
            if old_meta != new_meta and old_meta.exists():
                try:
                    old_meta.unlink()
                except OSError:
                    pass

            # Ensure the policy metadata is present even for files created before this change.
            if new_meta.exists():
                self._enforce_session_limits_locked(new_id, skip_size_limit=True)

        return new_id

    def _touch_meta(self, session_id: str) -> None:
        if not self._logging_enabled:
            return
        if not session_id:
            return
        with self._file_lock:
            self._touch_meta_locked(session_id)

    def _touch_meta_locked(self, session_id: str) -> None:
        meta_path = self._meta_path(session_id)
        if not meta_path.exists():
            return

        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, IOError):
            meta = {
                "session_id": session_id,
                "created_at": _now_iso(),
                "schema_version": _SESSION_FILE_VERSION,
            }
        if not isinstance(meta, dict):
            meta = {
                "session_id": session_id,
                "created_at": _now_iso(),
                "schema_version": _SESSION_FILE_VERSION,
            }

        meta["updated_at"] = _now_iso()
        meta["schema_version"] = _SESSION_FILE_VERSION
        meta["retention_days"] = self._retention_days
        self._write_meta_atomic(meta_path, meta)

    def _load_meta(self, session_id: str) -> Dict[str, str]:
        if not self._logging_enabled:
            return {}
        if not session_id:
            return {}

        meta_path = self._meta_path(session_id)
        if not meta_path.exists():
            return {}

        with self._file_lock:
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, IOError):
                return {}

            if not isinstance(meta, dict):
                return {}

            return meta

    def _jsonl_path(self, session_id: str) -> Path:
        return self._base / f"{session_id}.jsonl"

    def _meta_path(self, session_id: str) -> Path:
        return self._base / f"{session_id}.meta.json"

    def prune_expired_sessions(self) -> None:
        if not self._logging_enabled or self._retention_days <= 0:
            return

        with self._file_lock:
            self._prune_expired_sessions_locked()
            self._last_global_prune = datetime.now(timezone.utc)

    def _prune_expired_sessions_locked(self) -> None:
        if self._retention_days <= 0:
            return

        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=self._retention_days)
        active_session_ids = set()

        for path in self._base.glob("*.meta.json"):
            session_id = path.stem.removesuffix(".meta")
            try:
                meta = json.loads(path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, IOError):
                self._delete_session_files(session_id)
                continue
            if not isinstance(meta, dict):
                self._delete_session_files(session_id)
                continue

            updated_at = meta.get("updated_at") or meta.get("created_at")
            when = _parse_iso_datetime(updated_at)
            if not when:
                self._delete_session_files(session_id)
                continue
            if when >= cutoff:
                active_session_ids.add(session_id)
                continue

            self._delete_session_files(session_id)

        for path in self._base.glob("*.jsonl"):
            if path.stem not in active_session_ids:
                self._delete_session_files(path.stem)

        self._last_global_prune = datetime.now(timezone.utc)

    def _is_global_prune_due(self) -> bool:
        now = datetime.now(timezone.utc)
        if now - self._last_global_prune < self._prune_interval:
            return False
        return True

    def _enforce_session_limits_locked(self, session_id: str, skip_size_limit: bool = False) -> None:
        path = self._jsonl_path(session_id)
        if not path.exists():
            return

        if not skip_size_limit:
            should_check_size = self._max_session_bytes > 0 and path.stat().st_size > self._max_session_bytes
        else:
            should_check_size = False

        records, invalid_count = _read_jsonl_records(path)
        if not records and invalid_count == 0:
            return

        original_records = list(records)

        if self._max_messages_per_session > 0:
            records = records[-self._max_messages_per_session :]

        self._trim_user_ui_previews(records, _DEFAULT_UI_PREVIEW_MAX_ITEMS_PER_SESSION)
        if self._max_session_bytes > 0:
            self._trim_records_to_byte_budget(records, self._max_session_bytes)

        changed = (len(records) != len(original_records)) or (invalid_count > 0) or should_check_size
        if not changed:
            return

        if not self._write_jsonl_records(path, records):
            return

    def _trim_session_records_locked(self, session_id: str, keep_ui_previews: int) -> None:
        if keep_ui_previews <= 0:
            return
        path = self._jsonl_path(session_id)
        if not path.exists():
            return

        records, invalid_count = _read_jsonl_records(path)
        if not records and invalid_count == 0:
            return

        original_records = list(records)
        self._trim_user_ui_previews(records, keep_ui_previews)
        if self._max_messages_per_session > 0:
            records = records[-self._max_messages_per_session :]

        if self._max_session_bytes > 0:
            self._trim_records_to_byte_budget(records, self._max_session_bytes)

        if records == original_records and invalid_count == 0:
            return

        self._write_jsonl_records(path, records)

    def _trim_records_to_byte_budget(self, records: List[Dict[str, Any]], max_bytes: int) -> None:
        if max_bytes <= 0:
            return

        if not records:
            return

        serialized_sizes = [len(json.dumps(record)) for record in records]
        total_bytes = sum(length + 1 for length in serialized_sizes)

        if total_bytes <= max_bytes:
            return

        while total_bytes > max_bytes and records:
            removed = serialized_sizes.pop(0) + 1
            records.pop(0)
            total_bytes -= removed

    def _trim_user_ui_previews(self, records: List[Dict[str, Any]], keep_latest: int) -> None:
        if keep_latest <= 0:
            return

        ui_indices: List[int] = []
        for idx, record in enumerate(records):
            if record.get("role") != "user":
                continue
            ui = record.get("ui")
            if isinstance(ui, dict) and (
                isinstance(ui.get("selectionPreview"), dict)
                or isinstance(ui.get("cellOutputPreview"), dict)
            ):
                ui_indices.append(idx)

        if len(ui_indices) <= keep_latest:
            return

        for idx in ui_indices[: len(ui_indices) - keep_latest]:
            if "ui" in records[idx]:
                records[idx].pop("ui", None)

    def _write_jsonl_records(self, path: Path, records: List[Dict[str, Any]]) -> bool:
        tmp_path = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
        try:
            with tmp_path.open("w", encoding="utf-8") as handle:
                for record in records:
                    handle.write(json.dumps(record))
                    handle.write("\n")
            tmp_path.replace(path)
            return True
        except OSError:
            return False

    def _write_meta_atomic(self, path: Path, meta: Dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
        tmp_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
        tmp_path.replace(path)

    def _delete_session_files(self, session_id: str) -> bool:
        deleted_any = False
        failed = False
        for path in (self._jsonl_path(session_id), self._meta_path(session_id)):
            try:
                if path.exists():
                    path.unlink()
                    deleted_any = True
            except OSError:
                failed = True
                continue
        return deleted_any and not failed


def _derive_paired_paths(notebook_path: str, notebook_os_path: str) -> Tuple[str, str]:
    paired_path = ""
    paired_os_path = ""

    notebook_path_lower = (notebook_path or "").lower()
    notebook_os_path_lower = (notebook_os_path or "").lower()

    if notebook_path_lower.endswith(".ipynb"):
        paired_path = notebook_path[:-6] + ".py"
    elif notebook_path_lower.endswith(".py"):
        paired_path = notebook_path[:-3] + ".ipynb"
    if notebook_os_path_lower.endswith(".ipynb"):
        paired_os_path = notebook_os_path[:-6] + ".py"
    elif notebook_os_path_lower.endswith(".py"):
        paired_os_path = notebook_os_path[:-3] + ".ipynb"

    return paired_path, paired_os_path


def _normalize_notebook_mode(raw_mode: str, notebook_path: str, notebook_os_path: str) -> str:
    mode = (raw_mode or "").strip().lower()
    if mode in {"ipynb", "jupytext_py", "plain_py"}:
        return mode

    path = (notebook_path or "").strip().lower()
    os_path = (notebook_os_path or "").strip().lower()
    if path.endswith(".ipynb") or os_path.endswith(".ipynb"):
        return "ipynb"
    if path.endswith(".py") or os_path.endswith(".py"):
        return "plain_py"
    return "unsupported"


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


def _sanitize_ui_payload(raw: Dict[str, Any] | None) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        return {}

    payload: Dict[str, Any] = {}

    selection_preview = _sanitize_ui_preview(raw.get("selectionPreview"))
    if selection_preview:
        payload["selectionPreview"] = selection_preview

    cell_output_preview = _sanitize_ui_preview(raw.get("cellOutputPreview"))
    if cell_output_preview:
        payload["cellOutputPreview"] = cell_output_preview

    return payload


def _sanitize_ui_preview(raw: Any) -> Dict[str, str]:
    if not isinstance(raw, dict):
        return {}

    location_raw = raw.get("locationLabel")
    preview_text_raw = raw.get("previewText")
    if not isinstance(location_raw, str) or not isinstance(preview_text_raw, str):
        return {}

    location = _sanitize_message(location_raw.strip(), _DEFAULT_UI_LABEL_MAX_CHARS)
    preview_text = _sanitize_message(
        preview_text_raw.replace("\r\n", "\n").replace("\r", "\n").strip(),
        _DEFAULT_UI_PREVIEW_MAX_CHARS,
    )
    if not location or not preview_text:
        return {}

    return {"locationLabel": location, "previewText": preview_text}


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


def _read_jsonl_records(path: Path) -> Tuple[List[Dict[str, Any]], int]:
    records: List[Dict[str, Any]] = []
    removed_invalid_count = 0

    try:
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    removed_invalid_count += 1
                    continue
                if isinstance(payload, dict):
                    records.append(payload)
                else:
                    removed_invalid_count += 1
    except OSError:
        return [], 1

    return records, removed_invalid_count
