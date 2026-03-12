#!/usr/bin/env python3

import json
import sys
import uuid
from typing import Any


def _emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def _run_app_server() -> int:
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue

        req_id = req.get("id")
        method = req.get("method")
        if method == "initialize" and req_id is not None:
            _emit({"jsonrpc": "2.0", "id": req_id, "result": {"capabilities": {}}})
            continue
        if method == "model/list" and req_id is not None:
            _emit(
                {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "data": [
                            {
                                "model": "mock-gpt",
                                "displayName": "Mock GPT",
                                "supportedReasoningEfforts": ["low", "medium", "high"],
                                "defaultReasoningEffort": "medium",
                            }
                        ]
                    },
                }
            )
            continue
        if method == "shutdown" and req_id is not None:
            _emit({"jsonrpc": "2.0", "id": req_id, "result": {}})
            continue

    return 0


def _run_exec_mode() -> int:
    prompt = sys.stdin.read()
    thread_id = f"mock-thread-{uuid.uuid4().hex[:12]}"
    head = prompt[:800]
    tail = prompt[-800:] if prompt else ""

    _emit({"type": "thread.started", "thread_id": thread_id})
    _emit(
        {
            "type": "item.completed",
            "item": {
                "type": "agent_message",
                "text": (
                    "PROMPT_HEAD_START\n"
                    f"{head}\n"
                    "PROMPT_HEAD_END\n"
                    "PROMPT_TAIL_START\n"
                    f"{tail}\n"
                    "PROMPT_TAIL_END"
                ),
            },
        }
    )
    return 0


def main() -> int:
    argv = sys.argv[1:]
    if len(argv) >= 1 and argv[0] == "app-server":
        return _run_app_server()
    return _run_exec_mode()


if __name__ == "__main__":
    raise SystemExit(main())
