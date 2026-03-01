import os
import tempfile
import unittest

from jupyterlab_codex.sessions import SessionStore


class TestSessionStoreMessageLimits(unittest.TestCase):
    def test_append_message_trims_to_default_max_of_100(self):
        previous = os.environ.pop("JUPYTERLAB_CODEX_SESSION_MAX_MESSAGES", None)
        try:
            with tempfile.TemporaryDirectory() as base_dir:
                store = SessionStore(base_dir=base_dir)
                session_id = "session-default-limit"

                for index in range(150):
                    store.append_message(session_id, "user", f"message-{index}")

                messages = store.load_messages(session_id)

                self.assertEqual(len(messages), 100)
                self.assertEqual(messages[0]["content"], "message-50")
                self.assertEqual(messages[-1]["content"], "message-149")
        finally:
            if previous is None:
                os.environ.pop("JUPYTERLAB_CODEX_SESSION_MAX_MESSAGES", None)
            else:
                os.environ["JUPYTERLAB_CODEX_SESSION_MAX_MESSAGES"] = previous

    def test_custom_max_environment_variable_is_respected(self):
        previous = os.environ.get("JUPYTERLAB_CODEX_SESSION_MAX_MESSAGES")
        try:
            os.environ["JUPYTERLAB_CODEX_SESSION_MAX_MESSAGES"] = "12"
            with tempfile.TemporaryDirectory() as base_dir:
                store = SessionStore(base_dir=base_dir)
                session_id = "session-custom-limit"

                for index in range(20):
                    store.append_message(session_id, "user", f"message-{index}")

                messages = store.load_messages(session_id)

                self.assertEqual(len(messages), 12)
                self.assertEqual(messages[0]["content"], "message-8")
                self.assertEqual(messages[-1]["content"], "message-19")
        finally:
            if previous is None:
                os.environ.pop("JUPYTERLAB_CODEX_SESSION_MAX_MESSAGES", None)
            else:
                os.environ["JUPYTERLAB_CODEX_SESSION_MAX_MESSAGES"] = previous
