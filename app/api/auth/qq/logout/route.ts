import { QQ_SESSION_COOKIE } from '@/lib/qq-auth';

export async function POST() {
  return Response.json({ ok: true }, {
    headers: { 'set-cookie': `${QQ_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` },
  });
}
