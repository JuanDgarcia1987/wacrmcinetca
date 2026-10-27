'use client';

import { useState, useSyncExternalStore } from 'react';
import { Bell, BellRing, CircleAlert, Loader2, CheckCircle2, AlertCircle, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import {
  getNotificationPermission,
  type BrowserNotifyPermission,
} from '@/lib/notifications/browser-notify';

// 'Notification.permission' has no change event of its own. Re-read it
// whenever the tab regains focus (the user may have flipped the site
// setting in the browser UI) and whenever our own preference changes.
function subscribePermission(onChange: () => void): () => void {
  window.addEventListener('focus', onChange);
  document.addEventListener('visibilitychange', onChange);
  return () => {
    window.removeEventListener('focus', onChange);
    document.removeEventListener('visibilitychange', onChange);
  };
}

const serverPermission = (): BrowserNotifyPermission => 'unsupported';

/**
 * "Push Notifications" card — device-scoped opt-in for Web Push
 * notifications about new customer messages. Works even when browser is closed.
 * Requires HTTPS and PWA installation on iOS.
 */
export function PushNotificationsCard({ className }: { className?: string }) {
  const t = useTranslations('Settings.pushNotifications');
  const {
    native,
    supported,
    permission,
    subscribed,
    loading,
    error,
    toggle,
    sendTest,
    requestPermission,
    checkSubscription,
  } = usePushNotifications();

  const [permissionState, setPermissionState] = useSyncExternalStore(
    subscribePermission,
    getNotificationPermission,
    serverPermission,
  );

  // In native (Capacitor) the browser Web Notification API isn't authoritative,
  // so trust the hook's permission (driven by the Capacitor plugin).
  const isPermissionGranted = native ? permission === 'granted' : permissionState === 'granted';
  const isPermissionDenied = native ? permission === 'denied' : permissionState === 'denied';
  const isPermissionDefault = native ? permission === 'default' : permissionState === 'default';
  // canSubscribe: true if supported and permission is NOT denied (granted or default - default means we can request)
  const canSubscribe = supported && !isPermissionDenied;
  const checked = subscribed && (native ? permission === 'granted' : isPermissionGranted);

  const onToggle = async (next: boolean) => {
    if (!next) {
      await toggle(); // unsubscribe
      return;
    }

    if (!supported) {
      toast.error(t('unsupported'));
      return;
    }

    if (native) {
      // Native subscribe() handles the OS permission dialog and FCM registration.
      await toggle();
      return;
    }

    if (isPermissionDenied) {
      toast.error(t('permissionDenied'), { description: t('permissionDeniedHint') });
      return;
    }

    if (!isPermissionGranted) {
      // Permission is 'default' - request it, then auto-subscribe
      await requestPermission();
      // Wait for permission state to update
      await new Promise((r) => setTimeout(r, 200));
      // Re-check permission (will be updated by focus/visibility listeners)
      // If granted, proceed to subscribe
      if (Notification.permission === 'granted') {
        await toggle(); // subscribe
      }
      return;
    }

    await toggle(); // subscribe
  };

  const handleTest = async () => {
    await sendTest();
  };

  // Determine status message
  let statusKey = 'statusDefault';
  let statusIcon = Bell;
  let statusColor = 'text-muted-foreground';

  if (!supported) {
    statusKey = 'statusUnsupported';
    statusIcon = Smartphone;
    statusColor = 'text-muted-foreground';
  } else if (isPermissionDenied) {
    statusKey = 'statusDenied';
    statusIcon = AlertCircle;
    statusColor = 'text-amber-700 dark:text-amber-300';
  } else if (isPermissionDefault) {
    statusKey = 'statusDefault';
    statusIcon = Bell;
    statusColor = 'text-muted-foreground';
  } else if (subscribed) {
    statusKey = 'statusSubscribed';
    statusIcon = CheckCircle2;
    statusColor = 'text-green-700 dark:text-green-300';
  } else {
    statusKey = 'statusReady';
    statusIcon = BellRing;
    statusColor = 'text-muted-foreground';
  }

  // Render status icon component (React requires capitalized component names in JSX)
  const renderStatusIcon = (Icon: typeof Bell) => <Icon className="size-4" />;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Bell className="size-4 text-muted-foreground" />
          {t('title')}
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!supported ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Smartphone className="size-4 shrink-0" />
            <span>{t('unsupported')}</span>
          </div>
        ) : (
          <>
            {/* Status indicator */}
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center gap-2 text-sm">
                <span
                  className={`flex items-center gap-1.5 ${statusColor}`}
                >
                  {renderStatusIcon(statusIcon)}
                  <span>{t(statusKey)}</span>
                </span>
              </div>

              {/* iOS hint */}
              {supported && /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches && (
                <p className="mt-2 flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                  <Smartphone className="mt-0.5 size-3.5 shrink-0" />
                  <span>{t('iosHint')}</span>
                </p>
              )}

              {/* Permission denied hint */}
              {isPermissionDenied && (
                <p className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>{t('permissionDeniedHint')}</span>
                </p>
              )}

              {/* Error message */}
              {error && (
                <p className="mt-2 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>{error}</span>
                </p>
              )}
            </div>

            {/* Toggle */}
            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{t('toggleLabel')}</p>
                <p className="text-xs text-muted-foreground">{t('toggleDesc')}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                <Switch
                  checked={checked}
                  onCheckedChange={(next) => void onToggle(next)}
                  disabled={loading || !supported || isPermissionDenied}
                  aria-label={t('toggleLabel')}
                />
              </div>
            </div>

            {/* Test button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={!checked || loading}
            >
              <BellRing className="size-4" />
              {t('sendTest')}
            </Button>

            {/* Install PWA hint */}
            {supported && !window.matchMedia('(display-mode: standalone)').matches && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Smartphone className="size-3.5" />
                <span>{t('installHint')}</span>
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
