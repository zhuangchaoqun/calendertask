#!/usr/bin/env python3
"""Small self-contained account and task-sync service for chaoquncalender."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

DB_PATH = os.environ.get("CHAOQUN_DB", "/var/lib/chaoqun-sync/sync.db")
HOST = os.environ.get("CHAOQUN_HOST", "127.0.0.1")
PORT = int(os.environ.get("CHAOQUN_PORT", "8787"))
MAX_BODY = 512_000
SESSION_SECONDS = 30 * 24 * 60 * 60
PBKDF2_ITERATIONS = 210_000


def now() -> int:
    return int(time.time())


def db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA foreign_keys=ON")
    return connection


def init_db() -> None:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with db() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              username TEXT NOT NULL,
              username_normalized TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              password_salt TEXT NOT NULL,
              failed_attempts INTEGER NOT NULL DEFAULT 0,
              locked_until INTEGER NOT NULL DEFAULT 0,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
              token_hash TEXT PRIMARY KEY,
              user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              expires_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
            CREATE TABLE IF NOT EXISTS profiles (
              user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
              payload TEXT NOT NULL,
              revision INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            );
            """
        )


def normalize_username(value: str) -> str:
    return value.strip().casefold()


def password_hash(password: str, salt: bytes | None = None) -> tuple[str, str]:
    actual_salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), actual_salt, PBKDF2_ITERATIONS)
    return actual_salt.hex(), digest.hex()


def new_session(connection: sqlite3.Connection, user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (now(),))
    connection.execute(
        "INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (token_hash, user_id, now() + SESSION_SECONDS),
    )
    return token


class Handler(BaseHTTPRequestHandler):
    server_version = "chaoqun-sync/1.0"

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"{self.address_string()} [{self.log_date_time_string()}] {fmt % args}", flush=True)

    def send_json(self, status: int, value: object) -> None:
        body = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_BODY:
            raise ValueError("请求内容为空或过大")
        value = json.loads(self.rfile.read(length))
        if not isinstance(value, dict):
            raise ValueError("请求格式错误")
        return value

    def user(self, connection: sqlite3.Connection) -> sqlite3.Row | None:
        authorization = self.headers.get("Authorization", "")
        if not authorization.startswith("Bearer "):
            return None
        token = authorization[7:].strip()
        if not token:
            return None
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        return connection.execute(
            """SELECT users.id, users.username FROM sessions
               JOIN users ON users.id = sessions.user_id
               WHERE sessions.token_hash = ? AND sessions.expires_at > ?""",
            (token_hash, now()),
        ).fetchone()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health":
            self.send_json(200, {"ok": True, "service": "chaoqun-sync"})
            return
        with db() as connection:
            user = self.user(connection)
            if not user:
                self.send_json(401, {"error": "请先登录账号"})
                return
            if path == "/api/auth/session":
                self.send_json(200, {"authenticated": True, "username": user["username"]})
                return
            if path == "/api/sync":
                row = connection.execute(
                    "SELECT payload, revision, updated_at FROM profiles WHERE user_id = ?", (user["id"],)
                ).fetchone()
                if not row:
                    self.send_json(200, {"found": False, "revision": 0})
                else:
                    self.send_json(200, {
                        "found": True,
                        "payload": json.loads(row["payload"]),
                        "revision": row["revision"],
                        "updatedAt": row["updated_at"],
                    })
                return
        self.send_json(404, {"error": "未找到接口"})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            body = self.read_json()
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(400, {"error": str(error)})
            return
        if path not in ("/api/auth/register", "/api/auth/login", "/api/auth/logout"):
            self.send_json(404, {"error": "未找到接口"})
            return
        with db() as connection:
            if path == "/api/auth/logout":
                authorization = self.headers.get("Authorization", "")
                if authorization.startswith("Bearer "):
                    token_hash = hashlib.sha256(authorization[7:].strip().encode()).hexdigest()
                    connection.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
                connection.commit()
                self.send_json(200, {"ok": True})
                return

            raw_username = str(body.get("username", "")).strip()
            username = normalize_username(raw_username)
            password = str(body.get("password", ""))
            if not re.fullmatch(r"[\w-]{3,32}", username, re.UNICODE):
                self.send_json(400, {"error": "用户名需为3–32个汉字、字母、数字、下划线或短横线"})
                return
            if not 8 <= len(password) <= 128:
                self.send_json(400, {"error": "密码长度需为8–128个字符"})
                return

            if path == "/api/auth/register":
                if connection.execute("SELECT 1 FROM users WHERE username_normalized = ?", (username,)).fetchone():
                    self.send_json(409, {"error": "该用户名已被注册"})
                    return
                user_id = str(uuid.uuid4())
                salt, digest = password_hash(password)
                timestamp = now()
                connection.execute(
                    """INSERT INTO users(id, username, username_normalized, password_hash, password_salt,
                       failed_attempts, locked_until, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)""",
                    (user_id, raw_username, username, digest, salt, timestamp, timestamp),
                )
                token = new_session(connection, user_id)
                connection.commit()
                self.send_json(201, {"ok": True, "token": token, "username": raw_username})
                return

            row = connection.execute(
                "SELECT * FROM users WHERE username_normalized = ?", (username,)
            ).fetchone()
            if row and row["locked_until"] > now():
                self.send_json(429, {"error": "登录尝试过多，请10分钟后再试"})
                return
            valid = False
            if row:
                _, digest = password_hash(password, bytes.fromhex(row["password_salt"]))
                valid = hmac.compare_digest(digest, row["password_hash"])
            if not valid:
                if row:
                    failures = row["failed_attempts"] + 1
                    locked_until = now() + 600 if failures >= 5 else 0
                    connection.execute(
                        "UPDATE users SET failed_attempts=?, locked_until=?, updated_at=? WHERE id=?",
                        (0 if failures >= 5 else failures, locked_until, now(), row["id"]),
                    )
                    connection.commit()
                self.send_json(401, {"error": "用户名或密码不正确"})
                return
            connection.execute(
                "UPDATE users SET failed_attempts=0, locked_until=0, updated_at=? WHERE id=?",
                (now(), row["id"]),
            )
            token = new_session(connection, row["id"])
            connection.commit()
            self.send_json(200, {"ok": True, "token": token, "username": row["username"]})

    def do_PUT(self) -> None:
        if urlparse(self.path).path != "/api/sync":
            self.send_json(404, {"error": "未找到接口"})
            return
        try:
            body = self.read_json()
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(400, {"error": str(error)})
            return
        payload = body.get("payload")
        base_revision = body.get("baseRevision")
        if not isinstance(payload, list) or not isinstance(base_revision, int):
            self.send_json(400, {"error": "同步格式错误"})
            return
        serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        if len(serialized.encode()) > MAX_BODY:
            self.send_json(400, {"error": "同步内容过大"})
            return
        with db() as connection:
            user = self.user(connection)
            if not user:
                self.send_json(401, {"error": "请先登录账号"})
                return
            row = connection.execute(
                "SELECT payload, revision, updated_at FROM profiles WHERE user_id = ?", (user["id"],)
            ).fetchone()
            revision = row["revision"] if row else 0
            if revision != base_revision:
                self.send_json(409, {
                    "error": "数据已在另一台电脑更新",
                    "payload": json.loads(row["payload"]) if row else [],
                    "revision": revision,
                    "updatedAt": row["updated_at"] if row else 0,
                })
                return
            next_revision = revision + 1
            timestamp = int(time.time() * 1000)
            connection.execute(
                """INSERT INTO profiles(user_id, payload, revision, updated_at) VALUES (?, ?, ?, ?)
                   ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,
                   revision=excluded.revision, updated_at=excluded.updated_at""",
                (user["id"], serialized, next_revision, timestamp),
            )
            connection.commit()
            self.send_json(200, {"ok": True, "revision": next_revision, "updatedAt": timestamp})


if __name__ == "__main__":
    init_db()
    print(f"chaoqun-sync listening on {HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
