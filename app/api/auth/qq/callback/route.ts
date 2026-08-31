import { env } from 'cloudflare:workers';
import { createQQUsersTable } from '@/db/schema';
import { createQQSession, getCookie, qqConfig, QQ_SESSION_COOKIE, QQ_STATE_COOKIE } from '@/lib/qq-auth';

type TokenResult = { access_token?: string; expires_in?: number; error?: number; error_description?: string };
type OpenIdResult = { client_id?: string; openid?: string; error?: number; error_description?: string };

function parseToken(text: string): TokenResult {
  try { return JSON.parse(text) as TokenResult; } catch {
    const params = new URLSearchParams(text);
    return { access_token: params.get('access_token') ?? undefined, expires_in: Number(params.get('expires_in')) || undefined };
  }
}

function home(request: Request, result: 'success' | 'error') {
  return new URL(`/?qq=${result}`, request.url).toString();
}

export async function GET(request: Request) {
  const config = qqConfig();
  const current = new URL(request.url);
  const code = current.searchParams.get('code');
  const state = current.searchParams.get('state');
  if (!config || !code || !state || state !== getCookie(request, QQ_STATE_COOKIE)) {
    return Response.redirect(home(request, 'error'), 302);
  }

  try {
    const tokenUrl = new URL('https://graph.qq.com/oauth2.0/token');
    tokenUrl.searchParams.set('grant_type', 'authorization_code');
    tokenUrl.searchParams.set('client_id', config.appId);
    tokenUrl.searchParams.set('client_secret', config.appKey);
    tokenUrl.searchParams.set('code', code);
    tokenUrl.searchParams.set('redirect_uri', config.redirectUri);
    tokenUrl.searchParams.set('fmt', 'json');
    const token = parseToken(await (await fetch(tokenUrl)).text());
    if (!token.access_token) throw new Error(token.error_description ?? 'QQ token exchange failed');

    const openIdUrl = new URL('https://graph.qq.com/oauth2.0/me');
    openIdUrl.searchParams.set('access_token', token.access_token);
    openIdUrl.searchParams.set('fmt', 'json');
    const identity = await (await fetch(openIdUrl)).json() as OpenIdResult;
    if (!identity.openid) throw new Error(identity.error_description ?? 'QQ openid request failed');

    const userUrl = new URL('https://graph.qq.com/user/get_user_info');
    userUrl.searchParams.set('access_token', token.access_token);
    userUrl.searchParams.set('oauth_consumer_key', config.appId);
    userUrl.searchParams.set('openid', identity.openid);
    userUrl.searchParams.set('fmt', 'json');
    const profile = await (await fetch(userUrl)).json() as { ret?: number; nickname?: string; figureurl_qq_2?: string; figureurl_qq_1?: string };
    if (profile.ret !== 0) throw new Error('QQ profile request failed');

    const nickname = profile.nickname?.slice(0, 80) || 'QQ 用户';
    const avatar = profile.figureurl_qq_2 || profile.figureurl_qq_1 || '';
    const db = (env as unknown as { DB: D1Database }).DB;
    await db.prepare(createQQUsersTable).run();
    await db.prepare(`
      INSERT INTO qq_users (openid, nickname, avatar_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(openid) DO UPDATE SET nickname = excluded.nickname, avatar_url = excluded.avatar_url, updated_at = excluded.updated_at
    `).bind(identity.openid, nickname, avatar, Date.now(), Date.now()).run();

    const session = await createQQSession({ openid: identity.openid, nickname, avatar, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 }, config.sessionSecret);
    return new Response(null, {
      status: 302,
      headers: {
        location: home(request, 'success'),
        'set-cookie': `${QQ_SESSION_COOKIE}=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
      },
    });
  } catch {
    return Response.redirect(home(request, 'error'), 302);
  }
}
