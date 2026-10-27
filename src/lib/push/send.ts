/**
 * Server-side Web Push sending utility
 * Uses web-push library with VAPID authentication
 */

import webpush from 'web-push';
import { createClient } from '@/lib/supabase/server';
import { sendFcmToToken, isFcmReady } from './fcm';
import type { PushSubscriptionRow, PushPayload, PushSendResult, WebPushSubscription } from './types';

// Initialize web-push with VAPID keys (lazy initialization)
let vapidInitialized = false;

function initVapid() {
  if (vapidInitialized) return;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@wacrm.local';

  if (!publicKey || !privateKey) {
    console.warn('[Push] VAPID keys not configured. Push notifications will not work.');
    return;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidInitialized = true;
  } catch (err) {
    // A malformed VAPID key (or missing/`\n`-corrupted PEM) must NOT hard-fail
    // push delivery. Native Android push uses FCM, which ignores VAPID entirely.
    // Log and continue: web push degrades to "VAPID not configured" below, while
    // the FCM branch still sends. (Previously this threw synchronously and made
    // EVERY /api/push/test return 500 — FCM included.)
    console.error(
      '[Push] Invalid VAPID configuration — web push disabled, FCM unaffected:',
      err instanceof Error ? err.message : err
    );
  }
}

/** Convert web-push row to web-push subscription format (p256dh/auth non-null for web rows) */
function rowToSubscription(row: PushSubscriptionRow): WebPushSubscription {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh!,
      auth: row.auth!,
    },
  };
}

/** Send push to a single subscription */
async function sendToSubscription(
  subscription: WebPushSubscription,
  payload: PushPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    // 410 Gone / 404 Not Found = subscription expired, should be deleted
    if (error.includes('410') || error.includes('404')) {
      return { success: false, error: 'expired' };
    }
    return { success: false, error };
  }
}

/**
 * Send push notification to all active subscriptions for a user
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<PushSendResult> {
  initVapid();
  isFcmReady();

  const supabase = await createClient();

  // Fetch all subscriptions for user
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error('[Push] Failed to fetch subscriptions:', error);
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: [{ endpoint: '', error: error.message }],
    };
  }

  if (!subscriptions || subscriptions.length === 0) {
    return { success: true, sent: 0, failed: 0, errors: [] };
  }

  const results: PushSendResult = { success: true, sent: 0, failed: 0, errors: [] };
  const expiredEndpoints: string[] = [];

  // Send to each subscription, routing by delivery provider.
  await Promise.all(
    subscriptions.map(async (sub) => {
      let result: { success: boolean; error?: string };

      if (sub.provider === 'fcm') {
        // Native Android: the FCM token lives in `endpoint`.
        if (!isFcmReady()) {
          result = { success: false, error: 'FCM not configured' };
        } else {
          result = await sendFcmToToken(sub.endpoint, payload);
        }
      } else if (!vapidInitialized) {
        result = { success: false, error: 'VAPID not configured' };
      } else {
        result = await sendToSubscription(rowToSubscription(sub), payload);
      }

      if (result.success) {
        results.sent++;
      } else {
        results.failed++;
        results.errors.push({ endpoint: sub.endpoint, error: result.error || 'Unknown' });
        if (result.error === 'expired') {
          expiredEndpoints.push(sub.endpoint);
        }
      }
    })
  );

  // Clean up expired subscriptions
  if (expiredEndpoints.length > 0) {
    const { error: deleteError } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .in('endpoint', expiredEndpoints);

    if (deleteError) {
      console.error('[Push] Failed to delete expired subscriptions:', deleteError);
    } else {
      console.log(`[Push] Cleaned up ${expiredEndpoints.length} expired subscriptions`);
    }
  }

  results.success = results.failed === 0;
  return results;
}

/**
 * Send push to multiple users (e.g., for conversation participants)
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<PushSendResult> {
  const results: PushSendResult = { success: true, sent: 0, failed: 0, errors: [] };

  await Promise.all(
    userIds.map(async (userId) => {
      const result = await sendPushToUser(userId, payload);
      results.sent += result.sent;
      results.failed += result.failed;
      results.errors.push(...result.errors);
    })
  );

  results.success = results.failed === 0;
  return results;
}

/**
 * Build push payload for new inbound message
 */
export function buildMessagePushPayload(params: {
  contactName: string;
  messagePreview: string;
  conversationId: string;
  messageId: string;
}): PushPayload {
  const { contactName, messagePreview, conversationId, messageId } = params;

  return {
    title: contactName,
    body: messagePreview,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: `message-${conversationId}`,
    requireInteraction: true,
    data: {
      conversationId,
      messageId,
      type: 'message',
      url: `/inbox?c=${encodeURIComponent(conversationId)}`,
    },
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'dismiss', title: 'Descartar' },
    ],
  };
}

/**
 * Build push payload for test notification
 */
export function buildTestPushPayload(): PushPayload {
  return {
    title: 'wacrm',
    body: '¡Notificaciones push funcionando! 🎉',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: 'wacrm-test',
    requireInteraction: false,
    data: {
      type: 'test',
      url: '/inbox',
    },
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'dismiss', title: 'Descartar' },
    ],
  };
}