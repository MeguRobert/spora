// Daily reminder subscription: this device ↔ a row in push_subscriptions.
import { VAPID_PUBLIC_KEY } from './config.js';

const fromB64u = s => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
};
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// Why this device cannot get reminders, in Hungarian, or null when it can.
export function pushBlocker() {
  if (isIOS() && !isStandalone()) return 'iPhone-on az értesítéshez előbb tedd ki az appot a főképernyőre (Megosztás → Főképernyőhöz adás), és onnan nyisd meg.';
  if (!pushSupported()) return 'Ez a böngésző nem tud értesítést fogadni.';
  if (Notification.permission === 'denied') return 'Az értesítések le vannak tiltva ennél az oldalnál. A böngésző / telefon beállításaiban engedélyezd.';
  return null;
}

export async function registerWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register('sw.js'); } catch (e) { console.warn(e); return null; }
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function enablePush(sb) {
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await registerWorker());
  if (!reg) throw new Error('A háttérszolgáltatás nem indult el.');
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Nem kaptam engedélyt az értesítésekhez.');
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(VAPID_PUBLIC_KEY) });
  const { keys } = sub.toJSON();
  const { error } = await sb.from('push_subscriptions')
    .upsert({ endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: navigator.userAgent.slice(0, 200) });
  if (error) { await sub.unsubscribe(); throw error; }
}

export async function disablePush(sb) {
  const sub = await currentSubscription();
  if (!sub) return;
  await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}
