// Client diagnostics → client_logs table (supabase/logs.sql). Best effort: logging never throws.
let sb = null;
let budget = 30;                      // per page load, so a crash loop cannot flood the table
const queue = [];                     // events before login are kept and sent once a session exists

export async function environment() {
  const env = {
    ua: navigator.userAgent,
    standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    notification: 'Notification' in window ? Notification.permission : 'unsupported',
    serviceWorker: 'serviceWorker' in navigator,
    pushManager: 'PushManager' in window,
    online: navigator.onLine,
    url: location.href,
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    env.swState = reg ? (reg.active?.state ?? reg.installing?.state ?? reg.waiting?.state ?? 'none') : 'no registration';
    env.swScope = reg?.scope;
    env.pushPermission = reg?.pushManager ? await reg.pushManager.permissionState({ userVisibleOnly: true }) : null;
    env.hasSubscription = reg?.pushManager ? !!(await reg.pushManager.getSubscription()) : null;
  } catch (e) { env.envError = String(e); }
  return env;
}

const errorInfo = e => e ? { name: e.name, message: e.message ?? String(e), code: e.code, stack: e.stack?.slice(0, 800) } : null;

async function send(row) {
  if (!sb || budget <= 0) { if (queue.length < 30) queue.push(row); return; }
  budget--;
  try { await sb.from('client_logs').insert(row); } catch { /* never let logging break the app */ }
}

export function log(kind, message, detail = {}) {
  const row = { kind, message: String(message).slice(0, 500), detail: { ...detail, at: new Date().toISOString() } };
  console[kind === 'error' ? 'error' : 'info']('[spora]', kind, message, detail);
  send(row);
}

export async function logError(context, e, extra = {}) {
  log('error', `${context}: ${e?.message ?? e}`, { context, error: errorInfo(e), env: await environment(), ...extra });
}

// Call once a logged-in client exists; flushes anything logged earlier.
export function initLogging(client) {
  sb = client;
  for (const row of queue.splice(0)) send(row);
}

addEventListener('error', e => logError('window.onerror', e.error ?? e.message, { src: `${e.filename}:${e.lineno}` }));
addEventListener('unhandledrejection', e => logError('unhandledrejection', e.reason));
