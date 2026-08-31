import { qqConfig, qqSyncSecret, readQQSession } from '@/lib/qq-auth';

export async function GET(request: Request) {
  const config = qqConfig();
  if (!config) return Response.json({ configured: false, user: null });
  const user = await readQQSession(request);
  if (!user) return Response.json({ configured: true, user: null });
  return Response.json({
    configured: true,
    user: { nickname: user.nickname, avatar: user.avatar },
    syncSecret: await qqSyncSecret(user.openid, config.sessionSecret),
  });
}
