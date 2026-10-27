/**
 * Thin wrapper over the Capacitor `@capacitor/push-notifications` plugin.
 *
 * The OAuth'd Android app (a Capacitor WebView loading the deployed site) gets
 * push via FCM, not the browser Web Push API. All of this only matters inside
 * the app: in a regular browser `isNativePush()` is false and the code falls
 * back to the web-push hook.
 */

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

/** True only when running inside the native Capacitor app (Android/iOS). */
export function isNativePush(): boolean {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform();
}

export interface ReceivedNotification {
  title?: string;
  body?: string;
  data?: Record<string, string | number | null>;
}

/** Callbacks wired to the native push plugin's lifecycle events. */
export interface NativePushHandlers {
  /** Fires with the FCM registration token (also on cold start if cached). */
  onToken?: (token: string) => void;
  onRegistrationError?: (error: string) => void;
  /** Fires when a push arrives while the app is foregrounded/open. */
  onReceived?: (notification: ReceivedNotification) => void;
  /** Fires when the user taps an OS notification. */
  onAction?: (notification: ReceivedNotification) => void;
}

/** Add the plugin listeners once. Returns a cleanup fn. */
export function addNativePushListeners(handlers: NativePushHandlers): () => void {
  const handles = [
    PushNotifications.addListener('registration', ({ value }) => {
      handlers.onToken?.(value);
    }),
    PushNotifications.addListener('registrationError', (err) => {
      handlers.onRegistrationError?.(err.error);
    }),
    PushNotifications.addListener('pushNotificationReceived', (n) => {
      handlers.onReceived?.({ title: n.title, body: n.body, data: n.data });
    }),
    PushNotifications.addListener('pushNotificationActionPerformed', (n) => {
      handlers.onAction?.({ title: n.notification?.title, body: n.notification?.body, data: n.notification?.data });
    }),
  ];

  return () => {
    // Capacitor v8 listeners return promises; resolve each before removing.
    for (const handle of handles) {
      void handle.then((h) => h.remove());
    }
  };
}

/** Request OS notification permission (Android 13+ shows the POST_NOTIFICATIONS dialog). */
export async function requestNativePermission(): Promise<boolean> {
  const result = await PushNotifications.requestPermissions();
  return result.receive === 'granted';
}

/** Register this device with FCM. The token arrives via the 'registration' listener. */
export function registerNative(): void {
  void PushNotifications.register();
}

/**
 * Channel used for FCM message notifications. MUST match the constant in
 * `src/lib/push/fcm.ts` (the server points Android notifications at this id).
 *
 * No `sound` is passed on purpose: with `importance: 5` (HIGH) Android uses the
 * system default notification sound + heads-up, which is what we want. An
 * explicit res/raw filename would be needed only for a custom ringtone.
 */
export const NATIVE_CHANNEL_ID = 'wacrm-messages';

/** Create (idempotent) the FCM channel with sound + vibration. Safe to call on every app start. */
export async function ensureNativeChannel(): Promise<void> {
  if (!isNativePush()) return;
  try {
    await PushNotifications.createChannel({
      id: NATIVE_CHANNEL_ID,
      name: 'Mensajes',
      description: 'Notificaciones de nuevos mensajes de wacrm',
      importance: 5, // IMPORTANCE_HIGH — rings, vibrates, shows heads-up
      vibration: true,
      lights: true,
    });
  } catch (err) {
    console.error('[Push] ensureNativeChannel failed:', err);
  }
}