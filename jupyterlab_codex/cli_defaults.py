import os
from pathlib import Path
from typing import Any, Dict


def load_cli_defaults_for_ui() -> Dict[str, Any]:
    """
    Best-effort lookup of "auto" defaults so the UI can show the effective selection.

    When the UI does not explicitly pass `-m/--model` or `-c model_reasoning_effort=...`,
    Codex CLI resolves defaults from:
    - the JupyterLab extension env overrides (if set), then
    - ~/.codex/config.toml, then
    - Codex CLI built-in defaults.

    We only surface the first two signals here; if neither exists we return null values.
    """
    env_model = (os.environ.get("JUPYTERLAB_CODEX_MODEL", "") or "").strip() or None

    config = _load_codex_config_toml()
    config_model = config.get("model") if isinstance(config.get("model"), str) else None
    config_reasoning = (
        config.get("model_reasoning_effort")
        if isinstance(config.get("model_reasoning_effort"), str)
        else None
    )

    effective_model = env_model or (config_model.strip() if config_model else None)
    effective_reasoning = (config_reasoning or "").strip().lower() or None

    effective_reasoning = effective_reasoning or None

    return {
        "model": effective_model,
        "reasoningEffort": effective_reasoning,
    }


def _load_codex_config_toml() -> Dict[str, Any]:
    path = Path(os.path.expanduser("~")) / ".codex" / "config.toml"
    if not path.is_file():
        return {}

    try:
        raw = path.read_text("utf-8", errors="replace")
    except OSError:
        return {}

    parsed = _try_tomllib_loads(raw)
    if isinstance(parsed, dict):
        return parsed

    # Fallback: very small TOML subset parser for root-level "key = value" pairs.
    return _parse_root_scalar_assignments(raw)


def _try_tomllib_loads(raw: str) -> Dict[str, Any] | None:
    try:
        import tomllib  # py>=3.11
    except Exception:
        return None

    try:
        loaded = tomllib.loads(raw)
    except Exception:
        return None

    return loaded if isinstance(loaded, dict) else None


def _parse_root_scalar_assignments(raw: str) -> Dict[str, Any]:
    current_table: str | None = ""
    out: Dict[str, Any] = {}

    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        # Table headers: after the first table, we stop parsing root keys.
        if stripped.startswith("[") and stripped.endswith("]"):
            current_table = stripped.strip("[]").strip()
            continue

        if current_table:
            continue

        if "=" not in stripped:
            continue

        key, value = stripped.split("=", 1)
        key = key.strip()
        if key not in {"model", "model_reasoning_effort"}:
            continue

        value = value.split("#", 1)[0].strip()
        out[key] = _parse_toml_scalar(value)

    return out


def _parse_toml_scalar(value: str) -> Any:
    # Only handle basic quoted strings; anything else is returned as-is.
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        # Keep this simple; config values we care about are typically plain strings.
        return value[1:-1]
    return value
