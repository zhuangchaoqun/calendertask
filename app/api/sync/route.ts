import { env } from 'cloudflare:workers';
import { createSyncProfilesTable } from '@/db/schema';

const MAX_PAYLOAD_BYTES = 512_000;
const KEY_PATTERN = /^[a-f0-9]{64}$/;

function database() {
  return (env as unknown as { DB: D1Database }).DB;
}

async function ensureSchema(db: D1Database) {
  await db.prepare(createSyncProfilesTable).run();
}

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get('key') ?? '';
  if (!KEY_PATTERN.test(key)) return Response.json({ error: '无效的同步密钥' }, { status: 400 });

  const db = database();
  await ensureSchema(db);
  const row = await db.prepare(
    'SELECT encrypted_payload, updated_at, revision FROM sync_profiles WHERE sync_key_hash = ?',
  ).bind(key).first<{ encrypted_payload: string; updated_at: number; revision: number }>();

  if (!row) return Response.json({ found: false });
  return Response.json({
    found: true,
    payload: row.encrypted_payload,
    updatedAt: row.updated_at,
    revision: row.revision,
  });
}

export async function PUT(request: Request) {
  const body = await request.json() as { key?: string; payload?: string };
  const key = body.key ?? '';
  const payload = body.payload ?? '';
  if (!KEY_PATTERN.test(key)) return Response.json({ error: '无效的同步密钥' }, { status: 400 });
  if (!payload || new TextEncoder().encode(payload).length > MAX_PAYLOAD_BYTES) {
    return Response.json({ error: '同步内容为空或过大' }, { status: 400 });
  }

  const db = database();
  await ensureSchema(db);
  const updatedAt = Date.now();
  await db.prepare(`
    INSERT INTO sync_profiles (sync_key_hash, encrypted_payload, updated_at, revision)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(sync_key_hash) DO UPDATE SET
      encrypted_payload = excluded.encrypted_payload,
      updated_at = excluded.updated_at,
      revision = sync_profiles.revision + 1
  `).bind(key, payload, updatedAt).run();

  const saved = await db.prepare(
    'SELECT revision FROM sync_profiles WHERE sync_key_hash = ?',
  ).bind(key).first<{ revision: number }>();
  return Response.json({ ok: true, updatedAt, revision: saved?.revision ?? 1 });
}
