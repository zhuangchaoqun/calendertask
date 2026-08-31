import { accountSyncSecret, readAccountSession } from '@/lib/account-auth';

export async function GET(request: Request) {
  const session = await readAccountSession(request);
  if (!session) return Response.json({ user: null });
  return Response.json({
    user: { id: session.userId, username: session.username },
    syncSecret: await accountSyncSecret(session.userId),
  });
}
