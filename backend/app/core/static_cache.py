"""Cache-Control for the frontend build that `app.frontend("/")` serves.

FastAPI's frontend route is a StaticFiles subclass that sends ETag and
Last-Modified and nothing else, so every page view revalidated all ~18 JS/CSS
files: one conditional request each, at ~330 ms a round trip from Kenya.

Vite fingerprints everything under `/assets/` (the hash is in the filename),
so those bytes can never change under the same URL and are safe to cache for
a year. `index.html` is the one file that names the current hashes; it must
be revalidated every time or a deploy is invisible until the cache expires.

This is a pure-ASGI middleware rather than a subclass of the static-files
app because that class (`fastapi.routing._FrontendStaticFiles`) is private.
It never touches the API: API caching semantics are the routes' business.
"""

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

IMMUTABLE = "public, max-age=31536000, immutable"
REVALIDATE = "no-cache"

ASSETS_PREFIX = "/assets/"


class FrontendCacheControlMiddleware:
    def __init__(self, app: ASGIApp, *, api_prefix: str) -> None:
        self.app = app
        self.api_prefix = api_prefix.rstrip("/")

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or self._is_api(scope["path"]):
            await self.app(scope, receive, send)
            return

        path: str = scope["path"]

        async def send_with_cache_control(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                if "cache-control" not in headers:
                    value = _cache_control_for(path, message["status"], headers)
                    if value is not None:
                        headers["cache-control"] = value
            await send(message)

        await self.app(scope, receive, send_with_cache_control)

    def _is_api(self, path: str) -> bool:
        return path == self.api_prefix or path.startswith(self.api_prefix + "/")


def _cache_control_for(path: str, status: int, headers: MutableHeaders) -> str | None:
    is_html = headers.get("content-type", "").startswith("text/html")

    if path.startswith(ASSETS_PREFIX):
        # A 200 that is HTML under /assets/ is the SPA fallback answering a
        # navigation to a file that does not exist — index.html, which must
        # never be pinned for a year. A 304 carries no content-type, but the
        # fallback's 304 is equally index.html, so it gets the same caution
        # unless the path names a real asset type.
        if status == 200 and not is_html:
            return IMMUTABLE
        if status == 304 and not path.endswith((".html", "/")):
            return IMMUTABLE
        return None

    # index.html at `/`, `/index.html`, and the SPA fallback for every
    # client-side route (`/leaders`, `/team/KC`, ...). A 304 has no
    # content-type to check; repeating no-cache on it is what keeps a
    # revalidated index.html revalidating.
    if (status == 200 and is_html) or status == 304:
        return REVALIDATE

    return None
