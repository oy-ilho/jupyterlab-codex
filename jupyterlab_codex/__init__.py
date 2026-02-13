from .server_extension import _jupyter_server_extension_points, load_jupyter_server_extension


def _jupyter_labextension_paths():
    return [{"src": "labextension", "dest": "jupyterlab-codex-sidebar"}]


__all__ = [
    "_jupyter_server_extension_points",
    "load_jupyter_server_extension",
    "_jupyter_labextension_paths",
]
