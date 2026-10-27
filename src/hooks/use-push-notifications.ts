"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  isNativePush,
  addNativePushListeners,
  requestNativePermission,
  registerNative,
  type ReceivedNotification,
} from '@/lib/push/capacitor';

/** Web Push subscription state */
export interface PushSubscriptionState {
  /** True when running inside the native Capacitor app (FCM push). */
  native: boolean;
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
  loading: boolean;
  error: string | null;
}

/** Internal permission type that includes 'unsupported' */
type ExtendedPermission = NotificationPermission | 'unsupported';

/** Options for the hook */
export interface UsePushNotificationsOptions {
  /** Auto-subscribe when permission is granted */
  autoSubscribe?: boolean;
  /** Callback when subscription changes */
  onChange?: (state: PushSubscriptionState) => void;
}

/**
 * Hook for managing Push notifications on both targets:
 *  - Browser (Web Push): PushManager + VAPID + service worker.
 *  - Capacitor Android app (native FCM push): platform detection + plugin.
 */
export function usePushNotifications(options: UsePushNotificationsOptions = {}) {
  const { autoSubscribe = false, onChange } = options;

  const [state, setState] = useState<PushSubscriptionState>({
    native: false,
    supported: false,
    permission: 'unsupported' as ExtendedPermission,
    subscribed: false,
    loading: true,
    error: null,
  });

  const supabaseRef = useRef(createClient());
  const mountedRef = useRef(true);
  const tokenRef = useRef<string | null>(null);
  const pendingSubscribeRef = useRef(false);

  // Update state and notify
  const updateState = useCallback((partial: Partial<PushSubscriptionState>) => {
    if (!mountedRef.current) return;
    setState((prev) => {
      const next = { ...prev, ...partial };
      onChange?.(next);
      return next;
    });
  }, [onChange]);

  // Save the native FCM token to the server.
  const saveFcmToken = useCallback(async (token: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'fcm', token }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save FCM token');
      }
      tokenRef.current = token;
      updateState({ subscribed: true, loading: false, permission: 'granted', error: null });
      toast.success('Notificaciones push activadas');
      return true;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to save FCM token';
      console.error('[Push] FCM save error:', err);
      updateState({ error, loading: false, subscribed: false });
      toast.error('Error al activar', { description: error });
      return false;
    }
  }, [updateState]);

  // Check browser support
  const checkSupport = useCallback(() => {
    const native = isNativePush();
    const web =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    const supported = native || web;
    const permission = (web ? Notification.permission : native ? 'default' : 'unsupported') as ExtendedPermission;
    updateState({ native, supported, permission });
    return supported;
  }, [updateState]);

  // Check if user has active web-push subscription (browser only)
  const checkSubscription = useCallback(async () => {
    if (isNativePush()) return;
    if (!checkSupport()) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      updateState({ subscribed: !!subscription });
    } catch (err) {
      console.error('[Push] Failed to check subscription:', err);
      updateState({ subscribed: false });
    }
  }, [checkSupport, updateState]);

  // Initialize on mount
  useEffect(() => {
    mountedRef.current = true;
    checkSupport();
    updateState({ loading: false });

    // Native: wire plugin listeners. The FCM token arrives asynchronously via
    // the 'registration' event; we store it and only push it to the server if
    // the user has opted in (pendingSubscribeRef).
    let nativeCleanup: (() => void) | undefined;
    if (isNativePush()) {
      nativeCleanup = addNativePushListeners({
        onToken: (value) => {
          tokenRef.current = value;
          if (pendingSubscribeRef.current) {
            pendingSubscribeRef.current = false;
            void saveFcmToken(value);
          }
        },
        onRegistrationError: (error) => {
          console.error('[Push] FCM registration error:', error);
          updateState({ loading: false, error });
        },
        onReceived: (n) => {
          if (n.body) toast.info(n.title ?? 'wacrm', { description: n.body });
        },
        onAction: handleNativeAction,
      });
    }

    checkSubscription();

    return () => {
      mountedRef.current = false;
      nativeCleanup?.();
    };
  }, [checkSupport, checkSubscription, updateState, saveFcmToken]);

  // Re-check permission when window gains focus (browser)
  useEffect(() => {
    if (!state.supported || state.native) return;

    const handleFocus = () => {
      updateState({ permission: Notification.permission as ExtendedPermission });
      checkSubscription();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [state.supported, state.native, updateState, checkSubscription]);

  // Request notification permission
  const requestPermission = useCallback(async (): Promise<ExtendedPermission> => {
    if (!state.supported) return 'unsupported';

    // Native: let the Capacitor plugin drive the OS permission dialog.
    if (state.native) {
      const granted = await requestNativePermission();
      updateState({ permission: granted ? 'granted' : 'denied' });
      return granted ? 'granted' : 'denied';
    }

    try {
      const permission = await Notification.requestPermission();
      updateState({ permission: permission as ExtendedPermission });
      return permission;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to request permission';
      updateState({ error });
      return 'denied';
    }
  }, [state.supported, state.native, updateState]);

  // Subscribe to push
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!state.supported) {
      updateState({ error: 'Push not supported in this browser' });
      return false;
    }

    if (state.permission === 'denied') {
      updateState({ error: 'Notification permission denied. Enable in app settings.' });
      toast.error('Permiso denegado', {
        description: 'Habilita las notificaciones en la configuración del dispositivo.',
      });
      return false;
    }

    updateState({ loading: true, error: null });

    // Native FCM path.
    if (state.native) {
      let permission: ExtendedPermission = state.permission;
      if (permission !== 'granted') {
        permission = await requestPermission();
        if (permission !== 'granted') {
          updateState({ loading: false });
          return false;
        }
      }
      registerNative(); // token arrives on the 'registration' listener
      if (tokenRef.current) {
        return await saveFcmToken(tokenRef.current);
      }
      pendingSubscribeRef.current = true;
      return true;
    }

    try {
      // Request permission if needed
      let permission: ExtendedPermission = state.permission;
      if (permission !== 'granted') {
        permission = await requestPermission();
        if (permission !== 'granted') {
          updateState({ loading: false });
          return false;
        }
      }

      // Get VAPID public key from server/env
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error('VAPID public key not configured');
      }

      // Convert base64url to Uint8Array
      function urlBase64ToUint8Array(base64String: string): Uint8Array {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
      }

      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey) as BufferSource;

      // Subscribe via service worker
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      // Send subscription to server
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save subscription on server');
      }

      updateState({ subscribed: true, loading: false });
      toast.success('Notificaciones push activadas');
      return true;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Subscription failed';
      console.error('[Push] Subscribe error:', err);
      updateState({ error, loading: false, subscribed: false });
      toast.error('Error al activar', { description: error });
      return false;
    }
  }, [state.supported, state.permission, state.native, requestPermission, updateState, saveFcmToken]);

  // Unsubscribe from push
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!state.supported) return true;

    updateState({ loading: true, error: null });

    // Native FCM path.
    if (state.native) {
      if (tokenRef.current) {
        try {
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: tokenRef.current }),
          });
        } catch (err) {
          console.error('[Push] FCM unsubscribe error:', err);
        }
        tokenRef.current = null;
      }
      pendingSubscribeRef.current = false;
      updateState({ subscribed: false, loading: false });
      toast.success('Notificaciones push desactivadas');
      return true;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Remove from server
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });

        // Unsubscribe locally
        await subscription.unsubscribe();
      }

      updateState({ subscribed: false, loading: false });
      toast.success('Notificaciones push desactivadas');
      return true;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unsubscribe failed';
      console.error('[Push] Unsubscribe error:', err);
      updateState({ error, loading: false });
      toast.error('Error al desactivar', { description: error });
      return false;
    }
  }, [state.supported, state.native, updateState]);

  // Send test notification
  const sendTest = useCallback(async (): Promise<boolean> => {
    if (!state.subscribed) {
      toast.error('No hay suscripción activa');
      return false;
    }

    try {
      const response = await fetch('/api/push/test', { method: 'POST' });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Test failed');
      }

      if (result.success) {
        toast.success('Notificación de prueba enviada');
      } else {
        toast.error('Error en prueba', { description: result.errors?.[0]?.error });
      }

      return result.success;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Test failed';
      toast.error('Error', { description: error });
      return false;
    }
  }, [state.subscribed]);

  // Toggle subscription
  const toggle = useCallback(async () => {
    if (state.subscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  }, [state.subscribed, subscribe, unsubscribe]);

  return {
    ...state,
    requestPermission,
    subscribe,
    unsubscribe,
    toggle,
    sendTest,
    checkSubscription,
  };
}

/**
 * Handling a tap on a native notification: navigate to the deep-link target.
 * Outside the hook so it can be referenced by the mount-time listener.
 */
function handleNativeAction(notification: ReceivedNotification & { data?: Record<string, string | number | null> }) {
  const url = notification.data?.url;
  if (typeof url === 'string' && url) {
    window.location.href = url;
  } else {
    window.location.href = '/inbox';
  }
}

/** Hook to check if push is supported (for conditional rendering) */
export function usePushSupport(): boolean {
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const native = isNativePush();
    const web =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    setSupported(native || web);
  }, []);

  return supported;
}