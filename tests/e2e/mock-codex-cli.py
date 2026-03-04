#!/usr/bin/env python3

import json
import os
import sys
import time
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
    try:
        delay_ms = int(os.environ.get("MOCK_CODEX_DELAY_MS", "2600"))
    except ValueError:
        delay_ms = 2600
    delay_ms = max(200, delay_ms)
    exit_code_raw = os.environ.get("MOCK_CODEX_EXIT_CODE", "0")
    try:
        exit_code = int(exit_code_raw)
    except ValueError:
        exit_code = 0

    prompt = sys.stdin.read().strip()
    thread_id = f"mock-thread-{uuid.uuid4().hex[:12]}"

    _emit({"type": "thread.started", "thread_id": thread_id})
    _emit({"type": "item.started", "item": {"type": "reasoning", "title": "Mock run started"}})
    time.sleep(delay_ms / 2000.0)
    _emit(
        {
            "type": "item.completed",
            "item": {
                "type": "agent_message",
                "text": f"Mock response for: {prompt[:120] if prompt else '(empty prompt)'}",
            },
        }
    )
    time.sleep(delay_ms / 2000.0)
    return exit_code


def main() -> int:
    argv = sys.argv[1:]
    if len(argv) >= 1 and argv[0] == "app-server":
        return _run_app_server()
    return _run_exec_mode()


if __name__ == "__main__":
    raise SystemExit(main())
