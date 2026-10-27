/**
 * Types for Web Push notifications
 */

/** Delivery channel for a stored subscription row */
export type PushProvider = 'web' | 'fcm';

/** Push subscription as stored in database */
export interface PushSubscriptionRow {
  id: number;
  user_id: string;
  endpoint: string;
  /** web-push key (NULL for FCM rows) */
  p256dh: string | null;
  /** web-push auth shared secret (NULL for FCM rows) */
  auth: string | null;
  /** 'web' = browser VAPID subscription, 'fcm' = native Android token */
  provider?: PushProvider;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
}

/** Push subscription formatted for web-push library */
export interface WebPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/** Payload for push notification */
export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: PushData;
  requireInteraction?: boolean;
  actions?: Array<{ action: string; title: string }>;
}

/** Custom data sent with push notification */
export interface PushData {
  conversationId?: string;
  messageId?: string;
  type?: 'message' | 'test' | 'broadcast';
  url?: string;
}

/** VAPID configuration */
export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string; // mailto: or https://
}

/** Result of sending push */
export interface PushSendResult {
  success: boolean;
  sent: number;
  failed: number;
  errors: Array<{ endpoint: string; error: string }>;
}