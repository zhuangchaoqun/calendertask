import { env } from 'cloudflare:workers';

export const QQ_SESSION_COOKIE = 'chaoqun_qq_session';
export const QQ_STATE_COOKIE = 'chaoqun_qq_state';

type QQConfig = {
  appId: string;
  appKey: string;
  redirectUri: string;
  sessionSecret: string;
};

const base64url = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const fromBase64url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

export function qqConfig(): QQConfig | null {
  const runtime = env as unknown as Partial<Record<'QQ_APP_ID' | 'QQ_APP_KEY' | 'QQ_REDIRECT_URI' | 'QQ_SESSION_SECRET', string>>;
  if (!runtime.QQ_APP_ID || !runtime.QQ_APP_KEY || !runtime.QQ_REDIRECT_URI || !runtime.QQ_SESSION_SECRET) return null;
  return {
    appId: runtime.QQ_APP_ID,
    appKey: runtime.QQ_APP_KEY,
    redirectUri: runtime.QQ_REDIRECT_URI,
    sessionSecret: runtime.QQ_SESSION_SECRET,
  };
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get('cookie') ?? '';
  for (const part of cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

export type QQSession = { openid: string; nickname: string; avatar?: string; expiresAt: number };

export async function createQQSession(session: QQSession, secret: string) {
  const payload = base64url(new TextEncoder().encode(JSON.stringify(session)));
  return `${payload}.${await hmac(payload, secret)}`;
}

export async function readQQSession(request: Request): Promise<QQSession | null> {
  const config = qqConfig();
  const value = cookieValue(request, QQ_SESSION_COOKIE);
  if (!config || !value) return null;
  const [payload, signature] = value.split('.');
  if (!payload || !signature || await hmac(payload, config.sessionSecret) !== signature) return null;
  try {
    const session = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as QQSession;
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

export async function qqSyncSecret(openid: string, secret: string) {
  return hmac(`sync:${openid}`, secret);
}

export function getCookie(request: Request, name: string) {
  return cookieValue(request, name);
}
