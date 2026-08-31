import {
  createAccountSession,
  database,
  ensureAccountSchema,
  normalizeUsername,
  passwordHash,
  sessionCookie,
  validPassword,
  validUsername,
} from '@/lib/account-auth';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { username?: string; password?: string };
  const rawUsername = typeof body.username === 'string' ? body.username : '';
  const username = normalizeUsername(rawUsername);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!validUsername(username)) return Response.json({ error: '用户名需为 3–32 个汉字、字母、数字、下划线或短横线' }, { status: 400 });
  if (!validPassword(password)) return Response.json({ error: '密码长度需为 8–128 个字符' }, { status: 400 });

  const db = database();
  await ensureAccountSchema(db);
  const exists = await db.prepare('SELECT 1 AS found FROM app_users WHERE username_normalized = ?').bind(username).first();
  if (exists) return Response.json({ error: '该用户名已被注册' }, { status: 409 });

  const userId = crypto.randomUUID();
  const credentials = await passwordHash(password);
  const now = Date.now();
  try {
    await db.prepare(`
      INSERT INTO app_users (id, username, username_normalized, password_hash, password_salt, failed_attempts, locked_until, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
    `).bind(userId, rawUsername.trim().normalize('NFKC'), username, credentials.hash, credentials.salt, now, now).run();
  } catch {
    return Response.json({ error: '该用户名已被注册' }, { status: 409 });
  }

  const token = await createAccountSession(db, userId);
  return Response.json({ ok: true }, { status: 201, headers: { 'set-cookie': sessionCookie(token, undefined, new URL(request.url).protocol === 'https:') } });
}
