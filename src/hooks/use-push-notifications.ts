"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

/** Web Push subscription state */
export interface PushSubscriptionState {
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
 * Hook for managing Web Push notifications
 * Handles permission, subscription, and communication with server
 */
export function usePushNotifications(options: UsePushNotificationsOptions = {}) {
  const { autoSubscribe = false, onChange } = options;

  const [state, setState] = useState<PushSubscriptionState>({
    supported: false,
    permission: 'unsupported' as ExtendedPermission,
    subscribed: false,
    loading: true,
    error: null,
  });

  const supabaseRef = useRef(createClient());
  const mountedRef = useRef(true);

  // Update state and notify
  const updateState = useCallback((partial: Partial<PushSubscriptionState>) => {
    if (!mountedRef.current) return;
    setState((prev) => {
      const next = { ...prev, ...partial };
      onChange?.(next);
      return next;
    });
  }, [onChange]);

  // Check browser support
  const checkSupport = useCallback(() => {
    const supported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;

    const permission = (supported ? Notification.permission : 'unsupported') as ExtendedPermission;

    updateState({ supported, permission });
    return supported;
  }, [updateState]);

  // Check if user has active subscription
  const checkSubscription = useCallback(async () => {
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
    checkSubscription();
    updateState({ loading: false });

    return () => {
      mountedRef.current = false;
    };
  }, [checkSupport, checkSubscription, updateState]);

  // Re-check permission when window gains focus
  useEffect(() => {
    if (!state.supported) return;

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
  }, [state.supported, updateState, checkSubscription]);

  // Request notification permission
  const requestPermission = useCallback(async (): Promise<ExtendedPermission> => {
    if (!state.supported) return 'unsupported';

    try {
      const permission = await Notification.requestPermission();
      updateState({ permission: permission as ExtendedPermission });
      return permission;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to request permission';
      updateState({ error });
      return 'denied';
    }
  }, [state.supported, updateState]);

  // Subscribe to push
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!state.supported) {
      updateState({ error: 'Push not supported in this browser' });
      return false;
    }

    if (state.permission === 'denied') {
      updateState({ error: 'Notification permission denied. Enable in browser settings.' });
      toast.error('Permiso denegado', {
        description: 'Habilita las notificaciones en la configuración del navegador.',
      });
      return false;
    }

    updateState({ loading: true, error: null });

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
  }, [state.supported, state.permission, requestPermission, updateState]);

  // Unsubscribe from push
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!state.supported) return true;

    updateState({ loading: true, error: null });

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
  }, [state.supported, updateState]);

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

/** Hook to check if push is supported (for conditional rendering) */
export function usePushSupport(): boolean {
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const supported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    setSupported(supported);
  }, []);

  return supported;
}