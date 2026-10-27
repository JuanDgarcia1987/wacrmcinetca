-- FCM / native device push support for the Capacitor Android app.
-- Web-push rows keep provider='web' (endpoint = push endpoint URL, p256dh/auth set).
-- Native rows use provider='fcm' (endpoint holds the FCM registration token,
-- p256dh/auth are NULL because FCM has no web-push keys).

alter table public.push_subscriptions
  add column if not exists provider text not null default 'web';

-- Native (FCM) rows have no web-push keys.
alter table public.push_subscriptions
  alter column p256dh drop not null,
  alter column auth drop not null;

-- Faster per-user, per-provider lookups when sending.
create index if not exists idx_push_subscriptions_user_provider
  on public.push_subscriptions(user_id, provider);