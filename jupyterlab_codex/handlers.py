import asyncio
import json
import uuid
from typing import Any, Dict

from tornado.websocket import WebSocketHandler

from .runner import CodexRunner
from .sessions import SessionStore


class CodexWSHandler(WebSocketHandler):
    def initialize(self, server_app):
        self._server_app = server_app
        self._runner = CodexRunner()
        self._store = SessionStore()
        self._active_runs: Dict[str, asyncio.Task] = {}

    def check_origin(self, origin: str) -> bool:
        return True

    def open(self):
        self.write_message(
            json.dumps({"type": "status", "state": "ready"})
        )

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

        self.write_message(json.dumps({"type": "error", "message": "Unknown message type"}))

    async def _handle_start_session(self, payload: Dict[str, Any]):
        session_id = payload.get("sessionId") or str(uuid.uuid4())
        notebook_path = payload.get("notebookPath", "")
        self._store.ensure_session(session_id, notebook_path)
        self.write_message(
            json.dumps({"type": "status", "state": "ready", "sessionId": session_id})
        )

    async def _handle_send(self, payload: Dict[str, Any]):
        session_id = payload.get("sessionId") or str(uuid.uuid4())
        content = payload.get("content", "")
        selection = payload.get("selection", "")
        run_id = str(uuid.uuid4())

        if not content:
            self.write_message(
                json.dumps({"type": "error", "message": "Empty content"})
            )
            return

        prompt = self._store.build_prompt(session_id, content, selection)
        self._store.append_message(session_id, "user", content)

        async def _run():
            self.write_message(
                json.dumps({"type": "status", "state": "running", "runId": run_id})
            )

            assistant_buffer = []

            async def on_event(event: Dict[str, Any]):
                text = event_to_text(event)
                if text:
                    assistant_buffer.append(text)
                    self.write_message(
                        json.dumps({"type": "output", "runId": run_id, "text": text})
                    )
                else:
                    self.write_message(
                        json.dumps({"type": "event", "runId": run_id, "payload": event})
                    )

            try:
                exit_code = await self._runner.run(prompt, on_event)
                if assistant_buffer:
                    self._store.append_message(
                        session_id, "assistant", "".join(assistant_buffer)
                    )
                self.write_message(
                    json.dumps({"type": "done", "runId": run_id, "exitCode": exit_code})
                )
                self.write_message(
                    json.dumps({"type": "status", "state": "ready", "runId": run_id})
                )
            except Exception as exc:
                self.write_message(
                    json.dumps({"type": "error", "runId": run_id, "message": str(exc)})
                )
            finally:
                self._active_runs.pop(run_id, None)

        task = asyncio.create_task(_run())
        self._active_runs[run_id] = task

    async def _handle_cancel(self, payload: Dict[str, Any]):
        run_id = payload.get("runId")
        task = self._active_runs.get(run_id)
        if task:
            task.cancel()
            self.write_message(
                json.dumps({"type": "status", "state": "ready", "runId": run_id})
            )
        else:
            self.write_message(
                json.dumps({"type": "error", "message": "Run not found"})
            )

    async def _handle_end_session(self, payload: Dict[str, Any]):
        session_id = payload.get("sessionId")
        if session_id:
            self._store.close_session(session_id)
        self.write_message(json.dumps({"type": "status", "state": "ready"}))


def event_to_text(event: Dict[str, Any]) -> str:
    """
    Map Codex JSONL events to text for chat output.

    This is intentionally conservative because the exact event schema may vary.
    Customize this when integrating with a specific Codex CLI JSON format.
    """
    if "text" in event and isinstance(event["text"], str):
        return event["text"]
    if "message" in event and isinstance(event["message"], str):
        return event["message"]
    if "delta" in event and isinstance(event["delta"], str):
        return event["delta"]
    return ""
