import {
  createAccountSession,
  database,
  ensureAccountSchema,
  normalizeUsername,
  sessionCookie,
  verifyPassword,
} from '@/lib/account-auth';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { username?: string; password?: string };
  const username = normalizeUsername(typeof body.username === 'string' ? body.username : '');
  const password = typeof body.password === 'string' ? body.password : '';
  const db = database();
  await ensureAccountSchema(db);
  const user = await db.prepare(`
    SELECT id, password_hash, password_salt, failed_attempts, locked_until
    FROM app_users WHERE username_normalized = ?
  `).bind(username).first<{ id: string; password_hash: string; password_salt: string; failed_attempts: number; locked_until: number }>();

  const now = Date.now();
  if (user?.locked_until && user.locked_until > now) {
    return Response.json({ error: '登录尝试过多，请稍后再试' }, { status: 429 });
  }
  const valid = user ? await verifyPassword(password, user.password_salt, user.password_hash) : false;
  if (!user || !valid) {
    if (user) {
      const failures = user.failed_attempts + 1;
      const lockedUntil = failures >= 5 ? now + 10 * 60 * 1000 : 0;
      await db.prepare('UPDATE app_users SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?')
        .bind(failures >= 5 ? 0 : failures, lockedUntil, now, user.id).run();
    }
    return Response.json({ error: '用户名或密码不正确' }, { status: 401 });
  }

  await db.prepare('UPDATE app_users SET failed_attempts = 0, locked_until = 0, updated_at = ? WHERE id = ?').bind(now, user.id).run();
  const token = await createAccountSession(db, user.id);
  return Response.json({ ok: true }, { headers: { 'set-cookie': sessionCookie(token, undefined, new URL(request.url).protocol === 'https:') } });
}
