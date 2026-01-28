import asyncio
import json
from typing import Any, Awaitable, Callable, Dict, List


class CodexRunner:
    def __init__(self, command: str = "codex", args: List[str] | None = None):
        self._command = command
        self._args = args or ["exec", "--json", "--color", "never", "-"]

    async def run(
        self,
        prompt: str,
        on_event: Callable[[Dict[str, Any]], Awaitable[None]],
    ) -> int:
        proc = await asyncio.create_subprocess_exec(
            self._command,
            *self._args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        if proc.stdin is None or proc.stdout is None or proc.stderr is None:
            raise RuntimeError("Failed to open subprocess streams")

        proc.stdin.write(prompt.encode("utf-8"))
        proc.stdin.write(b"\n")
        await proc.stdin.drain()
        proc.stdin.close()

        async def _read_stdout():
            async for raw in proc.stdout:
                line = raw.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    event = {"type": "raw", "text": line}
                await on_event(event)

        async def _read_stderr():
            data = await proc.stderr.read()
            if data:
                await on_event({"type": "stderr", "text": data.decode("utf-8", errors="replace")})

        await asyncio.gather(_read_stdout(), _read_stderr())
        return await proc.wait()
