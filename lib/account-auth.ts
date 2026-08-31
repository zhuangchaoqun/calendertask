import { env } from 'cloudflare:workers';
import {
  createAppSessionsIndex,
  createAppSessionsTable,
  createAppUsersTable,
} from '@/db/schema';

export const ACCOUNT_SESSION_COOKIE = 'chaoqun_session';
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_ITERATIONS = 100_000;

type RuntimeEnv = { DB: D1Database; AUTH_SESSION_SECRET?: string };
export type AccountSession = { userId: string; username: string; tokenHash: string };

export function database() {
  return (env as unknown as RuntimeEnv).DB;
}

export function authSecret() {
  const secret = (env as unknown as RuntimeEnv).AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('AUTH_SESSION_SECRET is not configured');
  return secret;
}

export async function ensureAccountSchema(db: D1Database) {
  await db.batch([
    db.prepare(createAppUsersTable),
    db.prepare(createAppSessionsTable),
    db.prepare(createAppSessionsIndex),
  ]);
}

const randomBytes = (length: number) => crypto.getRandomValues(new Uint8Array(length));
const hex = (bytes: Uint8Array) => Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
const fromHex = (value: string) => Uint8Array.from(value.match(/.{1,2}/g) ?? [], (byte) => Number.parseInt(byte, 16));

export async function sha256(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}

export async function passwordHash(password: string, saltHex?: string) {
  const salt = saltHex ? fromHex(saltHex) : randomBytes(16);
  const source = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS }, source, 256);
  return { salt: hex(salt), hash: hex(new Uint8Array(bits)) };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string) {
  const result = await passwordHash(password, salt);
  if (result.hash.length !== expectedHash.length) return false;
  let difference = 0;
  for (let index = 0; index < result.hash.length; index += 1) difference |= result.hash.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  return difference === 0;
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get('cookie') ?? '';
  for (const part of cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

export function sessionCookie(token: string, maxAge = Math.floor(SESSION_LIFETIME_MS / 1000), secure = true) {
  return `${ACCOUNT_SESSION_COOKIE}=${token}; Path=/; HttpOnly${secure ? '; Secure' : ''}; SameSite=Lax; Max-Age=${maxAge}`;
}

export async function createAccountSession(db: D1Database, userId: string) {
  const token = hex(randomBytes(32));
  const tokenHash = await sha256(token);
  const now = Date.now();
  await db.prepare('DELETE FROM app_sessions WHERE expires_at <= ?').bind(now).run();
  await db.prepare('INSERT INTO app_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, userId, now, now + SESSION_LIFETIME_MS).run();
  return token;
}

export async function readAccountSession(request: Request): Promise<AccountSession | null> {
  const token = cookieValue(request, ACCOUNT_SESSION_COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = await sha256(token);
  const db = database();
  await ensureAccountSchema(db);
  const row = await db.prepare(`
    SELECT s.token_hash, u.id AS user_id, u.username
    FROM app_sessions s
    JOIN app_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(tokenHash, Date.now()).first<{ token_hash: string; user_id: string; username: string }>();
  return row ? { tokenHash: row.token_hash, userId: row.user_id, username: row.username } : null;
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
}

export async function accountSyncSecret(userId: string) {
  return hmac(`sync:${userId}`, authSecret());
}

export function normalizeUsername(value: string) {
  return value.trim().normalize('NFKC').toLocaleLowerCase('zh-CN');
}

export function validUsername(value: string) {
  return /^[\p{L}\p{N}_-]{3,32}$/u.test(value);
}

export function validPassword(value: string) {
  return value.length >= 8 && value.length <= 128;
}
