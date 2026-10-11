"""Web search + page fetching for the web tools.

* DuckDuckGo (default): no account or key; parses the HTML results page.
* Ollama web search (optional): uses the user's own Ollama API key, stored in the OS credential vault.
* fetch_page(): reads public pages only — localhost / private / link-local addresses are refused (SSRF guard).
"""
from __future__ import annotations

import asyncio
import html
import ipaddress
import re
import socket
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import parse_qs, unquote, urlparse

import httpx

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) FRIDAY/0.1"
MAX_PAGE_CHARS = 12_000
MAX_DOWNLOAD = 2_000_000


class WebError(Exception):
    pass


@dataclass
class SearchResult:
    title: str
    url: str
    snippet: str


# ---------------------------------------------------------------- search backends
_DDG_RESULT = re.compile(r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>(.*?)(?=<a[^>]+class="result__a"|$)', re.S)
_DDG_SNIPPET = re.compile(r'class="result__snippet"[^>]*>(.*?)</a>', re.S)
_TAGS = re.compile(r"<[^>]+>")


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(_TAGS.sub("", s))).strip()


def _ddg_target(href: str) -> str:
    """DuckDuckGo wraps links as //duckduckgo.com/l/?uddg=<encoded target>."""
    if href.startswith("//"):
        href = "https:" + href
    u = urlparse(href)
    if u.netloc.endswith("duckduckgo.com") and u.path.startswith("/l/"):
        return unquote(parse_qs(u.query).get("uddg", [href])[0])
    return href


async def duckduckgo(query: str, n: int = 5, transport: httpx.AsyncBaseTransport | None = None) -> list[SearchResult]:
    try:
        async with httpx.AsyncClient(transport=transport, timeout=15, headers={"User-Agent": UA}, follow_redirects=True) as c:
            r = await c.post("https://html.duckduckgo.com/html/", data={"q": query})
    except httpx.HTTPError as exc:
        raise WebError(f"Web search failed ({type(exc).__name__}).") from None
    if r.status_code != 200:
        raise WebError(f"Web search failed (HTTP {r.status_code}).")
    out: list[SearchResult] = []
    for href, title, rest in _DDG_RESULT.findall(r.text):
        url = _ddg_target(html.unescape(href))
        if not url.startswith(("http://", "https://")) or "duckduckgo.com/y.js" in url:
            continue  # ads / internal links
        snip = _DDG_SNIPPET.search(rest)
        out.append(SearchResult(_clean(title), url, _clean(snip.group(1)) if snip else ""))
        if len(out) >= n:
            break
    return out


async def ollama_search(query: str, n: int, api_key: str, transport: httpx.AsyncBaseTransport | None = None) -> list[SearchResult]:
    try:
        async with httpx.AsyncClient(transport=transport, timeout=20) as c:
            r = await c.post("https://ollama.com/api/web_search", json={"query": query, "max_results": max(1, min(n, 10))},
                             headers={"Authorization": f"Bearer {api_key}"})
    except httpx.HTTPError as exc:
        raise WebError(f"Ollama web search failed ({type(exc).__name__}).") from None
    if r.status_code in (401, 403):
        raise WebError("Ollama web search rejected the API key. Check it in Settings → Tools.")
    if r.status_code != 200:
        raise WebError(f"Ollama web search failed (HTTP {r.status_code}).")
    return [SearchResult(x.get("title") or x.get("url", ""), x.get("url", ""), (x.get("content") or "")[:500])
            for x in r.json().get("results", []) if x.get("url")]


# ---------------------------------------------------------------- page fetching
def _is_public(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            return False
    return True


async def check_public_url(url: str) -> str:
    u = urlparse(url.strip())
    if u.scheme not in ("http", "https") or not u.hostname:
        raise WebError("Only http(s) web addresses can be fetched.")
    if not await asyncio.to_thread(_is_public, u.hostname):
        raise WebError("That address is on this computer or a private network, so FRIDAY won't fetch it.")
    return u.geturl()


class _Text(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "nav", "footer", "header", "form", "iframe", "template"}
    BLOCK = {"p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "section", "article", "pre", "blockquote"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.skip = 0
        self.title = ""
        self._in_title = False

    def handle_starttag(self, tag, attrs):  # noqa: ANN001, ARG002
        if tag in self.SKIP:
            self.skip += 1
        elif tag == "title":
            self._in_title = True
        elif tag in self.BLOCK:
            self.out.append("\n")

    def handle_endtag(self, tag):  # noqa: ANN001
        if tag in self.SKIP and self.skip:
            self.skip -= 1
        elif tag == "title":
            self._in_title = False
        elif tag in self.BLOCK:
            self.out.append("\n")

    def handle_data(self, data):  # noqa: ANN001
        if self._in_title:
            self.title += data
        elif not self.skip:
            self.out.append(data)


def html_to_text(raw: str) -> tuple[str, str]:
    p = _Text()
    p.feed(raw)
    text = re.sub(r"[ \t\r\f\v]+", " ", "".join(p.out))
    text = re.sub(r"\n\s*\n+", "\n\n", text).strip()
    return p.title.strip(), text


async def fetch_page(url: str, transport: httpx.AsyncBaseTransport | None = None) -> tuple[str, str, str]:
    """Returns (final_url, title, text). Follows up to 5 redirects, re-checking every hop."""
    current = await check_public_url(url)
    async with httpx.AsyncClient(transport=transport, timeout=20, headers={"User-Agent": UA}, follow_redirects=False) as c:
        for _ in range(6):
            try:
                async with c.stream("GET", current) as r:
                    if r.status_code in (301, 302, 303, 307, 308) and r.headers.get("location"):
                        current = await check_public_url(str(r.url.join(r.headers["location"])))
                        continue
                    if r.status_code != 200:
                        raise WebError(f"The page returned HTTP {r.status_code}.")
                    ctype = r.headers.get("content-type", "")
                    if not any(t in ctype for t in ("text/html", "text/plain", "application/xhtml", "application/json", "text/markdown")):
                        raise WebError(f"Unsupported page type ({ctype.split(';')[0] or 'unknown'}).")
                    body = b""
                    async for chunk in r.aiter_bytes():
                        body += chunk
                        if len(body) > MAX_DOWNLOAD:
                            break
                    raw = body.decode(r.encoding or "utf-8", "replace")
            except httpx.HTTPError as exc:
                raise WebError(f"Could not load the page ({type(exc).__name__}).") from None
            if "html" in ctype:
                title, text = html_to_text(raw)
            else:
                title, text = "", raw
            return current, title or urlparse(current).hostname or current, text[:MAX_PAGE_CHARS]
    raise WebError("Too many redirects.")
