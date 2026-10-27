/**
 * Server-side Firebase Cloud Messaging (FCM) sending utility for the Capacitor
 * Android app. Initializes firebase-admin from the FIREBASE_SERVICE_ACCOUNT
 * env var (base64-encoded service-account JSON) and sends to a device token.
 */

import { initializeApp, cert, getApps, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import type { PushPayload } from './types';

let fcmInitialized = false;

/** Lazily init firebase-admin once from FIREBASE_SERVICE_ACCOUNT. */
function initFcm() {
  if (fcmInitialized) return;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.warn('[Push] FIREBASE_SERVICE_ACCOUNT not configured. FCM push disabled.');
    return;
  }

  let credentials: ServiceAccount;
  try {
    // Prefer base64-encoded JSON; fall back to raw JSON in the env var.
    credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    try {
      credentials = JSON.parse(raw);
    } catch {
      console.error('[Push] FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
      return;
    }
  }

  if (getApps().length === 0) {
    initializeApp({ credential: cert(credentials as ServiceAccount) });
  }
  fcmInitialized = true;
}

export function isFcmReady(): boolean {
  initFcm();
  return fcmInitialized;
}

/**
 * Send a push notification to a single FCM device token.
 * Returns { success:false, error:'expired' } for UNREGISTERED/NotRegistered
 * so the caller can prune the token, mirroring web-push's 410 handling.
 */
export async function sendFcmToToken(
  token: string,
  payload: PushPayload
): Promise<{ success: boolean; error?: string }> {
  initFcm();
  if (!fcmInitialized) {
    return { success: false, error: 'FCM not configured' };
  }

  try {
    await getMessaging().send({
      token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: {
        type: payload.data?.type ?? '',
        url: payload.data?.url ?? '',
        conversationId: payload.data?.conversationId ?? '',
        messageId: payload.data?.messageId ?? '',
      },
      android: {
        priority: 'high',
      },
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (/unregistered|not Registered/i.test(message)) {
      return { success: false, error: 'expired' };
    }
    return { success: false, error: message };
  }
}