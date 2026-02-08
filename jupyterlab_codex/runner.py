import asyncio
import json
import os
from typing import Any, Awaitable, Callable, Dict, List


class CodexRunner:
    def __init__(self, command: str = "codex", args: List[str] | None = None):
        self._command = command
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
            "exec",
            "--json",
            "--color",
            "never",
            "--skip-git-repo-check",
        ]

    async def run(
        self,
        prompt: str,
        on_event: Callable[[Dict[str, Any]], Awaitable[None]],
        cwd: str | None = None,
        model: str | None = None,
        reasoning_effort: str | None = None,
        sandbox: str | None = None,
        images: List[str] | None = None,
    ) -> int:
        args = self._args_for_options(
            model=model, reasoning_effort=reasoning_effort, sandbox=sandbox, images=images
        )

        proc = await asyncio.create_subprocess_exec(
            self._command,
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
            async for raw in proc.stdout:
                line = raw.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    event = {"type": "raw", "text": line}
                await on_event(event)

        async def _read_stderr() -> None:
            data = await proc.stderr.read()
            if data:
                await on_event({"type": "stderr", "text": data.decode("utf-8", errors="replace")})

        try:
            await asyncio.gather(_read_stdout(), _read_stderr())
            return await proc.wait()
        except asyncio.CancelledError:
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
