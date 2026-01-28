import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List


class SessionStore:
    def __init__(self, base_dir: str | None = None):
        root = base_dir or os.path.join(os.path.expanduser("~"), ".jupyter", "codex-sessions")
        self._base = Path(root)
        self._base.mkdir(parents=True, exist_ok=True)

    def ensure_session(self, session_id: str, notebook_path: str) -> None:
        meta_path = self._meta_path(session_id)
        if meta_path.exists():
            return
        meta = {
            "session_id": session_id,
            "notebook_path": notebook_path,
            "paired_path": "",
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

    def build_prompt(self, session_id: str, user_content: str, selection: str) -> str:
        messages = self.load_messages(session_id)
        parts = [
            "System: You are Codex running inside JupyterLab.",
            "System: Only edit the Jupytext paired .py file; do not edit .ipynb directly.",
            "System: If you make changes, explain briefly after the edits.",
            "",
        ]

        if messages:
            parts.append("Conversation:")
            for msg in messages:
                role = msg.get("role", "user")
                content = msg.get("content", "")
                parts.append(f"{role.title()}: {content}")
            parts.append("")

        if selection:
            parts.append("Selection:")
            parts.append(selection)
            parts.append("")

        parts.append("User:")
        parts.append(user_content)

        return "\n".join(parts)

    def close_session(self, session_id: str) -> None:
        self._touch_meta(session_id)

    def _touch_meta(self, session_id: str) -> None:
        meta_path = self._meta_path(session_id)
        if not meta_path.exists():
            return
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta["updated_at"] = _now_iso()
        meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    def _jsonl_path(self, session_id: str) -> Path:
        return self._base / f"{session_id}.jsonl"

    def _meta_path(self, session_id: str) -> Path:
        return self._base / f"{session_id}.meta.json"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
