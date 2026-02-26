import unittest

from jupyterlab_codex.protocol import (
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


class TestProtocolBuilders(unittest.TestCase):
    def test_parse_client_start_session_trims_fields(self):
        message = {
            "type": "start_session",
            "sessionId": "  thread-1  ",
            "notebookPath": " /notebooks/a.ipynb ",
            "sessionContextKey": " key ",
            "forceNewThread": "true",
            "commandPath": " /usr/bin/codex ",
        }
        msg_type, payload = parse_client_message(message)
        self.assertEqual(msg_type, "start_session")
        self.assertEqual(payload["sessionId"], "thread-1")
        self.assertEqual(payload["notebookPath"], "/notebooks/a.ipynb")
        self.assertEqual(payload["sessionContextKey"], "key")
        self.assertTrue(payload["forceNewThread"])
        self.assertEqual(payload["commandPath"], "/usr/bin/codex")

    def test_parse_client_send_normalizes_fields(self):
        message = {
            "type": "send",
            "sessionId": "thread-1",
            "sessionContextKey": "k",
            "content": "  hello  ",
            "notebookPath": "",
            "commandPath": 42,
            "model": None,
            "reasoningEffort": "medium",
            "sandbox": "  read-only  ",
            "selection": "sel",
            "cellOutput": "out",
            "images": [{"a": 1}],
            "uiSelectionPreview": {"locationLabel": "x", "previewText": "y"},
            "uiCellOutputPreview": {"locationLabel": "Cell 8 Output", "previewText": "42"},
        }
        msg_type, payload = parse_client_message(message)
        self.assertEqual(msg_type, "send")
        self.assertEqual(payload["commandPath"], "")
        self.assertEqual(payload["content"], "hello")
        self.assertEqual(payload["sandbox"], "read-only")
        self.assertEqual(payload["model"], "")
        self.assertEqual(payload["selection"], "sel")
        self.assertEqual(payload["images"], [{"a": 1}])
        self.assertEqual(payload["uiCellOutputPreview"], {"locationLabel": "Cell 8 Output", "previewText": "42"})

    def test_parse_client_invalid_message(self):
        with self.assertRaises(ProtocolParseError):
            parse_client_message({"type": "unknown"})

    def test_builders_shape(self):
        self.assertEqual(
            build_status_payload(
                state="ready",
                run_id="run-1",
                session_id="thread-1",
                session_context_key="ctx-1",
                notebook_path="/notebooks/a.ipynb",
                run_mode="resume",
                paired_ok=True,
                paired_path="/paired",
                paired_os_path="/paired-os",
                paired_message="paired",
                notebook_mode="ipynb",
                history=[{"role": "user", "content": "hi"}],
            )["type"],
            "status",
        )

        output = build_output_payload(
            run_id="run-1",
            session_id="thread-1",
            session_context_key="ctx-1",
            notebook_path="/notebooks/a.ipynb",
            text="ok",
            role="system",
        )
        self.assertEqual(output["role"], "system")

        event = build_event_payload(
            run_id="run-1",
            session_id="thread-1",
            session_context_key="ctx-1",
            notebook_path="/notebooks/a.ipynb",
            payload={"kind": "log"},
        )
        self.assertEqual(event["payload"], {"kind": "log"})

        done = build_done_payload(
            run_id="run-1",
            session_id="thread-1",
            session_context_key="ctx-1",
            notebook_path="/notebooks/a.ipynb",
            exit_code=0,
            file_changed=False,
            run_mode="resume",
            paired_ok=True,
            paired_path="/paired",
            paired_os_path="/paired-os",
            paired_message="paired",
            notebook_mode="ipynb",
            cancelled=True,
        )
        self.assertTrue(done["cancelled"])

        error = build_error_payload(
            message="bad",
            run_id="run-1",
            session_id="thread-1",
            session_context_key="ctx-1",
            notebook_path="/notebooks/a.ipynb",
            run_mode="fallback",
            suggested_command_path="/usr/bin/codex",
            paired_ok=True,
        )
        self.assertEqual(error["message"], "bad")
        self.assertEqual(error["runMode"], "fallback")

        rates = build_rate_limits_payload({"x": 1})
        self.assertEqual(rates["snapshot"], {"x": 1})

        delete_all = build_delete_all_payload(
            ok=True,
            deleted_count=1,
            failed_count=0,
            message="deleted",
        )
        self.assertTrue(delete_all["ok"])
        self.assertEqual(delete_all["message"], "deleted")

        defaults = build_cli_defaults_payload(model="o4-mini", reasoning_effort="low")
        self.assertEqual(defaults["model"], "o4-mini")


if __name__ == "__main__":
    unittest.main()
