import { qqConfig, QQ_STATE_COOKIE } from '@/lib/qq-auth';

export async function GET() {
  const config = qqConfig();
  if (!config) return Response.json({ error: 'QQ 登录尚未配置' }, { status: 503 });

  const state = crypto.randomUUID().replace(/-/g, '');
  const url = new URL('https://graph.qq.com/oauth2.0/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.appId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', 'get_user_info');
  url.searchParams.set('display', 'pc');

  return new Response(null, {
    status: 302,
    headers: {
      location: url.toString(),
      'set-cookie': `${QQ_STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}
