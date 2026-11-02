// Pure parsing helpers — no DOM, no Supabase. Tested by parse.test.js.

const MONTHS = [
  ['jan'], ['feb'], ['mar', 'már'], ['apr', 'ápr'], ['maj', 'máj', 'may'], ['jun', 'jún'],
  ['jul', 'júl'], ['aug'], ['szep', 'sze', 'sep'], ['okt', 'oct'], ['nov'], ['dec'],
];

export function normalize(text) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function monthIndex(word) {
  const w = normalize(word).replace(/\.$/, '');
  if (w.length < 3) return -1;
  return MONTHS.findIndex(names => names.some(n => w.startsWith(normalize(n))));
}

function isoDate(y, m, d) {
  const date = new Date(Date.UTC(y, m, d));
  if (date.getUTCMonth() !== m || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

// A date without a year is this year, unless that lands in the future — then last year.
function withYear(m, d, today) {
  const y = today.getFullYear();
  const iso = isoDate(y, m, d);
  if (!iso) return null;
  return iso > localIso(today) ? isoDate(y - 1, m, d) : iso;
}

export function localIso(date) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

// "10,88" / "10.88" / "1.200,50" / "1,200.50" / "200" → number
export function parseAmount(raw) {
  let s = raw.replace(/\s/g, '');
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? ',' : '.';
    s = s.replace(dec === ',' ? /\./g : /,/g, '').replace(',', '.');
  } else if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
    // "1.200" / "1,200": RON amounts have 2 decimals, so 3 trailing digits are thousands.
    s = s.replace(/[.,]/g, '');
  } else {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const DATE_PATTERNS = [
  // 2026.10.08 / 2026-10-08 / 2026. 10. 08.
  { re: /\b(\d{4})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})\.?/, toIso: (m) => isoDate(+m[1], +m[2] - 1, +m[3]) },
  // Okt 8 / okt. 8. / október 8
  { re: /\b([a-záéíóöőúüű]{3,}\.?)\s?(\d{1,2})\.?(?!\d|[.,]\d)/i, toIso: (m, t) => {
    const mi = monthIndex(m[1]); return mi < 0 ? null : withYear(mi, +m[2], t);
  } },
  // 8 okt / 8. október
  { re: /\b(\d{1,2})\.?\s([a-záéíóöőúüű]{3,}\.?)/i, toIso: (m, t) => {
    const mi = monthIndex(m[2]); return mi < 0 ? null : withYear(mi, +m[1], t);
  } },
];

function extractDate(text, today) {
  for (const { re, toIso } of DATE_PATTERNS) {
    for (const m of text.matchAll(new RegExp(re.source, 'gi'))) {
      const iso = toIso(m, today);
      if (iso) return { iso, rest: text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length) };
    }
  }
  return { iso: null, rest: text };
}

const AMOUNT_RE = /(\d{1,3}(?:[ .,]\d{3}(?!\d))*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(lei|lejt|lej|ron)?\b\.?/gi;

function extractAmount(text) {
  const matches = [...text.matchAll(AMOUNT_RE)];
  if (!matches.length) return { amount: null, rest: text };
  // Prefer a number tagged with lei/ron; otherwise the last number on the line.
  const pick = matches.find(m => m[2]) ?? matches[matches.length - 1];
  return {
    amount: parseAmount(pick[1]),
    rest: text.slice(0, pick.index) + ' ' + text.slice(pick.index + pick[0].length),
  };
}

function cleanDescription(text) {
  return text
    .replace(/\s[-–—:|]+(?=\s|$)/g, ' ')
    .replace(/^[\s\-–—:|,]+|[\s\-–—:|,]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * "kenyer 10,88 lei - Okt 10" → { description: 'kenyer', amount: 10.88, date: '2026-10-10' }
 * date is null when the text has none; amount is null when no number was found.
 */
export function parseEntry(text, today = new Date()) {
  const { iso, rest } = extractDate(text.trim(), today);
  const { amount, rest: rest2 } = extractAmount(rest);
  return { description: cleanDescription(rest2), amount, date: iso };
}

const DAY_HEADER = /^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\.?$/;

/**
 * Parse a pasted Messenger chat. A line without its own date inherits the last date seen above it.
 * A line that is only a date ("2026.10.07", as written by tools/messenger-export.js) is a day header:
 * it sets the date for the lines below and is not a row itself. Once headers are present, a date
 * written inside a message applies to that message only.
 * Each row carries `problems` — empty means safe to import.
 */
export function parseChat(text, today = new Date()) {
  let lastDate = null, headers = false;
  const rows = [];
  for (const line of text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)) {
    if (DAY_HEADER.test(line)) {
      const d = parseEntry(line, today).date;
      if (d) { lastDate = d; headers = true; continue; }
    }
    const e = parseEntry(line, today);
    const problems = [];
    if (e.date) { if (!headers) lastDate = e.date; }
    else if (lastDate) e.date = lastDate;
    else { e.date = localIso(today); problems.push('nincs dátum'); }
    if (e.amount == null || e.amount <= 0) problems.push('nincs összeg');
    if (!/[a-z]/.test(normalize(e.description))) problems.push('nincs leírás');
    rows.push({ line, ...e, problems });
  }
  return rows;
}

/**
 * Pick a category from learned rules: [{ keyword, category_id }].
 * A rule matches when a word of the description starts with its keyword ("kenyer" matches
 * "kenyerek", "mol" does not match "omlett"); the longest keyword wins.
 */
export function suggestCategory(description, rules) {
  const d = ' ' + normalize(description).replace(/[^a-z0-9]+/g, ' ');
  let best = null;
  for (const r of rules) {
    const k = normalize(r.keyword);
    if (k && d.includes(' ' + k) && (!best || k.length > best.keyword.length)) best = { ...r, keyword: k };
  }
  return best?.category_id ?? null;
}

// The word a correction is remembered under: the first word of 3+ letters.
export function ruleKeyword(description) {
  return normalize(description).split(/[^a-z0-9]+/).find(w => w.length >= 3 && !/^\d+$/.test(w)) ?? null;
}

// ---------- receipts (Romanian "bon fiscal") ----------
// The text comes from the phone's own "copy text from photo" (Google Lens, iPhone Live Text).
// A product is a quantity line ("1,000 Buc x 14,49" / "0,214 Kg x 51,00") followed by its name,
// usually with the line price and VAT letter at the end ("SMANTANA 12%GR 850G 14,49 B").
// The price is recomputed from quantity x unit price, so it survives a phone that copies the
// price column apart from the names. "REDUCERE …" / "DISCOUNT 2,00-A" lower the product above.

const QTY_LINE = /^(\d+(?:[.,]\d{1,3})?)\s*([a-z]{1,4})?\.?\s*[x×*]\s*(\d+[.,]\d{2})\b/i;
const PRICE_TAIL = /\s+(\d{1,5}[.,]\d{2})\s*(-)?\s*([a-g])?\s*$/i;
const ONLY_AMOUNT = /^-?\s*(\d{1,5}[.,]\d{2})\s*-?\s*[a-g]?$/i;
const round2 = n => Math.round(n * 100) / 100;
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

function receiptDate(text) {
  const m = text.match(/data\s*:?\s*(\d{2})[/.-](\d{2})[/.-](\d{4})/i) ?? text.match(/\b(\d{2})[/.-](\d{2})[/.-](\d{4})\b/);
  return m ? isoDate(+m[3], +m[2] - 1, +m[1]) : null;
}

function receiptStore(lines) {
  const first = lines.find(l => (l.match(/[a-z]/gi) ?? []).length >= 3);
  if (!first) return null;
  const name = first.replace(/[\s,]+(s\.?\s?r\.?\s?l\.?|s\.?\s?a\.?)\s*$/i, '').trim().toLowerCase();
  return name.split(/\s+/).map(capitalize).join(' ');
}

/**
 * Parse the copied text of a receipt.
 * → { store, date, total, items: [{ name, qty, unit, amount, discount }], sum, matches }
 * `amount` is what the product cost after its discount; `matches` says the items add up to TOTAL.
 */
export function parseReceipt(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim().replace(/\s{2,}/g, ' ')).filter(Boolean);
  const items = [];
  let pending = null, awaitingDiscount = false, total = null, awaitingTotal = false, inItems = true;

  for (const line of lines) {
    if (awaitingTotal) {
      const m = line.match(ONLY_AMOUNT);
      if (m) { total = parseAmount(m[1]); awaitingTotal = false; continue; }
    }
    if (/^total\b(?!\s*tva)/i.test(line)) {
      inItems = false;
      const m = line.match(/(\d{1,5}[.,]\d{2})\s*$/);
      if (m) total = parseAmount(m[1]); else awaitingTotal = true;
      continue;
    }
    if (/^sub\s*total\b/i.test(line)) { inItems = false; continue; }
    if (!inItems) continue;

    const qty = line.match(QTY_LINE);
    if (qty) { pending = { qty: Number(qty[1].replace(',', '.')), unit: (qty[2] ?? '').toLowerCase(), price: parseAmount(qty[3]) }; continue; }

    const tail = line.match(PRICE_TAIL);
    if (/^(reducere|discount)\b/i.test(line)) {
      const last = items[items.length - 1];
      if (tail && last) { last.discount = round2(last.discount + parseAmount(tail[1])); awaitingDiscount = false; }
      else awaitingDiscount = !!last;
      continue;
    }
    if (ONLY_AMOUNT.test(line)) {
      // A lone discount amount right after "REDUCERE …"; any other lone price belongs to a column
      // the quantity line already covered.
      const last = items[items.length - 1];
      if (awaitingDiscount && last && /-/.test(line)) { last.discount = round2(last.discount + parseAmount(line.match(ONLY_AMOUNT)[1])); }
      awaitingDiscount = false;
      continue;
    }
    if ((line.match(/[a-z]/gi) ?? []).length < 2 || (!pending && !tail)) continue;

    const name = capitalize((tail ? line.slice(0, tail.index) : line).trim().toLowerCase());
    const computed = pending ? round2(pending.qty * pending.price) : null;
    const printed = tail ? parseAmount(tail[1]) : null;
    const price = computed != null && (printed == null || Math.abs(printed - computed) > 0.02) ? computed : printed;
    items.push({ name, qty: pending?.qty ?? 1, unit: pending?.unit ?? '', price, discount: 0 });
    pending = null; awaitingDiscount = false;
  }

  const out = items.map(({ price, ...i }) => ({ ...i, amount: round2(price - i.discount) }));
  const sum = round2(out.reduce((a, i) => a + i.amount, 0));
  return {
    store: out.length ? receiptStore(lines) : null,
    date: receiptDate(text),
    total, items: out, sum,
    matches: total != null && out.length > 0 && Math.abs(sum - total) < 0.01,
  };
}
