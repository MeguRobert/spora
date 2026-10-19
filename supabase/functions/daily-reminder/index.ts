// Spóra daily reminder: pushes "write down today's spendings" to every subscribed phone.
// Called by pg_cron (supabase/push.sql) at 07,08,19,20 UTC; sends only when it is 10:00 or 22:00
// in Bucharest, so daylight-saving changes need no edits. Deployed with --no-verify-jwt: the
// x-cron-secret header is the only key, so nobody else can trigger a notification.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const MESSAGES: Record<string, { title: string; body: string }> = {
  morning: { title: 'Spóra ☀️', body: 'Jó reggelt! Volt tegnap este vagy ma reggel költés? Írd be, amíg emlékszel.' },
  evening: { title: 'Spóra 🌙', body: 'Mielőtt lefekszel: minden mai költés be van írva?' },
  test:    { title: 'Spóra', body: 'Teszt értesítés: működik! 🎉' },
};

const bucharestHour = () => Number(new Intl.DateTimeFormat('en-GB',
  { timeZone: 'Europe/Bucharest', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));

Deno.serve(async req => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('forbidden', { status: 403 });

  const body = await req.json().catch(() => ({}));
  const hour = bucharestHour();
  const slot: string | null = body.slot ?? (hour === 10 ? 'morning' : hour === 22 ? 'evening' : null);
  if (!slot || !MESSAGES[slot]) return Response.json({ skipped: true, hour });

  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: subs, error } = await db.from('push_subscriptions').select('endpoint,p256dh,auth');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const payload = JSON.stringify(MESSAGES[slot]);
  let sent = 0, removed = 0;
  const failed: string[] = [];
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload,
        { TTL: 4 * 3600, urgency: 'normal' });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // 404/410: the phone unsubscribed or the app was removed — forget that device.
      if (code === 404 || code === 410) { await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint); removed++; }
      else failed.push(String(code ?? (e as Error).message));
    }
  }
  return Response.json({ slot, hour, sent, removed, failed });
});
