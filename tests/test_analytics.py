"""Privacy, authorization and persistence checks using isolated temporary data."""
import hashlib
import importlib.util
import json
import secrets
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("analytics_backend", Path(__file__).resolve().parents[1] / "server.py")
backend = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backend)


class QuietHandler(backend.WebsiteHandler):
    def log_message(self, *args):
        pass


class AnalyticsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        backend.ANALYTICS_ENABLED = True
        backend.DATA_DIR = Path(self.temp.name)
        backend.DATA_FILE = backend.DATA_DIR / "guestbook.json"
        backend.ANALYTICS_FILE = backend.DATA_DIR / "analytics.json"
        backend.ANALYTICS_KEY_FILE = backend.DATA_DIR / "analytics.key"
        self.auth = {"passwordSalt": secrets.token_hex(16), "passwordHash": secrets.token_hex(32),
                     "passwordIterations": 600000, "sessionSecret": secrets.token_hex(32)}
        backend.admin_auth_path().write_text(json.dumps(self.auth), encoding="utf-8")
        self.server = backend.ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.root = "http://127.0.0.1:" + str(self.server.server_port)
        backend.ADMIN_ALLOWED_ORIGINS = frozenset({self.root})
        self.cookie = backend.ADMIN_COOKIE + "=" + backend.create_admin_session(self.auth)[0]

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, path, payload=None, cookie="", headers=None):
        req = urllib.request.Request(self.root + path,
            data=json.dumps(payload).encode() if payload is not None else None,
            headers={"Content-Type": "application/json", "Origin": self.root, "Cookie": cookie, **(headers or {})})
        try:
            response = urllib.request.urlopen(req, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response), response.headers

    def visit(self, page="station", cookie="", **headers):
        return self.request("/api/analytics/visit", {"page": page}, cookie, headers)

    def report(self, days=7):
        status, report, _ = self.request("/api/admin/analytics?days=" + str(days), cookie=self.cookie)
        self.assertEqual(status, 200)
        return report

    def journeys(self, query="days=7"):
        status, report, _ = self.request("/api/admin/journeys?" + query, cookie=self.cookie)
        self.assertEqual(status, 200)
        return report

    def test_private_report_rejects_guest_and_tampered_session(self):
        self.assertEqual(self.request("/api/admin/analytics")[0], 401)
        self.assertEqual(self.request("/api/admin/analytics", cookie=self.cookie + "tampered")[0], 401)
        report = self.report()
        self.assertFalse(report["hasData"])
        self.assertNotIn("people", report)
        self.assertEqual(len(report["series"]), 7)

    def test_one_visitor_two_pages_is_one_uv_two_pv_and_hash_only(self):
        status, body, headers = self.visit()
        self.assertEqual((status, body["recorded"]), (200, True))
        cookie = headers["Set-Cookie"].split(";", 1)[0]
        visitor_id = cookie.split("=", 1)[1]
        self.assertIn("HttpOnly", headers["Set-Cookie"])
        self.assertIn("Path=/api/analytics", headers["Set-Cookie"])
        self.visit("diary", cookie)
        report = self.report()
        self.assertEqual(report["overview"]["uniqueVisitors"], 1)
        self.assertEqual(report["overview"]["pageViews"], 2)
        self.assertEqual(sum(report["hours"]), 2)
        stored = backend.ANALYTICS_FILE.read_text()
        self.assertNotIn(visitor_id, stored)
        self.assertNotIn("127.0.0.1", stored)
        self.assertEqual(len(next(iter(json.loads(stored)["people"]))), 64)
        self.assertEqual(len(report["pages"]), 2)

    def test_distinct_browser_and_cross_day_return_survive_reload(self):
        date = datetime(2026, 10, 24, 23, 59, tzinfo=backend.BEIJING_TIMEZONE)
        with patch.object(backend, "beijing_now", return_value=date):
            _, _, headers = self.visit()
        cookie = headers["Set-Cookie"].split(";", 1)[0]
        key_before = backend.ANALYTICS_KEY_FILE.read_bytes()
        with patch.object(backend, "beijing_now", return_value=date + timedelta(minutes=2)):
            self.visit("letters", cookie)
            self.visit("archive")
            report = self.report()
        self.assertEqual(report["overview"]["uniqueVisitors"], 2)
        self.assertEqual(report["overview"]["pageViews"], 3)
        self.assertEqual(sum(day["visitors"] for day in report["series"]), 3)
        self.assertEqual(report["overview"]["returningVisitors"], 1)
        self.assertEqual(report["overview"]["returnRate"], 50)
        self.assertEqual(backend.ANALYTICS_KEY_FILE.read_bytes(), key_before)

    def test_owner_dnt_gpc_foreign_origin_and_unknown_page_do_not_record(self):
        self.assertFalse(self.visit(cookie=backend.ANALYTICS_SKIP_COOKIE + "=1")[1]["recorded"])
        self.assertFalse(self.visit(DNT="1")[1]["recorded"])
        self.assertFalse(self.visit(**{"Sec-GPC": "1"})[1]["recorded"])
        self.assertEqual(self.visit(Origin="https://unrelated.example")[0], 403)
        self.assertEqual(self.visit("unknown-page")[0], 400)
        self.assertFalse(backend.ANALYTICS_FILE.exists())

    def test_previous_period_deduplicates_and_retention_prunes(self):
        now = datetime(2026, 10, 25, 12, tzinfo=backend.BEIJING_TIMEZONE)
        a, b = hashlib.sha256(b"a").hexdigest(), hashlib.sha256(b"b").hexdigest()
        store = backend.initial_analytics_store()
        for days_ago, visitor in [(1, a), (2, a), (8, b), (9, b), (401, b)]:
            day = (now.date() - timedelta(days=days_ago)).isoformat()
            record = backend.analytics_day_template()
            record["visitors"] = [visitor]
            record["pageViews"] = {"station": 2}
            record["pageVisitors"] = {"station": [visitor]}
            record["hours"][12] = 2
            store["days"][day] = record
            store["people"][visitor] = {"firstDay": day, "lastDay": day}
        backend.write_analytics_store(store)
        with patch.object(backend, "beijing_now", return_value=now):
            report = self.report()
            self.visit()
        self.assertEqual(report["overview"]["uniqueVisitors"], 1)
        self.assertEqual(report["comparison"]["uniqueVisitors"], 1)
        self.assertEqual(report["comparison"]["pageViews"], 4)
        self.assertEqual(len(report["comparison"]["series"]), 7)
        self.assertNotIn((now.date() - timedelta(days=401)).isoformat(), backend.read_analytics_store()["days"])

    def test_damaged_archive_is_preserved_and_not_overwritten(self):
        payload = '{"days":{"2026-10-25":{"hours":"broken"}},"people":{}}'
        backend.ANALYTICS_FILE.write_text(payload)
        self.assertEqual(self.visit()[0], 503)
        self.assertEqual(self.request("/api/admin/analytics", cookie=self.cookie)[0], 503)
        self.assertEqual(backend.ANALYTICS_FILE.read_text(), payload)

    def test_journeys_are_private_and_browser_timelines_stay_separate(self):
        now = datetime(2026, 10, 25, 12, tzinfo=backend.BEIJING_TIMEZONE)
        with patch.object(backend, "beijing_now", return_value=now):
            _, _, headers = self.visit("station")
            cookie = headers["Set-Cookie"].split(";", 1)[0]
            self.visit("letters")
        with patch.object(backend, "beijing_now", return_value=now + timedelta(minutes=1)):
            self.visit("diary", cookie)
        with patch.object(backend, "beijing_now", return_value=now + timedelta(minutes=31)):
            self.visit("archive", cookie)
            report = self.journeys()
            self.assertEqual((report["totalVisitors"], report["totalViews"], report["totalSessions"]), (2, 4, 3))
            person = next(person for person in report["visitors"] if person["views"] == 3)
            detail = self.journeys("days=7&visitor=" + person["id"])
        self.assertEqual([event["page"] for event in detail["sessions"][0]["events"]], ["archive"])
        self.assertEqual([event["page"] for event in detail["sessions"][1]["events"]], ["station", "diary"])
        self.assertNotIn(cookie.split("=", 1)[1], json.dumps(detail))
        self.assertNotIn("visitor", detail["sessions"][0]["events"][0])
        self.assertEqual(self.request("/api/admin/journeys")[0], 401)
        self.assertEqual(self.request("/api/admin/journeys", cookie=self.cookie + "bad")[0], 401)
        self.assertEqual(self.request("/api/admin/journeys?visitor=invalid", cookie=self.cookie)[0], 400)
        self.assertEqual(self.request("/api/admin/journeys?days=3", cookie=self.cookie)[0], 400)
        self.assertEqual(self.request("/api/admin/journeys?visitor=" + "0" * 64, cookie=self.cookie)[0], 404)

    def test_existing_aggregate_archive_does_not_fabricate_old_routes(self):
        self.visit()
        store = backend.read_analytics_store()
        del store["journeys"]
        backend.write_analytics_store(store)
        report = self.journeys()
        self.assertEqual((report["recordingStartedAt"], report["totalViews"]), (0, 0))
        self.assertEqual(self.report()["overview"]["pageViews"], 1)
        self.visit("diary")
        report = self.journeys()
        self.assertGreater(report["recordingStartedAt"], 0)
        self.assertEqual(report["totalViews"], 1)
        self.assertEqual(self.report()["overview"]["pageViews"], 2)

    def test_journey_retention_and_event_limit_keep_aggregate_counts(self):
        now = backend.beijing_now()
        visitor = hashlib.sha256(b"journey-retention").hexdigest()
        store = backend.initial_analytics_store()
        old = int((now - timedelta(days=90)).timestamp() * 1000)
        recent = int((now - timedelta(minutes=5)).timestamp() * 1000)
        store["journeys"] = {"startedAt": old, "events": [{"visitor": visitor, "page": "station", "at": old},
            *[{"visitor": visitor, "page": "diary", "at": recent + offset * 1000} for offset in range(4)]]}
        backend.write_analytics_store(store)
        with patch.object(backend, "beijing_now", return_value=now), patch.object(backend, "JOURNEY_MAX_EVENTS", 3):
            self.visit()
        events = backend.read_analytics_store()["journeys"]["events"]
        self.assertEqual(len(events), 3)
        self.assertTrue(all(event["at"] > old for event in events))
        self.assertEqual(events[-1]["page"], "station")
        self.assertEqual(self.report()["overview"]["pageViews"], 1)

    def test_journey_pagination_and_timeline_response_are_bounded(self):
        now = backend.beijing_now()
        timestamp = int(now.timestamp() * 1000) - 700_000
        store = backend.initial_analytics_store()
        people = [hashlib.sha256(str(index).encode()).hexdigest() for index in range(25)]
        store["journeys"] = {"startedAt": timestamp, "events": [{"visitor": visitor, "page": "station", "at": timestamp + index} for index, visitor in enumerate(people)]}
        store["journeys"]["events"].extend({"visitor": people[0], "page": "diary", "at": timestamp + 1000 + index * 1000} for index in range(600))
        backend.write_analytics_store(store)
        first, second = self.journeys(), self.journeys("days=7&offset=20")
        self.assertEqual((len(first["visitors"]), len(second["visitors"]), first["hasMore"], second["hasMore"]), (20, 5, True, False))
        self.assertFalse({row["id"] for row in first["visitors"]} & {row["id"] for row in second["visitors"]})
        detail = self.journeys("days=7&visitor=" + people[0])
        self.assertEqual(detail["visitor"]["views"], 601)
        self.assertEqual(detail["displayedEvents"], 500)
        self.assertTrue(detail["timelineTruncated"])
        self.assertEqual(sum(len(session["events"]) for session in detail["sessions"]), 500)

    def test_invalid_journey_archive_is_preserved(self):
        store = backend.initial_analytics_store()
        store["journeys"]["events"] = [{"visitor": "a" * 64, "page": [], "at": 1}]
        payload = json.dumps(store)
        backend.ANALYTICS_FILE.write_text(payload)
        self.assertEqual(self.visit()[0], 503)
        self.assertEqual(self.request("/api/admin/journeys", cookie=self.cookie)[0], 503)
        self.assertEqual(backend.ANALYTICS_FILE.read_text(), payload)


if __name__ == "__main__":
    unittest.main(verbosity=2)
