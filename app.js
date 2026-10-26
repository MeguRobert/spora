import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { parseEntry, parseChat, parseAmount, suggestCategory, ruleKeyword, localIso } from './parse.js';
import { LOGO, ICONS, categoryLook, svg } from './brand.js';
import { registerWorker, currentSubscription, enablePush, disablePush, pushBlocker } from './push.js';
import { initLogging, logError, log, environment } from './log.js';

const app = document.getElementById('app');
const dlg = document.getElementById('edit');
let sb;

const S = {
  tab: 'log',
  month: localIso(new Date()).slice(0, 7),
  user: null, members: [], categories: [], rules: [], spendings: [],
  draft: newDraft(),
  importText: '', importRows: [],
};

function newDraft() { return { text: '', amount: null, date: null, cat: null }; }

// ---------- tiny DOM helper ----------
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el[k] = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c);
  return el;
}

const money = n => Number(n).toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';
// The native date picker shows the browser's own format (10/12/2026 in an English Chrome) and a page
// cannot change that, so each picker gets the date spelled out in Hungarian under it.
const longDate = iso => iso
  ? new Date(iso + 'T00:00').toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric', weekday: 'long' })
  : '';
function dateHint(input) {
  const el = h('div', { class: 'date-hint' });
  el.refresh = () => { el.textContent = longDate(input.value); };
  input.addEventListener('input', el.refresh);
  input.addEventListener('change', el.refresh);
  el.refresh();
  return el;
}
const amountText = n => (n == null ? '' : String(n).replace('.', ','));
const catName = id => S.categories.find(c => c.id === id)?.name ?? 'Nincs kategória';
// 'household' categories make up the monthly total; 'separate' (APPROB SRL, Házépítés) and
// 'receivable' (Visszajár) are separate pots shown on their own.
const catKind = id => S.categories.find(c => c.id === id)?.kind ?? 'household';
const isHousehold = s => catKind(s.category_id) === 'household';
const member = email => S.members.find(m => m.email.toLowerCase() === (email ?? '').toLowerCase());
const toId = v => (v === '' || v == null ? null : Number(v));

function toast(msg, ms = 2200) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

function categorySelect(value) {
  const opt = c => h('option', { value: c.id, selected: c.id === value }, `${categoryLook(c.name).emoji}  ${c.name}`);
  return h('select', {},
    h('option', { value: '' }, '— kategória —'),
    h('optgroup', { label: 'Háztartás' }, S.categories.filter(c => c.kind === 'household').map(opt)),
    h('optgroup', { label: 'Külön kassza' }, S.categories.filter(c => c.kind !== 'household').map(opt)));
}

const catIcon = id => {
  const { emoji, color } = categoryLook(catName(id));
  return h('span', { class: 'cat-icon', style: `--cat:${color}` }, emoji);
};
const sumOf = list => list.reduce((a, s) => a + Number(s.amount), 0);
const brandMark = () => h('div', { class: 'brand' }, svg(LOGO), h('span', { class: 'wordmark' }, 'spóra'));

async function logout() { await sb.auth.signOut(); renderLogin(); }

// A readable help window for problems that need the person to change a phone setting.
function helpDialog(title, intro, steps = []) {
  dlg.replaceChildren(
    h('div', { class: 'help' },
      h('div', { class: 'help-icon' }, svg(ICONS.bellOff)),
      h('h1', {}, title),
      intro ? h('p', { class: 'help-intro' }, intro) : null,
      steps.length ? h('ol', { class: 'help-steps' }, steps.map(s => h('li', {}, s))) : null,
      h('button', { class: 'primary block', onclick: () => dlg.close() }, 'Rendben')));
  dlg.showModal();
}

// "Registration failed - push service error": Chrome could not get a registration from Google's push
// service. On Xiaomi/Redmi (HyperOS) that is almost always background/battery restrictions.
const PUSH_SERVICE_HELP = [
  'Beállítások → Alkalmazások → Alkalmazások kezelése → Chrome: Automatikus indítás bekapcsolva.',
  'Ugyanott: Akkumulátorkímélő → Nincs korlátozás.',
  'Ugyanezt a kettőt a Google Play-szolgáltatások alkalmazásnál is.',
  'Play Áruház: frissítsd a Chrome-ot és a Google Play-szolgáltatásokat.',
  'Zárd be a Spórát (húzd el a legutóbbi appok közül), nyisd meg újra, és nyomd meg a csengőt.',
];

// Header bell: daily reminders at 10:00 and 22:00 on this device.
async function toggleReminders() {
  try {
    if (S.pushOn) {
      if (!confirm('Kikapcsolod a napi emlékeztetőket ezen a készüléken?')) return;
      await disablePush(sb);
      S.pushOn = false;
      toast('Emlékeztetők kikapcsolva');
    } else {
      const blocker = pushBlocker();
      if (blocker) {
        log('push', 'blocked', { step: 'blocked', reason: blocker, env: await environment() });
        helpDialog('Az értesítés itt nem kapcsolható be', blocker);
        return;
      }
      await enablePush(sb);
      S.pushOn = true;
      toast('Emlékeztetők bekapcsolva: minden nap 10:00 és 22:00');
    }
  } catch (e) {
    const pushServiceDown = e?.name === 'AbortError' || /push service/i.test(e?.message ?? '');
    if (pushServiceDown) {
      helpDialog('Nem sikerült bekapcsolni az értesítést',
        'A telefon nem érte el a Google értesítési szerverét. Xiaomi / Redmi telefonon ezt általában az energiatakarékos beállítások okozzák:',
        PUSH_SERVICE_HELP);
    } else {
      helpDialog('Nem sikerült bekapcsolni az értesítést', e?.message ?? String(e));
    }
  }
  render();
}

// Simple branded page for setup / no-access / error states.
function notice(...children) {
  app.replaceChildren(h('header', { class: 'top' }, brandMark()), h('div', { class: 'card' }, ...children));
}

function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return [`${month}-01`, `${next}-01`];
}

function shiftMonth(delta) {
  const [y, m] = S.month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  S.month = localIso(d).slice(0, 7);
  loadMonth().then(render);
}

// ---------- data ----------
async function loadRefs() {
  const [cats, rules, members] = await Promise.all([
    sb.from('categories').select('id,name,kind').order('sort').order('name'),
    sb.from('category_rules').select('keyword,category_id'),
    sb.from('allowed_emails').select('email,display_name'),
  ]);
  for (const r of [cats, rules, members]) if (r.error) throw r.error;
  S.categories = cats.data; S.rules = rules.data; S.members = members.data;
}

async function loadMonth() {
  const [from, to] = monthRange(S.month);
  const { data, error } = await sb.from('spendings').select('*')
    .gte('spent_on', from).lt('spent_on', to)
    .order('spent_on', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error;
  S.spendings = data;
  // Separate pots are shown with their all-time totals, so load every row of those categories.
  const potIds = S.categories.filter(c => c.kind !== 'household').map(c => c.id);
  S.pots = [];
  if (potIds.length) {
    const pots = await sb.from('spendings').select('*').in('category_id', potIds).order('spent_on', { ascending: false });
    if (pots.error) throw pots.error;
    S.pots = pots.data;
  }
}

// Remember "this word means this category" whenever someone overrides a suggestion.
async function learn(description, categoryId, suggestedId) {
  if (!categoryId || categoryId === suggestedId) return;
  const keyword = ruleKeyword(description);
  if (!keyword) return;
  const { error } = await sb.from('category_rules').upsert({ keyword, category_id: categoryId });
  if (error) return console.warn(error);
  S.rules = [...S.rules.filter(r => r.keyword !== keyword), { keyword, category_id: categoryId }];
}

// ---------- screens ----------
function renderSetup() {
  notice(h('p', {}, 'Még nincs beállítva a Supabase kapcsolat.'),
    h('p', { class: 'muted' }, 'Írd be a config.js fájlba a SUPABASE_URL és SUPABASE_ANON_KEY értékeket (lásd README.md).'));
}

function renderLogin(message) {
  const email = h('input', { type: 'email', autocomplete: 'email', placeholder: 'email' });
  const pass = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'jelszó' });
  const msg = h('p', { class: 'muted' }, message ?? '');
  const go = async (signUp) => {
    msg.textContent = '…';
    const creds = { email: email.value.trim(), password: pass.value };
    const { data, error } = signUp ? await sb.auth.signUp(creds) : await sb.auth.signInWithPassword(creds);
    if (error) { msg.textContent = error.message; msg.className = 'warn'; return; }
    if (!data.session) { msg.textContent = 'Nézd meg az emailed és erősítsd meg a regisztrációt, aztán lépj be.'; return; }
    start();
  };
  pass.onkeydown = e => { if (e.key === 'Enter') go(false); };
  app.replaceChildren(h('div', { class: 'login' },
    h('div', { class: 'login-hero' }, svg(LOGO), h('div', { class: 'wordmark' }, 'spóra'),
      h('p', { class: 'tagline' }, 'Minden lej a helyén.')),
    h('div', { class: 'card' },
      h('label', { style: 'margin-top:0' }, 'Email'), email, h('label', {}, 'Jelszó'), pass,
      h('button', { class: 'primary block', onclick: () => go(false) }, 'Belépés'),
      h('div', { class: 'row', style: 'justify-content:center;margin-top:6px' },
        h('button', { class: 'link', onclick: () => go(true) }, 'Első alkalom? Regisztráció')),
      msg)));
}

function render() {
  const body = { log: renderLog, month: renderMonth, import: renderImport }[S.tab]();
  const tab = (id, label) => h('button', { class: S.tab === id ? 'on' : '', onclick: () => { S.tab = id; render(); } },
    svg(ICONS[id]), label);
  app.replaceChildren(
    h('header', { class: 'top' }, brandMark(),
      h('span', { class: 'me' }, member(S.user?.email)?.display_name ?? ''),
      h('button', {
        class: 'icon-btn' + (S.pushOn ? ' on' : ''), onclick: toggleReminders,
        title: S.pushOn ? 'Napi emlékeztető: be' : 'Napi emlékeztető bekapcsolása',
        'aria-label': S.pushOn ? 'Napi emlékeztető: be' : 'Napi emlékeztető bekapcsolása',
      }, svg(S.pushOn ? ICONS.bell : ICONS.bellOff)),
      h('button', { class: 'icon-btn', title: 'Kilépés', 'aria-label': 'Kilépés', onclick: logout }, svg(ICONS.logout))),
    ...body.flat(Infinity).filter(c => c != null && c !== false),
    h('nav', { class: 'tabs' }, tab('log', 'Napló'), tab('month', 'Hónap'), tab('import', 'Import')));
  if (S.tab === 'log') document.getElementById('quick')?.focus({ preventScroll: true });
}

function monthNav() {
  const [y, m] = S.month.split('-').map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long' });
  const isCurrent = S.month === localIso(new Date()).slice(0, 7);
  return h('div', { class: 'month-nav' },
    h('button', { class: 'icon-btn', title: 'Előző hónap', 'aria-label': 'Előző hónap', onclick: () => shiftMonth(-1) }, svg(ICONS.prev)),
    h('strong', {}, label),
    h('button', { class: 'icon-btn', title: 'Következő hónap', 'aria-label': 'Következő hónap', disabled: isCurrent,
      onclick: () => shiftMonth(1) }, svg(ICONS.next)));
}

function addForm() {
  const d = S.draft;
  const quick = h('input', { id: 'quick', placeholder: 'pl. kenyér 10,88', autocomplete: 'off', enterkeyhint: 'done', value: d.text,
    'aria-label': 'Mit vettél?' });
  const amount = h('input', { inputmode: 'decimal', placeholder: '0,00' });
  const date = h('input', { type: 'date' });
  const dHint = dateHint(date);
  const cat = categorySelect(null);
  const save = h('button', { class: 'primary block' }, 'Mentés');
  let parsed = { description: '', amount: null, date: null }, suggested = null;

  const sync = () => {
    parsed = parseEntry(quick.value);
    suggested = suggestCategory(parsed.description, S.rules);
    amount.value = d.amount ?? amountText(parsed.amount);
    date.value = d.date ?? parsed.date ?? localIso(new Date());
    dHint.refresh();
    cat.value = d.cat ?? suggested ?? '';
    save.disabled = !quick.value.trim();
  };
  quick.oninput = () => { d.text = quick.value; sync(); };
  quick.onkeydown = e => { if (e.key === 'Enter') save.click(); };
  amount.oninput = () => { d.amount = amount.value; };
  date.oninput = () => { d.date = date.value; };
  cat.onchange = () => { d.cat = cat.value; };

  save.onclick = async () => {
    const value = parseAmount(amount.value);
    if (!value || value <= 0) { toast('Hiányzik az összeg'); amount.focus(); return; }
    const description = parsed.description || quick.value.trim();
    const category_id = toId(cat.value);
    save.disabled = true;
    const { error } = await sb.from('spendings').insert({ description, amount: value, spent_on: date.value, category_id });
    if (error) { logError("db write", error); toast(error.message); save.disabled = false; return; }
    await learn(description, category_id, suggested);
    S.draft = newDraft();
    toast(`Mentve: ${description} — ${money(value)}`);
    if (!date.value.startsWith(S.month)) S.month = date.value.slice(0, 7);
    await loadMonth();
    render();
  };
  sync();

  return h('div', { class: 'card' }, h('p', { class: 'card-title' }, 'Mit vettél?'), quick,
    h('div', { class: 'fields' },
      h('div', {}, h('label', {}, 'Összeg (lei)'), amount),
      h('div', {}, h('label', {}, 'Dátum'), date, dHint),
      h('div', { class: 'full' }, h('label', {}, 'Kategória'), cat)),
    save);
}

function potTag(s) {
  const kind = catKind(s.category_id);
  if (kind === 'receivable') return s.returned_on
    ? h('span', { class: 'tag ok' }, 'visszakapva')
    : h('span', { class: 'tag due' }, 'visszajár');
  if (kind === 'separate') return h('span', { class: 'tag' }, 'külön kassza');
  return null;
}

function spendingItem(s) {
  const who = member(s.created_by_email)?.display_name ?? s.created_by_email;
  return h('button', { class: 'item', onclick: () => openEdit(s) },
    catIcon(s.category_id),
    h('span', { class: 'item-main' },
      h('span', { class: 'desc' }, s.description),
      h('span', { class: 'sub' }, `${catName(s.category_id)} · ${who}`, potTag(s))),
    h('span', { class: 'amt num' }, money(s.amount)));
}

function renderLog() {
  const days = new Map();
  for (const s of S.spendings) (days.get(s.spent_on) ?? days.set(s.spent_on, []).get(s.spent_on)).push(s);
  const list = [...days].map(([day, items]) => [
    h('div', { class: 'day' },
      h('span', {}, new Date(day + 'T00:00').toLocaleDateString('hu-HU', { month: 'short', day: 'numeric', weekday: 'long' })),
      h('span', { class: 'num' }, money(sumOf(items)))),
    items.map(spendingItem),
  ]);
  const household = S.spendings.filter(isHousehold), potMonth = S.spendings.filter(x => !isHousehold(x));
  return [addForm(), monthNav(),
    h('div', { class: 'strip-total' },
      h('span', { class: 'muted' }, `${household.length} tétel · háztartás`), h('strong', { class: 'num' }, money(sumOf(household)))),
    potMonth.length ? h('div', { class: 'strip-note muted' }, `+ külön kassza ebben a hónapban: ${money(sumOf(potMonth))}`) : null,
    list.length ? list : h('p', { class: 'empty' }, 'Ebben a hónapban még nincs költés.')];
}

function bars(groups) {
  const total = groups.reduce((a, g) => a + g.sum, 0) || 1;
  const max = Math.max(...groups.map(g => g.sum), 1);
  return groups.map(g => h('div', { class: 'bar-row', style: `--cat:${g.color}` },
    h('span', { class: 'cat-icon', style: `--cat:${g.color}` }, g.emoji),
    h('span', { class: 'name' }, g.label),
    h('span', { class: 'amt num' }, money(g.sum)),
    h('div', { class: 'bar' }, h('span', { style: `width:${(g.sum / max * 100).toFixed(1)}%` })),
    h('span', { class: 'pct num' }, `${Math.round(g.sum / total * 100)}%`)));
}

function groupSum(key, describe, list = S.spendings) {
  const m = new Map();
  for (const s of list) m.set(key(s), (m.get(key(s)) ?? 0) + Number(s.amount));
  return [...m].map(([k, sum]) => ({ ...describe(k), sum })).sort((a, b) => b.sum - a.sum);
}

async function setReturned(s, returned) {
  const { error } = await sb.from('spendings').update({ returned_on: returned ? localIso(new Date()) : null }).eq('id', s.id);
  if (error) { logError('db write', error); toast(error.message); return false; }
  toast(returned ? `Visszakaptad: ${s.description} — ${money(s.amount)}` : 'Újra kint lévőként jelölve');
  await loadMonth(); render();
  return true;
}

// Separate pots: this month and all-time per category; Visszajár shows what is still owed to you.
function potsSection() {
  const pots = S.categories.filter(c => c.kind !== 'household');
  const monthOf = id => sumOf(S.spendings.filter(x => x.category_id === id));
  const allOf = id => S.pots.filter(x => x.category_id === id);
  const rows = pots.filter(c => allOf(c.id).length).map(c => {
    const look = categoryLook(c.name), all = allOf(c.id);
    const head = (label, value) => h('div', { class: 'pot-head' },
      h('span', { class: 'cat-icon', style: `--cat:${look.color}` }, look.emoji),
      h('span', { class: 'name' }, c.name),
      h('span', { class: 'pot-sum' }, h('span', { class: 'muted' }, label), h('b', { class: 'num' }, money(value))));
    if (c.kind === 'receivable') {
      const open = all.filter(x => !x.returned_on);
      return h('div', { class: 'pot' }, head('kint van ', sumOf(open)),
        open.length
          ? h('div', { class: 'pot-list' }, open.map(x => h('div', { class: 'pot-row' },
              h('span', { class: 'grow pot-desc' }, h('span', {}, x.description), h('small', { class: 'muted' }, longDate(x.spent_on))),
              h('span', { class: 'num' }, money(x.amount)),
              h('button', { class: 'ghost small', onclick: () => setReturned(x, true) }, 'Visszakaptam'))))
          : h('p', { class: 'muted pot-empty' }, 'Minden visszajött. 🎉'));
    }
    return h('div', { class: 'pot' }, head('ebben a hónapban ', monthOf(c.id)),
      h('div', { class: 'pot-total muted' }, 'Összesen eddig: ', h('b', { class: 'num' }, money(sumOf(all)))));
  });
  return rows.length ? [h('h2', {}, 'Külön kassza'), h('p', { class: 'muted pot-note' }, 'Nem számít bele a háztartás havi összegébe.'),
    h('div', { class: 'card' }, rows)] : null;
}

function renderMonth() {
  const household = S.spendings.filter(isHousehold);
  if (!household.length) return [monthNav(), h('p', { class: 'empty' }, 'Ebben a hónapban még nincs háztartási költés.'), potsSection()];
  const total = sumOf(household);
  const [y, m] = S.month.split('-').map(Number);
  const isCurrent = S.month === localIso(new Date()).slice(0, 7);
  const days = isCurrent ? new Date().getDate() : new Date(y, m, 0).getDate();
  const byCategory = groupSum(s => s.category_id, id => ({ label: catName(id), ...categoryLook(catName(id)) }), household);
  const PERSON_COLORS = ['#3F9B6B', '#E0A43A', '#4C7FD1'];
  const people = groupSum(s => s.created_by_email.toLowerCase(), e => {
    const name = member(e)?.display_name ?? e;
    const i = [...new Set(S.members.map(x => x.display_name))].indexOf(name);
    return { label: name, emoji: name.slice(0, 2), color: PERSON_COLORS[Math.max(i, 0) % PERSON_COLORS.length] };
  }, household);
  return [monthNav(),
    h('div', { class: 'hero' },
      h('div', { class: 'label' }, 'Háztartás · elköltve'),
      h('div', { class: 'big num' }, money(total)),
      h('div', { class: 'facts' },
        h('span', {}, h('b', {}, String(household.length)), ' tétel'),
        h('span', {}, 'napi átlag ', h('b', { class: 'num' }, money(total / days))))),
    h('h2', {}, 'Kategóriánként'), h('div', { class: 'card' }, bars(byCategory)),
    h('h2', {}, 'Ki rögzítette'), h('div', { class: 'card' }, bars(people)),
    potsSection()];
}

function renderImport() {
  const area = h('textarea', { placeholder: 'Másold ide a Messenger üzeneteket, soronként egy költés…', value: S.importText });
  area.oninput = () => { S.importText = area.value; };
  const parse = () => {
    S.importRows = parseChat(S.importText).map(r => ({
      ...r, category_id: suggestCategory(r.description, S.rules), on: r.problems.length === 0,
    })).map(r => ({ ...r, suggested: r.category_id }));
    render();
  };
  const rows = S.importRows.map(r => {
    const desc = h('input', { value: r.description, oninput: e => { r.description = e.target.value; } });
    const amt = h('input', { inputmode: 'decimal', value: amountText(r.amount), oninput: e => { r.amount = parseAmount(e.target.value); } });
    const date = h('input', { type: 'date', value: r.date, oninput: e => { r.date = e.target.value; } });
    const cat = categorySelect(r.category_id);
    cat.onchange = () => { r.category_id = toId(cat.value); };
    return h('div', { class: 'import-row' },
      h('input', { type: 'checkbox', checked: r.on, onchange: e => { r.on = e.target.checked; } }), desc, amt,
      h('div', { class: 'sub' }, h('div', {}, date, dateHint(date)), cat),
      h('div', { class: 'src' }, r.line, r.problems.length ? h('span', { class: 'warn' }, ` — ${r.problems.join(', ')}`) : null));
  });
  const doImport = async () => {
    const chosen = S.importRows.filter(r => r.on);
    const bad = chosen.filter(r => !r.amount || r.amount <= 0 || !r.description.trim() || !r.date);
    if (bad.length) { toast(`${bad.length} bejelölt sor hiányos — javítsd vagy vedd ki a pipát`); return; }
    if (!chosen.length) { toast('Nincs bejelölt sor'); return; }
    const { error } = await sb.from('spendings').insert(chosen.map(r => ({
      description: r.description.trim(), amount: r.amount, spent_on: r.date, category_id: r.category_id,
    })));
    if (error) { logError("db write", error); toast(error.message); return; }
    // Categories picked or corrected during import teach the rules, same as the quick entry does.
    for (const r of chosen) await learn(r.description, r.category_id, r.suggested);
    toast(`${chosen.length} költés importálva`);
    S.importText = ''; S.importRows = [];
    await loadMonth();
    render();
  };
  return [h('div', { class: 'card' },
      h('p', { class: 'muted', style: 'margin-top:0' },
        'Egy sor = egy költés, pl. „kenyer 10,88 lei - Okt 10”. A dátum nélküli sor az előző sor dátumát kapja. Mentés előtt minden ellenőrizhető.'),
      area, h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'primary', onclick: parse }, 'Feldolgozás'))),
    S.importRows.length ? h('div', { class: 'card', style: 'margin-top:12px' },
      h('div', { class: 'row' },
        h('span', { class: 'grow muted' }, `${S.importRows.filter(r => r.on).length} / ${S.importRows.length} sor bejelölve`),
        h('button', { class: 'primary', onclick: doImport }, 'Importálás')),
      rows) : null];
}

function openEdit(s) {
  const desc = h('input', { value: s.description });
  const amt = h('input', { inputmode: 'decimal', value: amountText(s.amount) });
  const date = h('input', { type: 'date', value: s.spent_on });
  const cat = categorySelect(s.category_id);
  const save = async () => {
    const amount = parseAmount(amt.value);
    if (!amount || amount <= 0 || !desc.value.trim()) { toast('Leírás és összeg kell'); return; }
    const category_id = toId(cat.value);
    const { error } = await sb.from('spendings')
      .update({ description: desc.value.trim(), amount, spent_on: date.value, category_id }).eq('id', s.id);
    if (error) { logError("db write", error); toast(error.message); return; }
    await learn(desc.value, category_id, s.category_id);
    dlg.close(); await loadMonth(); render();
  };
  const remove = async () => {
    if (!confirm(`Törlöd: ${s.description} — ${money(s.amount)}?`)) return;
    const { error } = await sb.from('spendings').delete().eq('id', s.id);
    if (error) { logError("db write", error); toast(error.message); return; }
    dlg.close(); await loadMonth(); render();
  };
  dlg.replaceChildren(
    h('h1', {}, 'Szerkesztés'),
    h('label', {}, 'Leírás'), desc,
    h('div', { class: 'fields' },
      h('div', {}, h('label', {}, 'Összeg (lei)'), amt),
      h('div', {}, h('label', {}, 'Dátum'), date, dateHint(date)),
      h('div', { class: 'full' }, h('label', {}, 'Kategória'), cat)),
    h('p', { class: 'muted' }, `Rögzítette: ${member(s.created_by_email)?.display_name ?? s.created_by_email}`),
    catKind(s.category_id) === 'receivable' ? h('div', { class: 'receivable-box' },
      s.returned_on
        ? [h('span', { class: 'grow' }, `✅ Visszakapva: ${longDate(s.returned_on)}`),
           h('button', { class: 'ghost small', onclick: async () => { if (await setReturned(s, false)) dlg.close(); } }, 'Mégsem')]
        : [h('span', { class: 'grow' }, '↩️ Ez a pénz még visszajár.'),
           h('button', { class: 'primary small', onclick: async () => { if (await setReturned(s, true)) dlg.close(); } }, 'Visszakaptam')])
      : null,
    h('div', { class: 'row' },
      h('button', { class: 'danger', onclick: remove }, 'Törlés'),
      h('span', { class: 'grow' }),
      h('button', { onclick: () => dlg.close() }, 'Mégse'),
      h('button', { class: 'primary', onclick: save }, 'Mentés')));
  dlg.showModal();
}

// ---------- boot ----------
async function start() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return renderLogin();
  S.user = session.user;
  initLogging(sb);
  registerWorker();
  S.pushOn = !!(await currentSubscription().catch(() => null));
  try {
    await loadRefs();
    if (!member(S.user.email)) {
      notice(h('p', {}, `A(z) ${S.user.email} cím nincs az engedélyezett listán.`),
        h('p', { class: 'muted' }, 'Add hozzá az allowed_emails táblához a Supabase-ben.'),
        h('button', { class: 'ghost', onclick: logout }, 'Kilépés'));
      return;
    }
    await loadMonth();
    render();
  } catch (e) {
    logError('start', e);
    notice(h('p', { class: 'warn' }, `Hiba: ${e.message ?? e}`));
  }
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) renderSetup();
else { sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); start(); }
