#!/usr/bin/env python3

import http.client
import json
import os
import subprocess
import tempfile
import time
import unittest


class SyncServerIntegrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.port = 18787
        env = {
            **os.environ,
            "CHAOQUN_DB": os.path.join(cls.temp_dir.name, "sync.db"),
            "CHAOQUN_PORT": str(cls.port),
        }
        cls.process = subprocess.Popen(
            ["python3", "sync_server.py"],
            cwd=os.path.dirname(__file__),
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        for _ in range(50):
            try:
                status, _ = cls.request("GET", "/health")
                if status == 200:
                    return
            except OSError:
                time.sleep(0.05)
        raise RuntimeError("sync server did not start")

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait(timeout=5)
        cls.temp_dir.cleanup()

    @classmethod
    def request(cls, method, path, body=None, token=None):
        connection = http.client.HTTPConnection("127.0.0.1", cls.port, timeout=3)
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        encoded = json.dumps(body).encode() if body is not None else None
        connection.request(method, path, encoded, headers)
        response = connection.getresponse()
        result = json.loads(response.read() or b"{}")
        connection.close()
        return response.status, result

    def test_registration_and_two_device_sync(self):
        status, account_a = self.request(
            "POST", "/api/auth/register", {"username": "test_user", "password": "safe-password-123"}
        )
        self.assertEqual(status, 201)

        task_a = [{"id": "task-1", "title": "电脑A", "date": "2026-09-02", "updatedAt": 1}]
        status, saved_a = self.request(
            "PUT", "/api/sync", {"payload": task_a, "baseRevision": 0}, account_a["token"]
        )
        self.assertEqual(status, 200, saved_a)
        self.assertEqual(saved_a["revision"], 1)

        status, account_b = self.request(
            "POST", "/api/auth/login", {"username": "test_user", "password": "safe-password-123"}
        )
        self.assertEqual(status, 200)
        status, downloaded = self.request("GET", "/api/sync", token=account_b["token"])
        self.assertEqual((status, downloaded["payload"]), (200, task_a))

        task_b = [{**task_a[0], "title": "电脑B", "updatedAt": 2}]
        status, saved_b = self.request(
            "PUT", "/api/sync", {"payload": task_b, "baseRevision": 1}, account_b["token"]
        )
        self.assertEqual(status, 200, saved_b)
        self.assertEqual(saved_b["revision"], 2)

        status, conflict = self.request(
            "PUT", "/api/sync", {"payload": task_a, "baseRevision": 1}, account_a["token"]
        )
        self.assertEqual(status, 409)
        self.assertEqual(conflict["payload"], task_b)


if __name__ == "__main__":
    unittest.main()
