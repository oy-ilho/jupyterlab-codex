import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple


class SessionStore:
    def __init__(self, base_dir: str | None = None):
        root = base_dir or os.path.join(os.path.expanduser("~"), ".jupyter", "codex-sessions")
        self._base = Path(root)
        self._base.mkdir(parents=True, exist_ok=True)

    def ensure_session(self, session_id: str, notebook_path: str, notebook_os_path: str = "") -> None:
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
        record = {
            "role": role,
            "content": content,
            "timestamp": _now_iso(),
        }
        with self._jsonl_path(session_id).open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record))
            handle.write("\n")
        self._touch_meta(session_id)

    def load_messages(self, session_id: str) -> List[Dict[str, str]]:
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
        self, session_id: str, user_content: str, selection: str, cwd: str | None = None
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

        parts.append("User:")
        parts.append(user_content)

        return "\n".join(parts)

    def get_notebook_path(self, session_id: str) -> str:
        meta = self._load_meta(session_id)
        return meta.get("notebook_path", "")

    def update_notebook_path(
        self, session_id: str, notebook_path: str, notebook_os_path: str = ""
    ) -> None:
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
        self._touch_meta(session_id)

    def _touch_meta(self, session_id: str) -> None:
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
