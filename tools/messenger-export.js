// Spóra — Messenger spending export.
// Paste into the browser console (F12 → Console) while the shared chat is open on messenger.com
// or facebook.com/messages. Read-only: it scrolls the chat and reads text, sends nothing anywhere.
// Result is copied to the clipboard in the format the app's Import tab expects:
//   2026.10.08          ← day marker taken from Messenger's date separators (unticked on import)
//   OMV benzin 200 lei  ← every message line that has both a digit and a letter
(async () => {
  const SINCE = new Date(2026, 9, 1);          // 1 Oct 2026 — change if needed
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // ---- find the chat's scrolling box: the tallest scrollable element inside the main area
  const root = document.querySelector('[role="main"]') ?? document.body;
  const scroller = [...root.querySelectorAll('div')]
    .filter(el => el.scrollHeight > el.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(el).overflowY))
    .sort((a, b) => b.clientHeight - a.clientHeight)[0];
  if (!scroller) return console.error('Nem találom a beszélgetést. Nyisd meg a chatet, és futtasd újra.');

  // ---- Messenger date separators, Hungarian or English
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sze', 'okt', 'nov', 'dec'];
  const MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const WEEKDAYS = [['vasarnap', 'sun', 'sunday', 'v'], ['hetfo', 'mon', 'monday', 'h'], ['kedd', 'tue', 'tuesday', 'k'],
    ['szerda', 'wed', 'wednesday', 'sze'], ['csutortok', 'thu', 'thursday', 'cs'], ['pentek', 'fri', 'friday', 'p'],
    ['szombat', 'sat', 'saturday', 'szo']];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysAgo = n => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
  const monthOf = w => {
    if (w.length < 3) return -1;
    const i = MONTHS.findIndex(x => w.startsWith(x));
    return i >= 0 ? i : MONTHS_EN.findIndex(x => w.startsWith(x));
  };

  // A line is a day header only if the WHOLE line has Messenger's header shape, so a message
  // like "Ma megyek a profiba" or "okt 10 kenyér" is never mistaken for one.
  const TIME = '\\d{1,2}:\\d{2}(?: ?(?:am|pm|de|du))?';
  const RELATIVE = new RegExp(`^([a-z]+)\\.?,? ${TIME}$`);                       // "tegnap 20:10", "hetfo 9:15"
  const ABSOLUTE = new RegExp(`^(?:(20\\d\\d)\\. ?)?([a-z]+)\\.? (\\d{1,2})\\.?,?(?: (20\\d\\d),?)? ${TIME}$`); // "2026. szept. 22. 16:40", "oct 8, 2026, 10:32 am"

  function separatorDate(line) {
    const s = norm(line.trim()).replace(/\s+/g, ' ');
    if (s.length > 40) return null;
    let m = s.match(RELATIVE);
    if (m) {
      if (m[1] === 'ma' || m[1] === 'today') return today;
      if (m[1] === 'tegnap' || m[1] === 'yesterday') return daysAgo(1);
      const w = WEEKDAYS.findIndex(names => names.includes(m[1]));
      return w >= 0 ? daysAgo((today.getDay() - w + 7) % 7 || 7) : null;
    }
    m = s.match(ABSOLUTE);
    if (!m) return null;
    const mi = monthOf(m[2]);
    if (mi < 0) return null;
    const year = m[1] ?? m[4];
    const d = new Date(+(year ?? today.getFullYear()), mi, +m[3]);
    if (!year && d > today) d.setFullYear(d.getFullYear() - 1);   // "dec. 20." seen in October = last year
    return d;
  }

  // Messages live in a role="log" container. Read every text leaf (an element whose children carry
  // no text) in page order: date separators, sender names and message bodies each come out as one entry.
  const area = scroller.querySelector('[role="log"]') ?? scroller.closest('[role="log"]') ?? scroller;
  // Screen-reader copy of each message ("Üzenet elküldve: 13:51-kor, feladó: Te: …") — skip, it duplicates the body.
  const HIDDEN = /üzenet elküldve|feladó:|message sent|sent at \d|^belépés\b|^enter\b/i;
  const rowsNow = () => [...area.querySelectorAll('*')]
    .filter(e => e.textContent.trim() && ![...e.children].some(c => c.textContent.trim()))
    .map(e => e.innerText.trim())
    .filter(t => t && !HIDDEN.test(t));

  // ---- 1. scroll up until we are past SINCE (or the chat start)
  console.log('Felfelé görgetés…');
  let stuck = 0;
  for (let i = 0; i < 400 && stuck < 6; i++) {
    const firstDates = rowsNow().slice(0, 80).flatMap(t => t.split('\n')).map(separatorDate).filter(Boolean);
    if (firstDates.some(d => d < SINCE)) break;
    const before = scroller.scrollHeight;
    scroller.scrollTop = 0;
    await sleep(1200);
    stuck = scroller.scrollHeight === before ? stuck + 1 : 0;
  }

  // ---- 2. walk down, merging snapshots (Messenger may drop rows that are off-screen)
  console.log('Lefelé olvasás…');
  const all = [];
  const merge = snap => {
    for (let k = Math.min(all.length, snap.length); k > 0; k--) {
      if (snap.slice(0, k).every((t, j) => t === all[all.length - k + j])) { all.push(...snap.slice(k)); return; }
    }
    all.push(...snap);
  };
  scroller.scrollTop = 0; await sleep(800);
  for (let i = 0; i < 2000; i++) {
    merge(rowsNow());
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 5) break;
    scroller.scrollTop += scroller.clientHeight * 0.7;
    await sleep(350);
  }

  // ---- 3. keep only lines that look like a spending, grouped under the day they were sent
  // A spending = a number + (a price like "40 lej", or a shop/expense word, or a short "6 placinta" line).
  // Questions, long sentences, truncated reply quotes ("…") and income messages are chat.
  const SHOPS = /\b(profi|lidl|kaufland|penny|carrefour|auchan|mega|kisbolt|piac|hus|omv|petrom|mol|lukoil|rompetrol|benzin|motorina|emag|temu|gyogyszer|patika|farmacia|analizis|orvos|kenyer|tej|persely|rovi|virag|taxi|bolt)/;
  // "6 placinta", "250 gyogyszer": a short line that starts with an amount followed by a word,
  // unless that word is a unit of time/measure ("1 ora 25 perc", "59 mp") or the line names a month.
  // Hungarian suffixes included: "2 hetre", "3 napra", "5 eve", "10 percre".
  const UNIT = /^(kg|gr?|l|liter|mp|km|cm|perc[a-z]*|ora[a-z]{0,3}|het(re|et|ig|en|i)?|nap(ot|ra|ig|ja|ok|i|pal)?|honap[a-z]*|ev(e|et|re|ig|en|i|vel)?|ember[a-z]*)$/;
  const MONTH = /\b(jan|feb|mar[c]?|apr|maj|jun|jul|aug|szept?|okt|nov|dec)\b/;
  const isShortItem = s => {
    const m = s.match(/^(\d+(?:[.,]\d{1,2})?)\s+(\p{L}\S*)/u);
    return m && !UNIT.test(m[2].replace(/[^a-z]/g, '')) &&!MONTH.test(s) && s.split(/\s+/).length <= 6;
  };
  // The amount must sit right next to the currency: "40 lej", "9lej", "Lei: 22", "2€".
  const PRICED = /\d\s*(lej|lei|ron\b|€|eur\b)|\b(lej|lei|ron)\s*:?\s*\d/;
  const INCOME = /\b(fizu|fizet|kaptam|jott meg|megjott|salary|berem|ber\b)/;
  const words = s => s.split(/\s+/).length;
  const isSpending = line => {
    const s = norm(line);
    if (!/\d/.test(s) || s.includes('?') || /…$/.test(line) || /https?:\/\//.test(s) || INCOME.test(s)) return false;
    return (PRICED.test(s) && words(s) <= 14) || (SHOPS.test(s) && words(s) <= 10) || isShortItem(s);
  };
  const days = new Map();   // 'YYYY.MM.DD' → lines, in chat order
  let current = null;
  for (const line of all.flatMap(t => t.split('\n')).map(l => l.trim()).filter(Boolean)) {
    const d = separatorDate(line);
    if (d) { current = d; continue; }
    if (!current || current < SINCE || !isSpending(line)) continue;
    const key = fmt(current), list = days.get(key) ?? days.set(key, []).get(key);
    if (!list.includes(line)) list.push(line);   // quoted replies repeat the original message
  }

  const text = [...days].map(([day, lines]) => [day, ...lines.map(l => '  ' + l)].join('\n')).join('\n\n');
  console.log(text);
  console.log(`${[...days.values()].flat().length} költés-jelölt, ${days.size} nap.`);
  try { copy(text); console.log('Vágólapra másolva → illeszd be a Spóra Import fülére.'); }
  catch { console.log('Másold ki a fenti szöveget kézzel.'); }
})();
