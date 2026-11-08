"""Static site server with a small persistent guestbook API.

Run with: python server.py
Open from another device on the same network with the printed LAN address.
"""

from __future__ import annotations

import gzip
import copy
import hashlib
import hmac
import ipaddress
import io
import json
import mimetypes
import os
import re
import secrets
import shutil
import socket
import tempfile
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("GUESTBOOK_DATA_DIR", str(ROOT / "data")))
DATA_FILE = DATA_DIR / "guestbook.json"
ANALYTICS_FILE = DATA_DIR / "analytics.json"
ANALYTICS_KEY_FILE = DATA_DIR / "analytics.key"
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8765"))
MAX_BODY = 16 * 1024
COLORS = {"yellow", "green", "pink", "blue"}
ANALYTICS_PAGE_NAMES = {
    "station": "启程站台",
    "diary": "夏日手账",
    "archive": "兴趣档案",
    "toolbox": "电脑手记",
    "letters": "纸条信箱",
    "vision": "数字视界",
}
ANALYTICS_ENABLED = os.environ.get("ENABLE_ANALYTICS", "0") == "1"
ANALYTICS_RETENTION_DAYS = 400
JOURNEY_RETENTION_DAYS = 90
JOURNEY_MAX_EVENTS = 50_000
JOURNEY_SESSION_GAP_MS = 30 * 60 * 1000
ANALYTICS_VISITOR_COOKIE = "jxgarden_visitor"
ANALYTICS_SKIP_COOKIE = "jxgarden_skip_analytics"
BEIJING_TIMEZONE = timezone(timedelta(hours=8))
LOCK = threading.RLock()
ADMIN_COOKIE = "jxgarden_admin"
ADMIN_SESSION_SECONDS = 2 * 60 * 60
ADMIN_PASSWORD_ITERATIONS = 600_000
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_MAX_ATTEMPTS = 5
ADMIN_ALLOWED_ORIGINS = frozenset(
    origin.strip().rstrip("/")
    for origin in os.environ.get(
        "ADMIN_ALLOWED_ORIGINS",
        "http://localhost:8765,http://127.0.0.1:8765",
    ).split(",")
    if origin.strip()
)
LOGIN_FAILURES: dict[str, list[float]] = {}
LOGIN_LOCK = threading.Lock()

WELCOME_NOTE = {
    "id": "welcome-note",
    "author": "站主",
    "color": "green",
    "content": "欢迎来到我的留言页。可以聊聊你看到这里的感受，也可以分享最近喜欢的歌、书、游戏或生活片段。",
    "time": "置顶",
    "createdAt": 0,
    "owner": True,
    "reactionCount": 0,
    "replies": [],
}


def display_time() -> str:
    now = datetime.now()
    return f"{now.month}月{now.day}日 {now:%H:%M}"


def clean_text(value: object, maximum: int, field: str) -> str:
    text = " ".join(str(value or "").replace("\x00", "").split())
    if not text:
        raise ValueError(f"请填写{field}。")
    if len(text) > maximum:
        raise ValueError(f"{field}不能超过 {maximum} 个字。")
    return text


def initial_store() -> dict:
    return {"version": 1, "updatedAt": int(time.time() * 1000), "notes": [copy.deepcopy(WELCOME_NOTE)]}


def read_store() -> dict:
    with LOCK:
        if not DATA_FILE.exists():
            write_store(initial_store())
        try:
            store = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise OSError("Guestbook archive could not be read; the original file was preserved") from error
        notes = store.get("notes") if isinstance(store, dict) else None
        if not isinstance(notes, list):
            raise OSError("Guestbook archive is invalid; the original file was preserved")
        if not any(str(note.get("id")) == "welcome-note" for note in store["notes"]):
            store["notes"].insert(0, copy.deepcopy(WELCOME_NOTE))
        return store


def write_store(store: dict) -> None:
    with LOCK:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        store["updatedAt"] = int(time.time() * 1000)
        payload = json.dumps(store, ensure_ascii=False, indent=2)
        handle, temp_name = tempfile.mkstemp(prefix="guestbook-", suffix=".tmp", dir=DATA_DIR)
        try:
            with os.fdopen(handle, "w", encoding="utf-8") as temp_file:
                temp_file.write(payload)
                temp_file.flush()
                os.fsync(temp_file.fileno())
            os.replace(temp_name, DATA_FILE)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)


def beijing_now() -> datetime:
    return datetime.now(timezone.utc).astimezone(BEIJING_TIMEZONE)


def analytics_key() -> bytes:
    with LOCK:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        try:
            key_text = ANALYTICS_KEY_FILE.read_text(encoding="ascii").strip()
        except FileNotFoundError:
            key_text = secrets.token_bytes(32).hex()
            try:
                with ANALYTICS_KEY_FILE.open("x", encoding="ascii") as key_file:
                    key_file.write(key_text)
                    key_file.flush()
                    os.fsync(key_file.fileno())
                if os.name != "nt":
                    os.chmod(ANALYTICS_KEY_FILE, 0o600)
            except FileExistsError:
                key_text = ANALYTICS_KEY_FILE.read_text(encoding="ascii").strip()
        try:
            key = bytes.fromhex(key_text)
        except ValueError as error:
            raise OSError("Analytics privacy key is invalid") from error
        if len(key) != 32:
            raise OSError("Analytics privacy key is invalid")
        return key


def initial_analytics_store() -> dict:
    return {"version": 1, "updatedAt": 0, "days": {}, "people": {}, "journeys": {"startedAt": 0, "events": []}}


def read_analytics_store() -> dict:
    with LOCK:
        if not ANALYTICS_FILE.exists():
            return initial_analytics_store()
        try:
            store = json.loads(ANALYTICS_FILE.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            raise OSError("Analytics archive could not be read; the original file was preserved") from error
        if not isinstance(store, dict) or not isinstance(store.get("days"), dict) or not isinstance(store.get("people"), dict):
            raise OSError("Analytics archive is invalid; the original file was preserved")
        for date_key, day in store["days"].items():
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_key) or not isinstance(day, dict):
                raise OSError("Analytics daily archive is invalid")
            for field in ("visitors", "returningVisitors"):
                ids = day.get(field, [])
                if not isinstance(ids, list) or not all(isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) for value in ids):
                    raise OSError("Analytics visitor archive is invalid")
            views, page_ids, hours = day.get("pageViews", {}), day.get("pageVisitors", {}), day.get("hours", [0] * 24)
            if not isinstance(views, dict) or not all(key in ANALYTICS_PAGE_NAMES and type(value) is int and value >= 0 for key, value in views.items()):
                raise OSError("Analytics page archive is invalid")
            if not isinstance(page_ids, dict) or not all(key in ANALYTICS_PAGE_NAMES and isinstance(ids, list) and all(isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) for value in ids) for key, ids in page_ids.items()):
                raise OSError("Analytics page visitor archive is invalid")
            if not isinstance(hours, list) or len(hours) != 24 or not all(type(value) is int and value >= 0 for value in hours):
                raise OSError("Analytics hourly archive is invalid")
        if not all(isinstance(person, dict) and all(isinstance(person.get(field), str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", person[field]) for field in ("firstDay", "lastDay")) for person in store["people"].values()):
            raise OSError("Analytics visitor history is invalid")
        journeys = store.setdefault("journeys", {"startedAt": 0, "events": []})
        if not isinstance(journeys, dict) or type(journeys.get("startedAt")) is not int or journeys["startedAt"] < 0 or not isinstance(journeys.get("events"), list):
            raise OSError("Visitor journey archive is invalid")
        for event in journeys["events"]:
            if (not isinstance(event, dict) or not isinstance(event.get("visitor"), str)
                    or not re.fullmatch(r"[0-9a-f]{64}", event["visitor"])
                    or not isinstance(event.get("page"), str) or event["page"] not in ANALYTICS_PAGE_NAMES
                    or type(event.get("at")) is not int or event["at"] <= 0):
                raise OSError("Visitor journey event is invalid")
        return store


def write_analytics_store(store: dict) -> None:
    with LOCK:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        store["updatedAt"] = int(time.time() * 1000)
        payload = json.dumps(store, ensure_ascii=False, separators=(",", ":"))
        handle, temp_name = tempfile.mkstemp(prefix="analytics-", suffix=".tmp", dir=DATA_DIR)
        try:
            if os.name != "nt":
                os.fchmod(handle, 0o600)
            with os.fdopen(handle, "w", encoding="utf-8") as temp_file:
                temp_file.write(payload)
                temp_file.flush()
                os.fsync(temp_file.fileno())
            os.replace(temp_name, ANALYTICS_FILE)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)


def cookie_value(cookie_header: str, name: str) -> str:
    for item in cookie_header.split(";"):
        cookie_name, separator, value = item.strip().partition("=")
        if separator and cookie_name == name:
            return value
    return ""


def analytics_day_template() -> dict:
    return {"visitors": [], "returningVisitors": [], "pageViews": {}, "pageVisitors": {}, "hours": [0] * 24}


def journey_sessions(events: list[dict]) -> list[list[dict]]:
    sessions: list[list[dict]] = []
    for event in sorted(events, key=lambda item: item["at"]):
        if not sessions or event["at"] - sessions[-1][-1]["at"] >= JOURNEY_SESSION_GAP_MS:
            sessions.append([])
        sessions[-1].append(event)
    return sessions


def journey_summary(visitor: str, events: list[dict]) -> dict:
    sessions = journey_sessions(events)
    ordered = [event for session in sessions for event in session]
    return {
        "id": visitor, "label": "旅人 · " + visitor[:8].upper(),
        "firstAt": ordered[0]["at"], "lastAt": ordered[-1]["at"],
        "views": len(ordered), "uniquePages": len({event["page"] for event in ordered}),
        "sessionCount": len(sessions), "recentPages": [event["page"] for event in sessions[-1]][-4:],
    }


def admin_auth_path() -> Path:
    return DATA_DIR / "admin-auth.json"


def read_admin_auth() -> dict:
    try:
        auth = json.loads(admin_auth_path().read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise OSError("Admin credentials are unavailable or invalid") from error
    required = {"passwordSalt", "passwordHash", "sessionSecret", "passwordIterations"}
    if not isinstance(auth, dict) or not required.issubset(auth):
        raise OSError("Admin credentials are incomplete")
    return auth


def write_admin_auth(auth: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(auth, separators=(",", ":")) + "\n"
    handle, temp_name = tempfile.mkstemp(prefix="admin-auth-", suffix=".tmp", dir=DATA_DIR)
    try:
        if os.name != "nt":
            os.fchmod(handle, 0o600)
        with os.fdopen(handle, "w", encoding="utf-8") as temp_file:
            temp_file.write(payload)
            temp_file.flush()
            os.fsync(temp_file.fileno())
        os.replace(temp_name, admin_auth_path())
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def password_matches(password: str, auth: dict) -> bool:
    try:
        salt = bytes.fromhex(auth["passwordSalt"])
        expected = bytes.fromhex(auth["passwordHash"])
        iterations = int(auth["passwordIterations"])
        if len(salt) < 16 or len(expected) != 32 or iterations < 100_000:
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations, dklen=32)
        return hmac.compare_digest(actual, expected)
    except (KeyError, TypeError, ValueError):
        return False


def create_admin_session(auth: dict) -> tuple[str, int]:
    expires_at = int(time.time()) + ADMIN_SESSION_SECONDS
    payload = f"{expires_at}.{secrets.token_urlsafe(24)}"
    secret = bytes.fromhex(auth["sessionSecret"])
    signature = hmac.new(secret, payload.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}", expires_at


def admin_session_expiry(cookie_header: str, auth: dict) -> int | None:
    for item in cookie_header.split(";"):
        name, separator, value = item.strip().partition("=")
        if separator and name == ADMIN_COOKIE:
            try:
                expires_text, nonce, signature = value.split(".", 2)
                expires_at = int(expires_text)
                if expires_at <= int(time.time()) or not nonce:
                    return None
                payload = f"{expires_text}.{nonce}"
                expected = hmac.new(
                    bytes.fromhex(auth["sessionSecret"]), payload.encode("ascii"), hashlib.sha256
                ).hexdigest()
                if hmac.compare_digest(expected, signature):
                    return expires_at
            except (KeyError, TypeError, ValueError):
                return None
    return None


def reserve_login_attempt(client_ip: str) -> bool:
    now = time.monotonic()
    with LOGIN_LOCK:
        attempts = [stamp for stamp in LOGIN_FAILURES.get(client_ip, []) if now - stamp < LOGIN_WINDOW_SECONDS]
        if len(attempts) >= LOGIN_MAX_ATTEMPTS:
            LOGIN_FAILURES[client_ip] = attempts
            return False
        attempts.append(now)
        if attempts:
            LOGIN_FAILURES[client_ip] = attempts
        else:
            LOGIN_FAILURES.pop(client_ip, None)
        LOGIN_FAILURES[client_ip] = attempts
        return True


def clear_login_failures(client_ip: str) -> None:
    with LOGIN_LOCK:
        LOGIN_FAILURES.pop(client_ip, None)


class WebsiteHandler(SimpleHTTPRequestHandler):
    server_version = "MemoryArchive/1.0"
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def handle(self) -> None:
        try:
            super().handle()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # Browsers may close idle connections without sending another request.

    def log_message(self, fmt: str, *args) -> None:
        if urlparse(self.path).path == "/api/analytics/visit":
            return
        print(f"[{self.log_date_time_string()}] {self.client_address[0]} {fmt % args}")

    def end_headers(self) -> None:
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        elif re.search(r"\.(?:css|js)$", path, re.I) and not urlparse(self.path).query:
            self.send_header("Cache-Control", "no-cache")
        elif re.search(r"\.(?:css|js|webp|png|jpe?g|svg|woff2?)$", path, re.I):
            self.send_header("Cache-Control", "public, max-age=604800")
        elif re.search(r"\.(?:mp4|mp3|flac|mflac)$", path, re.I):
            self.send_header("Cache-Control", "public, max-age=2592000")
        else:
            self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        if path in {"/html/admin.html", "/html/admin-analytics.html"}:
            self.send_header("X-Frame-Options", "DENY")
            self.send_header(
                "Content-Security-Policy",
                "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
                "connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
            )
        super().end_headers()

    def send_head(self):
        """Serve byte ranges so large local audio starts without a full download."""
        range_header = self.headers.get("Range")
        request_path = urlparse(self.path).path
        translated = Path(self.translate_path(request_path))
        if any(part.startswith(".") for part in Path(unquote(request_path)).parts if part not in ("/", "\\")):
            self.send_error(HTTPStatus.NOT_FOUND)
            return None
        try:
            private_root = DATA_DIR.resolve()
            translated_resolved = translated.resolve()
            if translated_resolved == private_root or private_root in translated_resolved.parents:
                self.send_error(HTTPStatus.NOT_FOUND)
                return None
        except OSError:
            pass
        encodings = self.headers.get("Accept-Encoding", "")
        accepts_gzip = any(
            encoding.strip().lower() == "gzip"
            for encoding in encodings.split(",")
        )
        if not range_header and accepts_gzip and translated.is_file() and translated.suffix.lower() in {".html", ".css", ".js"}:
            compressed = gzip.compress(translated.read_bytes())
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", self.guess_type(str(translated)))
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Vary", "Accept-Encoding")
            self.send_header("Content-Length", str(len(compressed)))
            self.end_headers()
            return io.BytesIO(compressed)
        if range_header and translated.is_file():
            match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header.strip())
            if match:
                file_size = translated.stat().st_size
                start_text, end_text = match.groups()
                if start_text:
                    start = int(start_text)
                    end = min(int(end_text) if end_text else file_size - 1, file_size - 1)
                else:
                    suffix = min(int(end_text or "0"), file_size)
                    start = file_size - suffix
                    end = file_size - 1
                if 0 <= start <= end < file_size:
                    stream = translated.open("rb")
                    stream.seek(start)
                    self._range_remaining = end - start + 1
                    self.send_response(HTTPStatus.PARTIAL_CONTENT)
                    self.send_header("Content-Type", self.guess_type(str(translated)))
                    self.send_header("Accept-Ranges", "bytes")
                    self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
                    self.send_header("Content-Length", str(self._range_remaining))
                    self.send_header("Last-Modified", self.date_time_string(translated.stat().st_mtime))
                    self.end_headers()
                    return stream
            self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            self.send_header("Content-Range", f"bytes */{translated.stat().st_size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None
        return super().send_head()

    def copyfile(self, source, outputfile) -> None:
        remaining = getattr(self, "_range_remaining", None)
        try:
            if remaining is None:
                shutil.copyfileobj(source, outputfile)
                return
            while remaining > 0:
                chunk = source.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                outputfile.write(chunk)
                remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # Media requests are routinely cancelled when visitors navigate away.
        finally:
            if hasattr(self, "_range_remaining"):
                del self._range_remaining

    def send_json(
        self,
        payload: dict,
        status: HTTPStatus = HTTPStatus.OK,
        set_cookie: str | None = None,
    ) -> None:
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        accepts_gzip = "gzip" in self.headers.get("Accept-Encoding", "")
        body = gzip.compress(raw, compresslevel=5) if accepts_gzip and len(raw) > 512 else raw
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        if body is not raw:
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Vary", "Accept-Encoding")
        if set_cookie:
            self.send_header("Set-Cookie", set_cookie)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_admin_json(
        self,
        payload: dict,
        status: HTTPStatus = HTTPStatus.OK,
        set_cookie: str | list[str] | None = None,
    ) -> None:
        raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if isinstance(set_cookie, list):
            for cookie in set_cookie:
                self.send_header("Set-Cookie", cookie)
        elif set_cookie:
            self.send_header("Set-Cookie", set_cookie)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def admin_origin_allowed(self) -> bool:
        return self.headers.get("Origin", "").rstrip("/") in ADMIN_ALLOWED_ORIGINS

    def admin_client_ip(self) -> str:
        candidate = self.headers.get("X-Real-IP", "")
        try:
            return str(ipaddress.ip_address(candidate)) if candidate else self.client_address[0]
        except ValueError:
            return self.client_address[0]

    def admin_auth_or_reply(self) -> tuple[dict | None, int | None]:
        try:
            auth = read_admin_auth()
        except OSError:
            self.send_admin_json({"error": "站主管理暂不可用，请联系网站维护者。"}, HTTPStatus.SERVICE_UNAVAILABLE)
            return None, None
        expiry = admin_session_expiry(self.headers.get("Cookie", ""), auth)
        if expiry is None:
            self.send_admin_json({"error": "请先登录站主管理页。"}, HTTPStatus.UNAUTHORIZED)
            return None, None
        return auth, expiry

    def admin_login(self) -> None:
        if not self.admin_origin_allowed():
            self.send_admin_json({"error": "登录请求来源不受允许。"}, HTTPStatus.FORBIDDEN)
            return
        client_ip = self.admin_client_ip()
        if not reserve_login_attempt(client_ip):
            self.send_admin_json({"error": "尝试次数过多，请 15 分钟后再试。"}, HTTPStatus.TOO_MANY_REQUESTS)
            return
        try:
            body = self.read_json()
        except ValueError as error:
            self.send_admin_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
            return
        try:
            auth = read_admin_auth()
        except OSError:
            self.send_admin_json({"error": "站主管理尚未初始化，请联系网站维护者。"}, HTTPStatus.SERVICE_UNAVAILABLE)
            return
        password = body.get("password")
        if not isinstance(password, str) or len(password) > 256 or not password_matches(password, auth):
            self.send_admin_json({"error": "密码不正确。"}, HTTPStatus.UNAUTHORIZED)
            return
        clear_login_failures(client_ip)
        token, expiry = create_admin_session(auth)
        cookie = (
            f"{ADMIN_COOKIE}={token}; Path=/api/admin; Max-Age={ADMIN_SESSION_SECONDS}; "
            "HttpOnly; Secure; SameSite=Strict"
        )
        skip_cookie = (
            f"{ANALYTICS_SKIP_COOKIE}=1; Path=/; Max-Age={ANALYTICS_RETENTION_DAYS * 24 * 60 * 60}; "
            "HttpOnly; Secure; SameSite=Strict"
        )
        self.send_admin_json({"authenticated": True, "expiresAt": expiry}, set_cookie=[cookie, skip_cookie])

    def admin_logout(self) -> None:
        if not self.admin_origin_allowed():
            self.send_admin_json({"error": "退出请求来源不受允许。"}, HTTPStatus.FORBIDDEN)
            return
        try:
            with LOCK:
                auth = read_admin_auth()
                if admin_session_expiry(self.headers.get("Cookie", ""), auth) is not None:
                    auth["sessionSecret"] = secrets.token_bytes(32).hex()
                    write_admin_auth(auth)
        except OSError:
            self.send_admin_json({"error": "退出登录未完成，请稍后重试。"}, HTTPStatus.SERVICE_UNAVAILABLE)
            return
        cookies = [
            f"{ADMIN_COOKIE}=; Path=/api/admin; Max-Age=0; HttpOnly; Secure; SameSite=Strict",
            f"{ANALYTICS_SKIP_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict",
        ]
        self.send_admin_json({"authenticated": False}, set_cookie=cookies)

    def record_analytics_visit(self) -> None:
        try:
            body = self.read_json()
        except ValueError as error:
            self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
            return
        if not ANALYTICS_ENABLED:
            self.send_json({"recorded": False})
            return
        origin = self.headers.get("Origin", "").rstrip("/")
        parsed_origin = urlparse(origin)
        local_origin = parsed_origin.scheme == "http" and parsed_origin.hostname in {"localhost", "127.0.0.1"}
        if origin not in ADMIN_ALLOWED_ORIGINS and not local_origin:
            self.send_json({"recorded": False}, HTTPStatus.FORBIDDEN)
            return
        if self.headers.get("DNT") == "1" or self.headers.get("Sec-GPC") == "1":
            self.send_json({"recorded": False})
            return
        if cookie_value(self.headers.get("Cookie", ""), ANALYTICS_SKIP_COOKIE) == "1":
            self.send_json({"recorded": False})
            return
        page_key = body.get("page")
        if not isinstance(page_key, str) or page_key not in ANALYTICS_PAGE_NAMES:
            self.send_json({"error": "页面标记无效。"}, HTTPStatus.BAD_REQUEST)
            return

        visitor_id = cookie_value(self.headers.get("Cookie", ""), ANALYTICS_VISITOR_COOKIE)
        visitor_cookie = None
        try:
            if visitor_id:
                visitor_id = str(uuid.UUID(visitor_id))
            else:
                raise ValueError("Visitor cookie is missing")
        except ValueError:
            visitor_id = str(uuid.uuid4())
            origin_is_https = origin.startswith("https://")
            proxy_is_https = self.headers.get("X-Forwarded-Proto", "").lower() == "https"
            secure_flag = "Secure; " if origin_is_https or proxy_is_https else ""
            visitor_cookie = (
                f"{ANALYTICS_VISITOR_COOKIE}={visitor_id}; Path=/api/analytics; "
                f"Max-Age={ANALYTICS_RETENTION_DAYS * 24 * 60 * 60}; HttpOnly; {secure_flag}SameSite=Lax"
            )
        now = beijing_now()
        day_key = now.date().isoformat()
        try:
            visitor_hash = hmac.new(analytics_key(), visitor_id.encode("ascii"), hashlib.sha256).hexdigest()
            with LOCK:
                store = read_analytics_store()
                day_data = store["days"].setdefault(day_key, analytics_day_template())
                if not isinstance(day_data, dict):
                    raise OSError("Analytics daily archive is invalid")
                people = store["people"]
                person = people.get(visitor_hash)
                if not isinstance(person, dict):
                    person = {"firstDay": day_key, "lastDay": day_key}
                    people[visitor_hash] = person

                visitors = set(day_data.get("visitors", []))
                if visitor_hash not in visitors:
                    visitors.add(visitor_hash)
                    day_data["visitors"] = sorted(visitors)
                    if str(person.get("firstDay", day_key)) < day_key:
                        returning = set(day_data.get("returningVisitors", []))
                        returning.add(visitor_hash)
                        day_data["returningVisitors"] = sorted(returning)

                page_views = day_data.setdefault("pageViews", {})
                if not isinstance(page_views, dict):
                    raise OSError("Analytics page archive is invalid")
                page_views[page_key] = int(page_views.get(page_key, 0)) + 1
                page_visitors = day_data.setdefault("pageVisitors", {})
                if not isinstance(page_visitors, dict):
                    raise OSError("Analytics page archive is invalid")
                page_ids = set(page_visitors.get(page_key, []))
                page_ids.add(visitor_hash)
                page_visitors[page_key] = sorted(page_ids)
                hours = day_data.setdefault("hours", [0] * 24)
                if not isinstance(hours, list) or len(hours) != 24:
                    raise OSError("Analytics time archive is invalid")
                hours[now.hour] = int(hours[now.hour]) + 1
                person["lastDay"] = day_key

                cutoff = (now.date() - timedelta(days=ANALYTICS_RETENTION_DAYS - 1)).isoformat()
                store["days"] = {key: value for key, value in store["days"].items() if key >= cutoff}
                store["people"] = {
                    key: value for key, value in people.items()
                    if isinstance(value, dict) and str(value.get("lastDay", "")) >= cutoff
                }
                journeys = store["journeys"]
                timestamp = int(now.timestamp() * 1000)
                if not journeys["startedAt"]:
                    journeys["startedAt"] = timestamp
                journeys["events"].append({"visitor": visitor_hash, "page": page_key, "at": timestamp})
                journey_cutoff = int((now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=JOURNEY_RETENTION_DAYS - 1)).timestamp() * 1000)
                journeys["events"] = [event for event in journeys["events"] if event["at"] >= journey_cutoff][-JOURNEY_MAX_EVENTS:]
                write_analytics_store(store)
        except (OSError, ValueError, TypeError, KeyError, UnicodeError) as error:
            print(f"Analytics storage error: {error!r}")
            self.send_json({"recorded": False}, HTTPStatus.SERVICE_UNAVAILABLE)
            return
        self.send_json({"recorded": True}, set_cookie=visitor_cookie)

    def analytics_report(self) -> None:
        auth, _ = self.admin_auth_or_reply()
        if auth is None:
            return
        query = parse_qs(urlparse(self.path).query)
        try:
            days = int(query.get("days", ["30"])[0])
        except (ValueError, TypeError):
            days = 30
        if days not in {7, 30, 90}:
            days = 30
        now = beijing_now()
        today = now.date()
        first_day = today - timedelta(days=days - 1)
        try:
            store = read_analytics_store()
        except OSError as error:
            print(f"Analytics storage error: {error!r}")
            self.send_admin_json({"error": "来访档案暂时无法读取。"}, HTTPStatus.SERVICE_UNAVAILABLE)
            return

        series = []
        all_visitors: set[str] = set()
        returning_visitors: set[str] = set()
        page_totals: dict[str, dict] = {}
        hour_totals = [0] * 24
        total_views = 0
        for offset in range(days):
            date = first_day + timedelta(days=offset)
            date_key = date.isoformat()
            day_data = store["days"].get(date_key, {})
            visitors = {str(value) for value in day_data.get("visitors", [])}
            daily_returning = {str(value) for value in day_data.get("returningVisitors", [])}
            all_visitors.update(visitors)
            returning_visitors.update(daily_returning)
            daily_pages = day_data.get("pageViews", {})
            views = sum(max(0, int(value)) for value in daily_pages.values())
            total_views += views
            series.append({"date": date_key, "label": f"{date.month}/{date.day}", "visitors": len(visitors), "views": views})
            for hour, count in enumerate(day_data.get("hours", [0] * 24)):
                if hour < 24:
                    hour_totals[hour] += max(0, int(count))
            page_visitor_data = day_data.get("pageVisitors", {})
            for key, views_for_page in daily_pages.items():
                if key not in ANALYTICS_PAGE_NAMES:
                    continue
                current = page_totals.setdefault(key, {"views": 0, "visitors": set()})
                current["views"] += max(0, int(views_for_page))
                current["visitors"].update(str(value) for value in page_visitor_data.get(key, []))

        returning_visitors.intersection_update(all_visitors)
        previous_first_day = first_day - timedelta(days=days)
        previous_visitors: set[str] = set()
        previous_views = 0
        previous_series = []
        for offset in range(days):
            date = previous_first_day + timedelta(days=offset)
            day_data = store["days"].get(date.isoformat(), {})
            visitors = set(day_data.get("visitors", []))
            views = sum(day_data.get("pageViews", {}).values())
            previous_visitors.update(visitors)
            previous_views += views
            previous_series.append({"date": date.isoformat(), "visitors": len(visitors), "views": views})
        first_day_key = first_day.isoformat()
        new_visitors = sum(
            1 for visitor in all_visitors
            if str(store["people"].get(visitor, {}).get("firstDay", "")) >= first_day_key
        )
        today_data = store["days"].get(today.isoformat(), {})
        today_views = sum(max(0, int(value)) for value in today_data.get("pageViews", {}).values())
        today_visitors = len(set(today_data.get("visitors", [])))
        peak = max(series, key=lambda item: (item["visitors"], item["views"]), default=None)
        if peak and peak["visitors"] == 0 and peak["views"] == 0:
            peak = None
        time_bands = [
            {"key": "morning", "label": "上午", "range": "06—12", "views": sum(hour_totals[6:12])},
            {"key": "noon", "label": "午间", "range": "12—14", "views": sum(hour_totals[12:14])},
            {"key": "afternoon", "label": "午后", "range": "14—18", "views": sum(hour_totals[14:18])},
            {"key": "night", "label": "夜晚", "range": "18—06", "views": sum(hour_totals[18:]) + sum(hour_totals[:6])},
        ]
        pages = [
            {"key": key, "name": ANALYTICS_PAGE_NAMES[key], "views": value["views"], "visitors": len(value["visitors"])}
            for key, value in page_totals.items()
        ]
        pages.sort(key=lambda item: (-item["views"], item["name"]))
        report = {
            "rangeDays": days,
            "from": first_day.isoformat(),
            "to": today.isoformat(),
            "timezone": "Asia/Shanghai",
            "updatedAt": store.get("updatedAt", 0),
            "hasData": bool(all_visitors or total_views),
            "overview": {
                "todayVisitors": today_visitors,
                "todayViews": today_views,
                "uniqueVisitors": len(all_visitors),
                "pageViews": total_views,
                "returningVisitors": len(returning_visitors),
                "returnRate": round(len(returning_visitors) / len(all_visitors) * 100, 1) if all_visitors else 0,
                "averageDepth": round(total_views / len(all_visitors), 1) if all_visitors else 0,
                "newVisitors": new_visitors,
                "peakDay": peak,
            },
            "series": series,
            "pages": pages,
            "hours": hour_totals,
            "timeBands": time_bands,
            "comparison": {
                "from": previous_first_day.isoformat(),
                "to": (first_day - timedelta(days=1)).isoformat(),
                "hasData": bool(previous_visitors or previous_views),
                "uniqueVisitors": len(previous_visitors),
                "pageViews": previous_views,
                "series": previous_series,
            },
        }
        self.send_admin_json(report)

    def visitor_journeys_report(self) -> None:
        auth, _ = self.admin_auth_or_reply()
        if auth is None:
            return
        query = parse_qs(urlparse(self.path).query)
        try:
            days = int(query.get("days", ["30"])[0])
            offset = int(query.get("offset", ["0"])[0])
            if days not in {7, 30, 90} or offset < 0:
                raise ValueError
        except (ValueError, TypeError):
            self.send_admin_json({"error": "来访足迹的时间范围或页码无效。"}, HTTPStatus.BAD_REQUEST)
            return
        visitor = query.get("visitor", [None])[0]
        if visitor is not None and not re.fullmatch(r"[0-9a-f]{64}", visitor):
            self.send_admin_json({"error": "匿名旅人编号无效。"}, HTTPStatus.BAD_REQUEST)
            return
        try:
            store = read_analytics_store()
        except OSError as error:
            print(f"Analytics storage error: {error!r}")
            self.send_admin_json({"error": "来访足迹暂时无法读取，请稍后重试。"}, HTTPStatus.SERVICE_UNAVAILABLE)
            return
        now = beijing_now()
        first_day = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days - 1)
        start, end = int(first_day.timestamp() * 1000), int(now.timestamp() * 1000)
        groups: dict[str, list[dict]] = {}
        archive = store["journeys"]
        for event in archive["events"]:
            if start <= event["at"] <= end:
                groups.setdefault(event["visitor"], []).append(event)
        metadata = {
            "rangeDays": days, "from": first_day.date().isoformat(), "to": now.date().isoformat(),
            "recordingStartedAt": archive["startedAt"], "retentionDays": JOURNEY_RETENTION_DAYS,
            "maxStoredEvents": JOURNEY_MAX_EVENTS, "timezone": "Asia/Shanghai",
            "updatedAt": store.get("updatedAt", 0),
        }
        if visitor is not None:
            events = groups.get(visitor)
            if not events:
                self.send_admin_json({"error": "这个时段里没有这位旅人的足迹，请刷新列表。"}, HTTPStatus.NOT_FOUND)
                return
            # Bound the timeline response while keeping the summary over all retained events.
            visible = sorted(events, key=lambda event: event["at"])[-500:]
            sessions = journey_sessions(visible)
            self.send_admin_json({**metadata, "visitor": journey_summary(visitor, events),
                "timelineTruncated": len(events) > len(visible), "displayedEvents": len(visible),
                "sessions": [{"startedAt": session[0]["at"], "lastAt": session[-1]["at"],
                    "events": [{"page": event["page"], "name": ANALYTICS_PAGE_NAMES[event["page"]], "at": event["at"]} for event in session]}
                    for session in reversed(sessions)]})
            return
        summaries = [journey_summary(key, events) for key, events in groups.items()]
        summaries.sort(key=lambda person: (-person["lastAt"], person["id"]))
        limit = 20
        offset = min(offset, max(0, (len(summaries) - 1) // limit * limit))
        self.send_admin_json({**metadata, "totalVisitors": len(summaries),
            "totalViews": sum(person["views"] for person in summaries),
            "totalSessions": sum(person["sessionCount"] for person in summaries),
            "offset": offset, "limit": limit, "hasMore": offset + limit < len(summaries),
            "visitors": summaries[offset:offset + limit]})

    def read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValueError("请求格式不正确。") from exc
        if length <= 0 or length > MAX_BODY:
            raise ValueError("提交内容大小不正确。")
        try:
            value = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError("提交内容不是有效数据。") from exc
        if not isinstance(value, dict):
            raise ValueError("提交内容格式不正确。")
        return value

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/admin/journeys":
            self.visitor_journeys_report()
            return
        if path == "/api/admin/analytics":
            self.analytics_report()
            return
        if path == "/api/admin/session":
            try:
                auth = read_admin_auth()
            except OSError:
                self.send_admin_json({"error": "站主管理尚未初始化，请联系网站维护者。"}, HTTPStatus.SERVICE_UNAVAILABLE)
                return
            expiry = admin_session_expiry(self.headers.get("Cookie", ""), auth)
            if expiry is None:
                self.send_admin_json({"authenticated": False}, HTTPStatus.UNAUTHORIZED)
                return
            skip_cookie = (
                f"{ANALYTICS_SKIP_COOKIE}=1; Path=/; Max-Age={ANALYTICS_RETENTION_DAYS * 24 * 60 * 60}; "
                "HttpOnly; Secure; SameSite=Strict"
            )
            self.send_admin_json({"authenticated": True, "expiresAt": expiry}, set_cookie=skip_cookie)
            return
        if path == "/api/guestbook":
            try:
                store = read_store()
            except OSError as error:
                print(f"Guestbook storage error: {error!r}")
                self.send_json({"error": "留言存档暂不可读，请稍后重试。"}, HTTPStatus.SERVICE_UNAVAILABLE)
                return
            self.send_json({"notes": store["notes"], "updatedAt": store["updatedAt"]})
            return
        super().do_GET()

    def do_POST(self) -> None:
        path = unquote(urlparse(self.path).path)
        if path == "/api/analytics/visit":
            self.record_analytics_visit()
            return
        if path == "/api/admin/login":
            self.admin_login()
            return
        if path == "/api/admin/logout":
            self.admin_logout()
            return
        if path.startswith("/api/admin/"):
            self.send_admin_json({"error": "没有这个站主管理接口。"}, HTTPStatus.NOT_FOUND)
            return
        try:
            body = self.read_json()
            if path == "/api/guestbook/notes":
                self.create_note(body)
                return
            match = re.fullmatch(r"/api/guestbook/notes/([^/]+)/replies", path)
            if match:
                self.create_reply(match.group(1), body)
                return
            match = re.fullmatch(r"/api/guestbook/notes/([^/]+)/react", path)
            if match:
                self.add_reaction(match.group(1))
                return
            self.send_json({"error": "没有这个留言接口。"}, HTTPStatus.NOT_FOUND)
        except ValueError as error:
            self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
        except Exception as error:  # Keep malformed requests from stopping the server.
            print(f"Guestbook error: {error!r}")
            self.send_json({"error": "留言墙暂时没有回应，请稍后重试。"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_DELETE(self) -> None:
        path = unquote(urlparse(self.path).path)
        match = re.fullmatch(r"/api/admin/notes/([A-Za-z0-9_-]+)", path)
        if not match:
            self.send_admin_json({"error": "没有这个删除接口。"}, HTTPStatus.NOT_FOUND)
            return
        if not self.admin_origin_allowed():
            self.send_admin_json({"error": "删除请求来源不受允许。"}, HTTPStatus.FORBIDDEN)
            return
        auth, _ = self.admin_auth_or_reply()
        if auth is None:
            return
        note_id = match.group(1)
        if note_id == "welcome-note":
            self.send_admin_json({"error": "站主欢迎纸条不能删除。"}, HTTPStatus.FORBIDDEN)
            return
        try:
            with LOCK:
                store = read_store()
                removed = next((note for note in store["notes"] if str(note.get("id")) == note_id), None)
                remaining = [note for note in store["notes"] if str(note.get("id")) != note_id]
                if len(remaining) == len(store["notes"]):
                    self.send_admin_json({"error": "这张纸条已经不存在。"}, HTTPStatus.NOT_FOUND)
                    return
                if not isinstance(store.get("deletedNotes", []), list):
                    raise OSError("Guestbook deletion archive is invalid")
                aliases = {
                    str(removed.get("clientId") or ""),
                    f"cached-{note_id}"[:80],
                    f"legacy-{note_id}"[:80],
                }
                aliases.discard("")
                store.setdefault("deletedNotes", []).append({
                    "id": note_id,
                    "clientIds": sorted(aliases),
                    "deletedAt": int(time.time() * 1000),
                })
                store["notes"] = remaining
                write_store(store)
        except OSError as error:
            print(f"Guestbook storage error: {error!r}")
            self.send_admin_json({"error": "留言存档暂不可写，请稍后重试。"}, HTTPStatus.SERVICE_UNAVAILABLE)
            return
        self.send_admin_json({"deleted": note_id, "remaining": len(remaining)})

    def create_note(self, body: dict) -> None:
        client_id = str(body.get("clientId") or "")[:80]
        note = {
            "id": f"note-{uuid.uuid4().hex[:12]}",
            "author": clean_text(body.get("author"), 24, "昵称"),
            "color": body.get("color") if body.get("color") in COLORS else "yellow",
            "content": clean_text(body.get("content"), 280, "留言内容"),
            "time": display_time(),
            "createdAt": int(time.time() * 1000),
            "owner": False,
            "reactionCount": 0,
            "replies": [],
        }
        if client_id:
            note["clientId"] = client_id
        with LOCK:
            store = read_store()
            tombstones = store.get("deletedNotes", [])
            if client_id and any(
                client_id == deleted.get("clientId") or client_id in deleted.get("clientIds", [])
                for deleted in tombstones if isinstance(deleted, dict)
            ):
                self.send_json({"error": "这张纸条已由站主移除，不能重新发布。"}, HTTPStatus.GONE)
                return
            existing = next((item for item in store["notes"] if client_id and item.get("clientId") == client_id), None)
            if existing is not None:
                self.send_json({"notes": store["notes"], "updatedAt": store["updatedAt"]})
                return
            welcome = next(item for item in store["notes"] if item.get("id") == "welcome-note")
            visitor_notes = [item for item in store["notes"] if item.get("id") != "welcome-note"]
            store["notes"] = [welcome, note, *visitor_notes]
            write_store(store)
        self.send_json({"notes": store["notes"], "updatedAt": store["updatedAt"]}, HTTPStatus.CREATED)

    def create_reply(self, note_id: str, body: dict) -> None:
        client_id = str(body.get("clientId") or "")[:80]
        reply = {
            "id": f"reply-{uuid.uuid4().hex[:12]}",
            "author": clean_text(body.get("author"), 24, "昵称"),
            "content": clean_text(body.get("content"), 180, "回信内容"),
            "time": display_time(),
            "owner": False,
        }
        if client_id:
            reply["clientId"] = client_id
        with LOCK:
            store = read_store()
            note = next((item for item in store["notes"] if str(item.get("id")) == note_id), None)
            if note is None:
                raise ValueError("这张纸条已经不存在，请刷新后重试。")
            replies = note.setdefault("replies", [])
            if client_id and any(item.get("clientId") == client_id for item in replies):
                self.send_json({"notes": store["notes"], "updatedAt": store["updatedAt"]})
                return
            replies.append(reply)
            note["replies"] = replies
            write_store(store)
        self.send_json({"notes": store["notes"], "updatedAt": store["updatedAt"]}, HTTPStatus.CREATED)

    def add_reaction(self, note_id: str) -> None:
        with LOCK:
            store = read_store()
            note = next((item for item in store["notes"] if str(item.get("id")) == note_id), None)
            if note is None:
                raise ValueError("这张纸条已经不存在，请刷新后重试。")
            note["reactionCount"] = min(9999, max(0, int(note.get("reactionCount", 0))) + 1)
            write_store(store)
        self.send_json({"notes": store["notes"], "updatedAt": store["updatedAt"]})


def lan_address() -> str:
    candidates = []
    try:
        candidates.extend(socket.gethostbyname_ex(socket.gethostname())[2])
    except OSError:
        pass
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as connection:
            connection.connect(("8.8.8.8", 80))
            candidates.append(connection.getsockname()[0])
    except OSError:
        pass
    for value in candidates:
        try:
            address = ipaddress.ip_address(value)
            if address.is_private and not address.is_loopback and not value.startswith("198.18."):
                return value
        except ValueError:
            continue
    return "localhost"


if __name__ == "__main__":
    mimetypes.add_type("audio/flac", ".flac")
    mimetypes.add_type("audio/flac", ".mflac")
    server = ThreadingHTTPServer((HOST, PORT), WebsiteHandler)
    print(f"Local:   http://localhost:{PORT}")
    print(f"Mobile:  http://{lan_address()}:{PORT}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
