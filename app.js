import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { parseEntry, parseChat, parseAmount, suggestCategory, ruleKeyword, localIso } from './parse.js';

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
const amountText = n => (n == null ? '' : String(n).replace('.', ','));
const catName = id => S.categories.find(c => c.id === id)?.name ?? 'Nincs kategória';
const member = email => S.members.find(m => m.email.toLowerCase() === (email ?? '').toLowerCase());
const initial = email => (member(email)?.display_name ?? email ?? '?').slice(0, 2);
const toId = v => (v === '' || v == null ? null : Number(v));

function toast(msg) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2200);
}

function categorySelect(value) {
  return h('select', {},
    h('option', { value: '' }, '— kategória —'),
    S.categories.map(c => h('option', { value: c.id, selected: c.id === value }, c.name)));
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
    sb.from('categories').select('id,name').order('sort').order('name'),
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
  app.replaceChildren(h('h1', {}, 'Spóra'), h('div', { class: 'card' },
    h('p', {}, 'Még nincs beállítva a Supabase kapcsolat.'),
    h('p', { class: 'muted' }, 'Írd be a config.js fájlba a SUPABASE_URL és SUPABASE_ANON_KEY értékeket (lásd README.md).')));
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
  app.replaceChildren(h('h1', {}, 'Spóra'), h('div', { class: 'card' },
    h('label', {}, 'Email'), email, h('label', {}, 'Jelszó'), pass,
    h('div', { class: 'row', style: 'margin-top:12px' },
      h('button', { class: 'primary grow', onclick: () => go(false) }, 'Belépés'),
      h('button', { onclick: () => go(true) }, 'Első regisztráció')),
    msg));
}

function render() {
  const body = { log: renderLog, month: renderMonth, import: renderImport }[S.tab]();
  const tab = (id, label) => h('button', { class: S.tab === id ? 'on' : '', onclick: () => { S.tab = id; render(); } }, label);
  app.replaceChildren(
    h('div', { class: 'row' }, h('h1', { class: 'grow' }, 'Spóra'),
      h('button', { class: 'link', onclick: async () => { await sb.auth.signOut(); renderLogin(); } }, 'Kilépés')),
    ...body.flat(Infinity).filter(c => c != null && c !== false),
    h('nav', { class: 'tabs' }, tab('log', 'Napló'), tab('month', 'Hónap'), tab('import', 'Import')));
  if (S.tab === 'log') document.getElementById('quick')?.focus({ preventScroll: true });
}

function monthNav() {
  const [y, m] = S.month.split('-').map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long' });
  const isCurrent = S.month === localIso(new Date()).slice(0, 7);
  return h('div', { class: 'month-nav' },
    h('button', { class: 'link', onclick: () => shiftMonth(-1) }, '‹ előző'),
    h('strong', {}, label),
    h('button', { class: 'link', disabled: isCurrent, onclick: () => shiftMonth(1) }, 'következő ›'));
}

function addForm() {
  const d = S.draft;
  const quick = h('input', { id: 'quick', placeholder: 'pl. kenyer 10,88', autocomplete: 'off', enterkeyhint: 'done', value: d.text });
  const amount = h('input', { inputmode: 'decimal', placeholder: '0,00' });
  const date = h('input', { type: 'date' });
  const cat = categorySelect(null);
  const save = h('button', { class: 'primary' }, 'Mentés');
  let parsed = { description: '', amount: null, date: null }, suggested = null;

  const sync = () => {
    parsed = parseEntry(quick.value);
    suggested = suggestCategory(parsed.description, S.rules);
    amount.value = d.amount ?? amountText(parsed.amount);
    date.value = d.date ?? parsed.date ?? localIso(new Date());
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
    if (error) { toast(error.message); save.disabled = false; return; }
    await learn(description, category_id, suggested);
    S.draft = newDraft();
    toast(`Mentve: ${description} — ${money(value)}`);
    if (!date.value.startsWith(S.month)) S.month = date.value.slice(0, 7);
    await loadMonth();
    render();
  };
  sync();

  return h('div', { class: 'card' }, quick,
    h('div', { class: 'fields' },
      h('div', {}, h('label', {}, 'Összeg (lei)'), amount),
      h('div', {}, h('label', {}, 'Dátum'), date),
      h('div', { class: 'full' }, h('label', {}, 'Kategória'), cat),
      h('div', { class: 'full' }, save)));
}

function spendingItem(s) {
  return h('button', { class: 'item', onclick: () => openEdit(s) },
    h('span', { class: 'who', title: member(s.created_by_email)?.display_name ?? '' }, initial(s.created_by_email)),
    h('span', { class: 'desc' }, s.description),
    h('span', { class: 'chip' }, catName(s.category_id)),
    h('span', { class: 'amt' }, money(s.amount)));
}

function renderLog() {
  const days = new Map();
  for (const s of S.spendings) (days.get(s.spent_on) ?? days.set(s.spent_on, []).get(s.spent_on)).push(s);
  const total = S.spendings.reduce((a, s) => a + Number(s.amount), 0);
  const list = [...days].map(([day, items]) => [
    h('div', { class: 'day' },
      h('span', {}, new Date(day + 'T00:00').toLocaleDateString('hu-HU', { month: 'short', day: 'numeric', weekday: 'long' })),
      h('span', {}, money(items.reduce((a, s) => a + Number(s.amount), 0)))),
    items.map(spendingItem),
  ]);
  return [addForm(), monthNav(), h('div', { class: 'muted' }, `Összesen: ${money(total)}`),
    list.length ? list : h('p', { class: 'muted' }, 'Ebben a hónapban még nincs költés.')];
}

function bars(groups) {
  const max = Math.max(...groups.map(g => g.sum), 1);
  return groups.map(g => h('div', { class: 'bar-row' },
    h('div', { class: 'row' }, h('span', {}, g.label), h('span', { class: 'amt' }, money(g.sum))),
    h('div', { class: 'bar' }, h('span', { style: `width:${(g.sum / max * 100).toFixed(1)}%` }))));
}

function groupSum(key, label) {
  const m = new Map();
  for (const s of S.spendings) m.set(key(s), (m.get(key(s)) ?? 0) + Number(s.amount));
  return [...m].map(([k, sum]) => ({ label: label(k), sum })).sort((a, b) => b.sum - a.sum);
}

function renderMonth() {
  const total = S.spendings.reduce((a, s) => a + Number(s.amount), 0);
  if (!S.spendings.length) return [monthNav(), h('p', { class: 'muted' }, 'Ebben a hónapban még nincs költés.')];
  return [monthNav(),
    h('div', { class: 'card' },
      h('div', { class: 'muted' }, `Összes költés · ${S.spendings.length} tétel`),
      h('div', { class: 'total' }, money(total)),
      h('h2', {}, 'Kategóriánként'), bars(groupSum(s => s.category_id, catName)),
      h('h2', {}, 'Ki rögzítette'), bars(groupSum(s => s.created_by_email.toLowerCase(), e => member(e)?.display_name ?? e)))];
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
      h('div', { class: 'sub' }, date, cat),
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
    if (error) { toast(error.message); return; }
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
    if (error) { toast(error.message); return; }
    await learn(desc.value, category_id, s.category_id);
    dlg.close(); await loadMonth(); render();
  };
  const remove = async () => {
    if (!confirm(`Törlöd: ${s.description} — ${money(s.amount)}?`)) return;
    const { error } = await sb.from('spendings').delete().eq('id', s.id);
    if (error) { toast(error.message); return; }
    dlg.close(); await loadMonth(); render();
  };
  dlg.replaceChildren(
    h('h1', {}, 'Szerkesztés'),
    h('label', {}, 'Leírás'), desc,
    h('div', { class: 'fields' },
      h('div', {}, h('label', {}, 'Összeg (lei)'), amt),
      h('div', {}, h('label', {}, 'Dátum'), date),
      h('div', { class: 'full' }, h('label', {}, 'Kategória'), cat)),
    h('p', { class: 'muted' }, `Rögzítette: ${member(s.created_by_email)?.display_name ?? s.created_by_email}`),
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
  try {
    await loadRefs();
    if (!member(S.user.email)) {
      app.replaceChildren(h('h1', {}, 'Spóra'), h('div', { class: 'card' },
        h('p', {}, `A(z) ${S.user.email} cím nincs az engedélyezett listán.`),
        h('p', { class: 'muted' }, 'Add hozzá az allowed_emails táblához a Supabase-ben.'),
        h('button', { onclick: async () => { await sb.auth.signOut(); renderLogin(); } }, 'Kilépés')));
      return;
    }
    await loadMonth();
    render();
  } catch (e) {
    app.replaceChildren(h('h1', {}, 'Spóra'), h('div', { class: 'card warn' }, `Hiba: ${e.message ?? e}`));
  }
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) renderSetup();
else { sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); start(); }
