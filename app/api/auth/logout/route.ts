import { database, readAccountSession, sessionCookie } from '@/lib/account-auth';

export async function POST(request: Request) {
  const session = await readAccountSession(request);
  if (session) await database().prepare('DELETE FROM app_sessions WHERE token_hash = ?').bind(session.tokenHash).run();
  return Response.json({ ok: true }, { headers: { 'set-cookie': sessionCookie('', 0, new URL(request.url).protocol === 'https:') } });
}
