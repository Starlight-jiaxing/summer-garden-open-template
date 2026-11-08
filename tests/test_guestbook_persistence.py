import importlib.util
import hashlib
import json
import secrets
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


spec = importlib.util.spec_from_file_location("guestbook_server", Path(__file__).resolve().parents[1] / "server.py")
backend = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backend)


class QuietHandler(backend.WebsiteHandler):
    def log_message(self, *args):
        pass


class PersistenceTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        backend.DATA_DIR = Path(self.folder.name)
        backend.DATA_FILE = backend.DATA_DIR / "guestbook.json"
        self.start_server()
        self.origin = self.base.removesuffix("/api/guestbook")
        backend.ADMIN_ALLOWED_ORIGINS = frozenset({self.origin})
        backend.LOGIN_FAILURES.clear()
        salt = secrets.token_bytes(16)
        password = "owner-password-for-tests"
        (backend.DATA_DIR / "admin-auth.json").write_text(json.dumps({
            "version": 1,
            "passwordSalt": salt.hex(),
            "passwordHash": hashlib.pbkdf2_hmac("sha256", password.encode(), salt, backend.ADMIN_PASSWORD_ITERATIONS).hex(),
            "passwordIterations": backend.ADMIN_PASSWORD_ITERATIONS,
            "sessionSecret": secrets.token_bytes(32).hex(),
        }), encoding="utf-8")
        self.admin_password = password

    def start_server(self):
        self.httpd = backend.ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.root = f"http://127.0.0.1:{self.httpd.server_port}"
        self.base = self.root + "/api/guestbook"

    def stop_server(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join()

    def tearDown(self):
        self.stop_server()
        self.folder.cleanup()

    def request(self, path="", payload=None):
        raw = json.dumps(payload).encode() if payload is not None else None
        request = urllib.request.Request(self.base + path, data=raw, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=3) as response:
            return json.load(response)

    def api_request(self, path, method, payload=None, headers=None):
        raw = json.dumps(payload).encode() if payload is not None else None
        url = self.root + path if path.startswith("/api/admin/") else self.base + path
        request = urllib.request.Request(
            url,
            data=raw,
            method=method,
            headers={"Content-Type": "application/json", **(headers or {})},
        )
        with urllib.request.urlopen(request, timeout=3) as response:
            return json.load(response), response.headers

    def login_as_owner(self):
        _, headers = self.api_request(
            "/api/admin/login",
            "POST",
            {"password": self.admin_password},
            {"Origin": self.origin},
        )
        return headers.get("Set-Cookie").split(";", 1)[0]

    def post_note(self, client_id, content="A retained letter"):
        return self.request("/notes", {"clientId": client_id, "author": "Test visitor", "content": content, "color": "yellow"})

    def test_independent_reads_and_restart_preserve_letters_and_replies(self):
        result = self.post_note("visitor-a")
        note = next(n for n in result["notes"] if n.get("clientId") == "visitor-a")
        self.request(f"/notes/{note['id']}/replies", {"clientId": "visitor-b-reply", "author": "Visitor B", "content": "I can see this letter"})
        self.stop_server()
        self.start_server()
        stored = next(n for n in self.request()["notes"] if n.get("clientId") == "visitor-a")
        self.assertEqual(stored["replies"][0]["clientId"], "visitor-b-reply")

    def test_retry_does_not_duplicate_notes_or_replies(self):
        for _ in range(2):
            result = self.post_note("retry-note")
        notes = [n for n in result["notes"] if n.get("clientId") == "retry-note"]
        self.assertEqual(len(notes), 1)
        for _ in range(2):
            result = self.request(f"/notes/{notes[0]['id']}/replies", {"clientId": "retry-reply", "author": "B", "content": "One reply"})
        stored = next(n for n in result["notes"] if n.get("clientId") == "retry-note")
        self.assertEqual(len(stored["replies"]), 1)

    def test_concurrent_visitors_do_not_overwrite_each_other(self):
        with ThreadPoolExecutor(max_workers=6) as workers:
            list(workers.map(self.post_note, (f"concurrent-{i}" for i in range(20))))
        ids = {note.get("clientId") for note in self.request()["notes"]}
        self.assertTrue(all(f"concurrent-{i}" in ids for i in range(20)))

    def test_new_letters_preserve_welcome_replies_and_reactions(self):
        self.request("/notes/welcome-note/replies", {"clientId": "welcome-reply", "author": "B", "content": "Keep this reply"})
        self.request("/notes/welcome-note/react", {})
        self.post_note("new-letter")
        welcome = next(n for n in self.request()["notes"] if n["id"] == "welcome-note")
        self.assertEqual(len(welcome["replies"]), 1)
        self.assertEqual(welcome["reactionCount"], 1)

    def test_no_silent_eviction_after_previous_limits(self):
        store = backend.initial_store()
        store["notes"].extend({"id": f"old-{i}", "author": "Old visitor", "content": "Keep me", "replies": []} for i in range(205))
        store["notes"][0]["replies"] = [{"id": f"reply-{i}", "content": "Keep me"} for i in range(105)]
        backend.write_store(store)
        self.post_note("above-limit")
        result = self.request("/notes/welcome-note/replies", {"clientId": "above-reply-limit", "author": "B", "content": "Keep this too"})
        self.assertEqual(len(result["notes"]), 207)
        welcome = next(n for n in result["notes"] if n["id"] == "welcome-note")
        self.assertEqual(len(welcome["replies"]), 106)

    def test_corrupt_file_is_preserved_instead_of_reset(self):
        raw = b'{"notes": [broken archive'
        backend.DATA_FILE.write_bytes(raw)
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.request()
        self.assertEqual(caught.exception.code, 503)
        self.assertEqual(backend.DATA_FILE.read_bytes(), raw)

    def test_visitors_cannot_delete_posts_and_owner_can_delete_them(self):
        result = self.post_note("owner-delete-note")
        note = next(n for n in result["notes"] if n.get("clientId") == "owner-delete-note")
        self.api_request(f"/notes/{note['id']}/replies", "POST", {"clientId": "owner-delete-reply", "author": "Visitor B", "content": "Keep this with the note"})
        with self.assertRaises(urllib.error.HTTPError) as denied:
            self.api_request(f"/api/admin/notes/{note['id']}", "DELETE", headers={"Origin": self.origin})
        self.assertEqual(denied.exception.code, 401)
        self.assertTrue(any(n["id"] == note["id"] for n in self.request()["notes"]))

        cookie = self.login_as_owner()
        with self.assertRaises(urllib.error.HTTPError) as welcome_denied:
            self.api_request("/api/admin/notes/welcome-note", "DELETE", headers={"Origin": self.origin, "Cookie": cookie})
        self.assertEqual(welcome_denied.exception.code, 403)

        deleted, _ = self.api_request(
            f"/api/admin/notes/{note['id']}",
            "DELETE",
            headers={"Origin": self.origin, "Cookie": cookie},
        )
        self.assertEqual(deleted["deleted"], note["id"])
        self.assertFalse(any(n["id"] == note["id"] for n in self.request()["notes"]))
        with self.assertRaises(urllib.error.HTTPError) as replay_denied:
            self.request("/notes", {"clientId": "owner-delete-note", "author": "Test visitor", "content": "A deleted note must stay deleted", "color": "yellow"})
        self.assertEqual(replay_denied.exception.code, 410)
        with self.assertRaises(urllib.error.HTTPError) as cached_replay_denied:
            self.request("/notes", {"clientId": f"cached-{note['id']}", "author": "Test visitor", "content": "A stale browser cache", "color": "yellow"})
        self.assertEqual(cached_replay_denied.exception.code, 410)
        self.assertNotIn("deletedNotes", self.request())

    def test_owner_delete_rejects_cross_site_request(self):
        result = self.post_note("csrf-protected-note")
        note = next(n for n in result["notes"] if n.get("clientId") == "csrf-protected-note")
        cookie = self.login_as_owner()
        with self.assertRaises(urllib.error.HTTPError) as denied:
            self.api_request(
                f"/api/admin/notes/{note['id']}",
                "DELETE",
                headers={"Origin": "https://example.invalid", "Cookie": cookie},
            )
        self.assertEqual(denied.exception.code, 403)
        self.assertTrue(any(n["id"] == note["id"] for n in self.request()["notes"]))

    def test_logout_invalidates_the_existing_session_token(self):
        cookie = self.login_as_owner()
        self.api_request("/api/admin/logout", "POST", headers={"Origin": self.origin, "Cookie": cookie})
        with self.assertRaises(urllib.error.HTTPError) as stale_session:
            self.api_request("/api/admin/session", "GET", headers={"Cookie": cookie})
        self.assertEqual(stale_session.exception.code, 401)


if __name__ == "__main__":
    unittest.main(verbosity=2)
