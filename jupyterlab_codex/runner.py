import asyncio
import json
import os
import shutil
import time
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List


class CodexRunner:
    def __init__(self, command: str = "codex", args: List[str] | None = None):
        configured_command = os.environ.get("JUPYTERLAB_CODEX_COMMAND", "").strip()
        self._command = self._resolve_command(configured_command or command)
        if args is not None:
            self._raw_args = list(args)
            self._common_args: List[str] = []
            self._default_model = ""
            self._default_sandbox = ""
            return

        self._raw_args = None
        self._default_model = os.environ.get("JUPYTERLAB_CODEX_MODEL", "").strip()
        self._default_sandbox = os.environ.get("JUPYTERLAB_CODEX_SANDBOX", "workspace-write").strip() or "workspace-write"
        self._common_args = [
            # This extension has no UI for interactive approvals.
            # Force Codex to return failures instead of waiting for input.
            "--ask-for-approval",
            "never",
            "exec",
            "--json",
            "--color",
            "never",
            "--skip-git-repo-check",
        ]
        self._model_catalog_cache: list[dict[str, Any]] = []
        self._model_catalog_cache_time = 0.0

    async def list_available_models(self, command: str | None = None) -> list[dict[str, Any]]:
        now = time.monotonic()
        if self._model_catalog_cache and now - self._model_catalog_cache_time < 600:
            return list(self._model_catalog_cache)

        command_to_run = self._resolve_command((command or "").strip() or self._command)
        try:
            models = await self._load_available_models(command_to_run)
        except Exception:
            return []

        if not isinstance(models, list) or not models:
            return []
        self._model_catalog_cache = models
        self._model_catalog_cache_time = now
        return list(models)

    async def _load_available_models(self, command_to_run: str) -> list[dict[str, Any]]:
        proc = await asyncio.create_subprocess_exec(
            command_to_run,
            "app-server",
            "--listen",
            "stdio://",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        if proc.stdin is None or proc.stdout is None or proc.stderr is None:
            raise RuntimeError("Failed to open app-server subprocess streams")

        buffer = bytearray()
        max_message_bytes = 1024 * 1024

        def _pop_message_from_buffer() -> dict[str, Any] | None:
            separator_index = buffer.find(b"\n")
            if separator_index < 0:
                return None
            raw_line = bytes(buffer[:separator_index])
            del buffer[:separator_index + 1]
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line:
                return {}
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                return {}
            if isinstance(payload, dict):
                return payload
            return {}

        async def read_message() -> dict[str, Any] | None:
            deadline = time.monotonic() + 3.0
            while True:
                message = _pop_message_from_buffer()
                if message is not None:
                    if message:
                        return message
                    continue

                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise RuntimeError("App-server response timed out")

                chunk = await asyncio.wait_for(proc.stdout.read(4096), timeout=remaining)
                if not chunk:
                    if buffer:
                        line = buffer.decode("utf-8", errors="replace").strip()
                        buffer.clear()
                        if not line:
                            return None
                        try:
                            payload = json.loads(line)
                        except json.JSONDecodeError:
                            return None
                        if isinstance(payload, dict):
                            return payload
                    return None
                buffer.extend(chunk)
                if len(buffer) > max_message_bytes and b"\n" not in buffer:
                    raise RuntimeError("App-server emitted an oversized response line")

        async def read_response(expected_id: int) -> dict[str, Any]:
            while True:
                response = await read_message()
                if response is None:
                    raise RuntimeError(f"App-server did not return a response for id {expected_id}")
                if response.get("id") != expected_id:
                    continue
                if "result" in response or "error" in response:
                    return response
                continue

        async def write_json(payload: dict[str, Any]) -> None:
            proc.stdin.write(json.dumps(payload).encode("utf-8"))
            proc.stdin.write(b"\n")
            await proc.stdin.drain()

        initialize_request_id = 1
        list_request_id = 2
        try:
            await write_json(
                {
                    "jsonrpc": "2.0",
                    "id": initialize_request_id,
                    "method": "initialize",
                    "params": {
                        "clientInfo": {
                            "name": "jupyterlab-codex",
                            "version": "0.1.0",
                        }
                    },
                }
            )
            initialize_response = await read_response(initialize_request_id)
            if "error" in initialize_response:
                raise RuntimeError("App-server initialize failed")
            await write_json(
                {
                    "jsonrpc": "2.0",
                    "method": "initialized",
                    "params": {},
                }
            )
            await write_json(
                {
                    "jsonrpc": "2.0",
                    "id": list_request_id,
                    "method": "model/list",
                    "params": {"limit": 128},
                }
            )

            model_list_payload = await read_response(list_request_id)

            if "error" in model_list_payload:
                raise RuntimeError(model_list_payload.get("error", {}).get("message", "model/list failed"))

            result = model_list_payload.get("result")
            if not isinstance(result, dict):
                return []

            data = result.get("data")
            if not isinstance(data, list):
                return []
            models: list[dict[str, Any]] = []
            seen: set[str] = set()
            for item in data:
                if not isinstance(item, dict):
                    continue
                model = self._coerce_model_value(item.get("model"))
                if not model:
                    continue
                if model in seen:
                    continue
                seen.add(model)
                display_name = self._coerce_model_value(item.get("displayName")) or model
                reasoning_efforts = self._coerce_reasoning_efforts(item.get("supportedReasoningEfforts"))
                model_entry: dict[str, Any] = {"model": model, "displayName": display_name}
                if reasoning_efforts:
                    model_entry["reasoningEfforts"] = reasoning_efforts
                default_reasoning_effort = self._coerce_model_value(item.get("defaultReasoningEffort"))
                if default_reasoning_effort:
                    model_entry["defaultReasoningEffort"] = default_reasoning_effort
                models.append(model_entry)
            return models
        finally:
            try:
                await self._terminate_process(proc)
            except Exception:
                pass

    @staticmethod
    def _coerce_model_value(value: Any) -> str:
        if not isinstance(value, str):
            return ""
        value = value.strip()
        return value

    @staticmethod
    def _coerce_reasoning_efforts(value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        reasons: list[str] = []
        seen: set[str] = set()
        for item in value:
            raw_reason: Any
            if isinstance(item, str):
                raw_reason = item
            elif isinstance(item, dict):
                raw_reason = item.get("reasoningEffort")
            else:
                continue

            reason = CodexRunner._coerce_model_value(raw_reason)
            if not reason:
                continue
            if reason in seen:
                continue
            seen.add(reason)
            reasons.append(reason)
        return reasons

    @staticmethod
    def _resolve_command(command: str) -> str:
        if os.path.isabs(os.path.expanduser(command)) and os.access(os.path.expanduser(command), os.X_OK):
            return os.path.expanduser(command)

        if os.path.sep in command:
            candidate = Path(command).expanduser()
            if candidate.is_file() and os.access(candidate, os.X_OK):
                return str(candidate)

        resolved = shutil.which(command)
        if resolved is not None:
            return resolved

        home = Path.home()
        for relative in (
            ".npm-global/bin/codex",
            ".local/bin/codex",
            "bin/codex",
            ".config/yarn/global/node_modules/.bin/codex",
            "node_modules/.bin/codex",
        ):
            candidate = home / relative
            if candidate.is_file() and os.access(candidate, os.X_OK):
                return str(candidate)

        return command

    async def run(
        self,
        prompt: str,
        on_event: Callable[[Dict[str, Any]], Awaitable[None]],
        cwd: str | None = None,
        model: str | None = None,
        reasoning_effort: str | None = None,
        sandbox: str | None = None,
        images: List[str] | None = None,
        command: str | None = None,
    ) -> int:
        command_to_run = self._resolve_command((command or "").strip() or self._command)
        args = self._args_for_options(
            model=model, reasoning_effort=reasoning_effort, sandbox=sandbox, images=images
        )

        proc = await asyncio.create_subprocess_exec(
            command_to_run,
            *args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
        )

        if proc.stdin is None or proc.stdout is None or proc.stderr is None:
            raise RuntimeError("Failed to open subprocess streams")

        proc.stdin.write(prompt.encode("utf-8"))
        proc.stdin.write(b"\n")
        await proc.stdin.drain()
        proc.stdin.close()

        async def _read_stdout() -> None:
            buffer = bytearray()
            max_event_line_bytes = 1024 * 1024
            while True:
                chunk = await proc.stdout.read(8192)
                if not chunk:
                    if buffer:
                        line = buffer.decode("utf-8", errors="replace").strip()
                        if line:
                            try:
                                event = json.loads(line)
                            except json.JSONDecodeError:
                                event = {"type": "raw", "text": line}
                            await on_event(event)
                    break

                buffer.extend(chunk)
                if len(buffer) > max_event_line_bytes and b"\n" not in buffer:
                    raise RuntimeError("Codex emitted an oversized unterminated stdout line")
                while True:
                    separator_index = buffer.find(b"\n")
                    if separator_index < 0:
                        break
                    raw_line = bytes(buffer[:separator_index])
                    del buffer[:separator_index + 1]

                    line = raw_line.decode("utf-8", errors="replace").strip()
                    if not line:
                        continue
                    try:
                        event = json.loads(line)
                    except json.JSONDecodeError:
                        event = {"type": "raw", "text": line}
                    await on_event(event)

        async def _read_stderr() -> None:
            # Stream stderr so users can see prompts/errors even if Codex blocks.
            while True:
                data = await proc.stderr.read(4096)
                if not data:
                    break
                await on_event({"type": "stderr", "text": data.decode("utf-8", errors="replace")})

        try:
            await asyncio.gather(_read_stdout(), _read_stderr())
            return await proc.wait()
        except asyncio.CancelledError:
            await self._terminate_process(proc)
            raise
        except Exception:
            await self._terminate_process(proc)
            raise

    async def _terminate_process(self, proc: asyncio.subprocess.Process) -> None:
        if proc.returncode is not None:
            return

        proc.terminate()
        try:
            await asyncio.wait_for(proc.wait(), timeout=2)
            return
        except asyncio.TimeoutError:
            pass

        proc.kill()
        await proc.wait()

    def _args_for_options(
        self,
        model: str | None,
        reasoning_effort: str | None,
        sandbox: str | None,
        images: List[str] | None,
    ) -> List[str]:
        requested_model = (model or "").strip()
        requested_reasoning_effort = (reasoning_effort or "").strip()
        requested_sandbox = (sandbox or "").strip()
        requested_images = [p for p in (images or []) if isinstance(p, str) and p.strip()]

        if self._raw_args is not None:
            args = list(self._raw_args)
            cleaned: List[str] = []
            idx = 0
            while idx < len(args):
                token = args[idx]
                next_token = args[idx + 1] if idx + 1 < len(args) else None

                if token in ("-m", "--model"):
                    idx += 2
                    continue
                if requested_sandbox and token in ("-s", "--sandbox"):
                    idx += 2
                    continue
                if token in ("-c", "--config") and isinstance(next_token, str):
                    if next_token.startswith("model_reasoning_effort="):
                        idx += 2
                        continue

                cleaned.append(token)
                idx += 1

            insertion_index = cleaned.index("-") if "-" in cleaned else len(cleaned)
            to_insert: List[str] = []
            if requested_images:
                to_insert.extend(["--image", *requested_images])
            if requested_sandbox:
                to_insert.extend(["-s", requested_sandbox])
            if requested_model:
                to_insert.extend(["-m", requested_model])
            if requested_reasoning_effort:
                to_insert.extend(["-c", f'model_reasoning_effort="{requested_reasoning_effort}"'])

            cleaned[insertion_index:insertion_index] = to_insert
            return cleaned

        effective_model = requested_model or self._default_model
        effective_sandbox = requested_sandbox or self._default_sandbox
        args = list(self._common_args)
        if effective_sandbox:
            args.extend(["--sandbox", effective_sandbox])
        if effective_model:
            args.extend(["-m", effective_model])
        if requested_reasoning_effort:
            args.extend(["-c", f'model_reasoning_effort="{requested_reasoning_effort}"'])
        if requested_images:
            args.extend(["--image", *requested_images])
        args.append("-")
        return args
