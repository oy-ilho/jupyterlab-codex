import json
import re
import unittest
from unittest.mock import patch

from jupyterlab_codex.handlers import CodexWSHandler, _coerce_session_id


_SAFE_SESSION_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")


class _DummySessionStore:
    def __init__(self, resolved_session_id: str = ""):
        self.resolved_session_id = resolved_session_id
        self.ensure_calls: list[tuple[str, str, str]] = []

    def resolve_session_for_notebook(self, notebook_path: str, notebook_os_path: str = "") -> str:
        return self.resolved_session_id

    def has_session(self, session_id: str) -> bool:
        return False

    def session_matches_notebook(
        self,
        session_id: str,
        notebook_path: str,
        notebook_os_path: str = "",
    ) -> bool:
        return False

    def ensure_session(self, session_id: str, notebook_path: str, notebook_os_path: str = "") -> None:
        self.ensure_calls.append((session_id, notebook_path, notebook_os_path))

    def update_notebook_path(
        self, session_id: str, notebook_path: str, notebook_os_path: str = ""
    ) -> None:
        pass

    def load_messages(self, session_id: str):
        return []


class TestSessionIdCoercion(unittest.TestCase):
    def test_coerce_session_id_accepts_safe_characters(self):
        self.assertEqual(_coerce_session_id("thread_01-alpha"), "thread_01-alpha")

    def test_coerce_session_id_rejects_path_elements(self):
        self.assertEqual(_coerce_session_id("../thread-1"), "")
        self.assertEqual(_coerce_session_id("..\\thread-1"), "")
        self.assertEqual(_coerce_session_id("thread/../1"), "")
        self.assertEqual(_coerce_session_id("thread.1"), "")

    def test_coerce_session_id_rejects_non_string(self):
        self.assertEqual(_coerce_session_id(None), "")
        self.assertEqual(_coerce_session_id(123), "")


class TestHandleStartSessionSessionId(unittest.IsolatedAsyncioTestCase):
    def _make_handler(self, resolved_session_id: str) -> CodexWSHandler:
        handler = CodexWSHandler.__new__(CodexWSHandler)
        handler._store = _DummySessionStore(resolved_session_id=resolved_session_id)
        handler._runner = None
        handler._active_runs = {}
        handler._messages: list[str] = []
        handler._safe_write_message = handler._messages.append
        handler._send_model_catalog = lambda *args, **kwargs: None
        handler._resolve_notebook_os_path = lambda path: ""
        return handler

    async def test_start_session_uses_sanitized_mapped_session_id_for_invalid_payload_id(self):
        handler = self._make_handler(resolved_session_id="mapped_thread")

        payload = {
            "sessionId": "../evil/session",
            "notebookPath": "/tmp/project/notebook.ipynb",
            "sessionContextKey": "ctx",
            "forceNewThread": False,
            "commandPath": "",
        }

        with patch(
            "jupyterlab_codex.handlers._compute_pairing_status",
            return_value=(True, "", "", "", ""),
        ):
            await handler._handle_start_session(payload)

        status = json.loads(handler._messages[-1])
        self.assertEqual(status["sessionId"], "mapped_thread")
        self.assertEqual(status["sessionResolution"], "mapping")
        self.assertEqual(handler._store.ensure_calls[0][0], "mapped_thread")

    async def test_start_session_falls_back_to_generated_safe_session_id(self):
        handler = self._make_handler(resolved_session_id="../unsafe/mapped")

        payload = {
            "sessionId": "../../payload",
            "notebookPath": "",
            "sessionContextKey": "",
            "forceNewThread": False,
            "commandPath": "",
        }

        with patch(
            "jupyterlab_codex.handlers._compute_pairing_status",
            return_value=(False, "", "", "", ""),
        ):
            await handler._handle_start_session(payload)

        status = json.loads(handler._messages[-1])
        generated_id = status["sessionId"]

        self.assertTrue(_SAFE_SESSION_ID_RE.fullmatch(generated_id))
        self.assertNotIn("/", generated_id)
        self.assertNotIn("..", generated_id)
        self.assertNotIn("\\", generated_id)
        self.assertTrue(handler._store.ensure_calls[0][0], _SAFE_SESSION_ID_RE)
