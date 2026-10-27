/**
 * Firebase Cloud Messaging (FCM) delivery for the Capacitor Android app.
 *
 * Implemented with plain `fetch` + `crypto` (Node built-ins) against the FCM
 * HTTP v1 API — deliberately NOT via the firebase-adminsdk package. When the
 * site ships as Next `output: "standalone"`, the heavy admin SDK (cloud/gRPC
 * transitive deps with dynamic requires) could not be loaded from the bundled
 * container, which made any push route throw a 500. The REST path has zero
 * external dependencies, so it always loads.
 *
 * Flow: sign a RS256 JWT with the service-account private key, exchange it
 * for a short-lived Google access token, then POST the message to
 *   https://fcm.googleapis.com/v1/projects/<project_id>/messages:send
 */

import crypto from 'node:crypto';
import type { PushPayload } from './types';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/** Read + parse the service account from FIREBASE_SERVICE_ACCOUNT (base64 or raw JSON). */
function getServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    try {
      return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    } catch {
      return JSON.parse(raw);
    }
  } catch {
    console.error('[Push] FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
    return null;
  }
}

const b64url = (buf: Buffer) => buf.toString('base64url');

/** Get (and cache) a Google OAuth access token scoped to FCM messaging. */
async function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 5 * 60_000) {
    return cachedAccessToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const signingInput =
    b64url(Buffer.from(JSON.stringify(header))) + '.' + b64url(Buffer.from(JSON.stringify(claims)));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const jwt = signingInput + '.' + signer.sign(sa.private_key, 'base64url');

  const tokenUri = sa.token_uri ?? 'https://oauth2.googleapis.com/token';
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error(`FCM access token exchange failed (${res.status})`);
  }
  cachedAccessToken = { token: data.access_token, expiresAt: now * 1000 + 3600 * 1000 };
  return data.access_token;
}

export function isFcmReady(): boolean {
  return getServiceAccount() !== null;
}

/**
 * Send a push notification to a single FCM device token.
 * Returns { success:false, error:'expired' } for UNREGISTERED/NotRegistered so
 * the caller can prune the token, mirroring web-push's 410 handling.
 */
export async function sendFcmToToken(
  token: string,
  payload: PushPayload
): Promise<{ success: boolean; error?: string }> {
  const sa = getServiceAccount();
  if (!sa) {
    return { success: false, error: 'FCM not configured' };
  }

  try {
    const access = await getAccessToken(sa);
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: payload.title, body: payload.body },
            data: {
              type: payload.data?.type ?? '',
              url: payload.data?.url ?? '',
              conversationId: payload.data?.conversationId ?? '',
              messageId: payload.data?.messageId ?? '',
            },
            android: { priority: 'high' },
          },
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      // UNREGISTERED (410-ish) = token no longer valid → prune it.
      if (res.status === 404 || /UNREGISTERED|not-a-registered-token/i.test(text)) {
        return { success: false, error: 'expired' };
      }
      // 401/403 → the cached access token is stale; force a refresh next time.
      if (res.status === 401 || res.status === 403) {
        cachedAccessToken = null;
      }
      return { success: false, error: `FCM ${res.status}: ${text.slice(0, 300)}` };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}