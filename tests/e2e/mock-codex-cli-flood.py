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
                                "model": "gpt-5.3-codex",
                                "displayName": "GPT-5.3 Codex",
                                "supportedReasoningEfforts": ["low", "medium", "high"],
                                "defaultReasoningEffort": "high",
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


def _int_env(name: str, default: int, minimum: int) -> int:
    raw = os.environ.get(name, str(default)).strip()
    try:
        value = int(raw)
    except ValueError:
        value = default
    return max(minimum, value)


def _run_exec_mode() -> int:
    event_count = _int_env("MOCK_CODEX_EVENT_COUNT", 320, 20)
    event_delay_ms = _int_env("MOCK_CODEX_EVENT_DELAY_MS", 20, 0)
    chunk_words = _int_env("MOCK_CODEX_CHUNK_WORDS", 14, 4)

    exit_code_raw = os.environ.get("MOCK_CODEX_EXIT_CODE", "0").strip()
    try:
        exit_code = int(exit_code_raw)
    except ValueError:
        exit_code = 0

    prompt = sys.stdin.read().strip()
    prompt_preview = prompt[:120] if prompt else "(empty prompt)"
    repeated = " ".join(["analysis"] * chunk_words)
    thread_id = f"mock-thread-{uuid.uuid4().hex[:12]}"

    _emit({"type": "thread.started", "thread_id": thread_id})
    _emit({"type": "item.started", "item": {"type": "reasoning", "title": "Long reasoning started"}})

    for idx in range(event_count):
        step = idx + 1
        _emit(
            {
                "type": "item.completed",
                "item": {
                    "type": "agent_message",
                    "text": f"[{step}/{event_count}] {prompt_preview} :: {repeated}",
                },
            }
        )
        _emit(
            {
                "type": "item.started",
                "item": {"type": "command", "title": f"Tool step {step} started", "command": f"python -m check {step}"},
            }
        )
        _emit(
            {
                "type": "item.completed",
                "item": {
                    "type": "command",
                    "title": f"Tool step {step} completed",
                    "command": f"python -m check {step}",
                    "exit_code": 0,
                },
            }
        )
        if event_delay_ms > 0:
            time.sleep(event_delay_ms / 1000.0)

    _emit({"type": "item.completed", "item": {"type": "reasoning", "title": "Long reasoning completed"}})
    return exit_code


def main() -> int:
    argv = sys.argv[1:]
    if len(argv) >= 1 and argv[0] == "app-server":
        return _run_app_server()
    return _run_exec_mode()


if __name__ == "__main__":
    raise SystemExit(main())
