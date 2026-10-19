-- Spóra — daily reminder push notifications (10:00 and 22:00 Europe/Bucharest).
-- Applied after schema.sql. Part 2 holds a secret: run it with <CRON_SECRET> replaced, never commit the value.

-- ---------- 1. where to send: one row per phone/browser that tapped "Értesítések" ----------
create table push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  email text not null default (auth.jwt() ->> 'email'),
  user_agent text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on push_subscriptions to authenticated;
grant select, delete on push_subscriptions to service_role;   -- the daily-reminder function reads and prunes
alter table push_subscriptions enable row level security;
-- Each person manages only their own devices.
create policy own_devices on push_subscriptions for all
  using (is_household() and lower(email) = lower(auth.jwt() ->> 'email'))
  with check (is_household() and lower(email) = lower(auth.jwt() ->> 'email'));

-- ---------- 2. when: call the daily-reminder function ----------
-- Bucharest is UTC+3 in summer and UTC+2 in winter, so fire at both candidate UTC hours;
-- the function only sends on the run that lands on 10:00 or 22:00 local time.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.schedule('spora-daily-reminder', '0 7,8,19,20 * * *', $$
  select net.http_post(
    url := 'https://eyzbdakkalbckoaaxvzj.supabase.co/functions/v1/daily-reminder',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb)
$$);
