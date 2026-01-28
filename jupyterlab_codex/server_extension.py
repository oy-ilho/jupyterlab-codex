from jupyter_server.utils import url_path_join

from .handlers import CodexWSHandler


def _jupyter_server_extension_points():
    return [{"module": "jupyterlab_codex.server_extension"}]


def _load_jupyter_server_extension(server_app):
    web_app = server_app.web_app
    base_url = web_app.settings.get("base_url", "/")
    route = url_path_join(base_url, "codex", "ws")

    web_app.add_handlers(
        ".*$",
        [
            (route, CodexWSHandler, {"server_app": server_app}),
        ],
    )


# Backwards compatibility alias
load_jupyter_server_extension = _load_jupyter_server_extension
