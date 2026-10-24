-- Push subscriptions table for Web Push notifications
-- Stores VAPID push subscriptions per user

create table if not exists public.push_subscriptions (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

-- Users can only manage their own subscriptions
create policy "Users manage own push subscriptions"
  on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for faster lookups
create index if not exists idx_push_subscriptions_user_id
  on public.push_subscriptions(user_id);

-- Function to update updated_at timestamp
create or replace function public.update_push_subscriptions_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger push_subscriptions_updated_at
  before update on public.push_subscriptions
  for each row execute function public.update_push_subscriptions_updated_at();

-- Grant permissions
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant usage on sequence public.push_subscriptions_id_seq to authenticated;