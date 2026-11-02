import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEntry, parseChat, parseAmount, suggestCategory, ruleKeyword, parseReceipt } from './parse.js';

const TODAY = new Date(2026, 9, 14); // 2026-10-14

test('the examples from Messenger', () => {
  assert.deepEqual(parseEntry('kenyer 10,88 lei - Okt 10', TODAY),
    { description: 'kenyer', amount: 10.88, date: '2026-10-10' });
  assert.deepEqual(parseEntry('OMV benzin - 200 Lei - Okt 8', TODAY),
    { description: 'OMV benzin', amount: 200, date: '2026-10-08' });
  assert.deepEqual(parseEntry('Emag alkatrész pompához', TODAY),
    { description: 'Emag alkatrész pompához', amount: null, date: null });
});

test('quick entry without a date', () => {
  assert.deepEqual(parseEntry('kenyer 10,88', TODAY), { description: 'kenyer', amount: 10.88, date: null });
  assert.deepEqual(parseEntry('tej 7.5', TODAY), { description: 'tej', amount: 7.5, date: null });
  assert.deepEqual(parseEntry('25 lei kávé', TODAY), { description: 'kávé', amount: 25, date: null });
});

test('date formats', () => {
  assert.equal(parseEntry('kenyer 10 okt. 3.', TODAY).date, '2026-10-03');
  assert.equal(parseEntry('kenyer 10 3 okt', TODAY).date, '2026-10-03');
  assert.equal(parseEntry('kenyer 10 október 3', TODAY).date, '2026-10-03');
  assert.equal(parseEntry('kenyer 10 márc 3', TODAY).date, '2026-03-03');
  assert.equal(parseEntry('kenyer 10 2026.09.30', TODAY).date, '2026-09-30');
  // A December date seen in October is last year's.
  assert.equal(parseEntry('ajándék 100 dec 20', TODAY).date, '2025-12-20');
});

test('a short word before a number is not a month', () => {
  assert.deepEqual(parseEntry('tej 5 okt 8', TODAY), { description: 'tej', amount: 5, date: '2026-10-08' });
});

test('amount formats', () => {
  assert.equal(parseAmount('10,88'), 10.88);
  assert.equal(parseAmount('1.200,50'), 1200.5);
  assert.equal(parseAmount('1,200.50'), 1200.5);
  assert.equal(parseAmount('1.200'), 1200);
  assert.equal(parseEntry('mosógép 1.200 lei', TODAY).amount, 1200);
  assert.equal(parseEntry('mosógép 1,200 lei', TODAY).amount, 1200);
});

test('a number tagged with lei wins over other numbers', () => {
  assert.deepEqual(parseEntry('2 kenyer 10,88 lei', TODAY), { description: '2 kenyer', amount: 10.88, date: null });
});

test('chat import carries the date down and flags problems', () => {
  const rows = parseChat('kenyer 10,88 - Okt 10\ntej 7,5\n\nEmag alkatrész pompához', TODAY);
  assert.equal(rows.length, 3);
  assert.equal(rows[1].date, '2026-10-10');
  assert.deepEqual(rows[1].problems, []);
  assert.deepEqual(rows[2].problems, ['nincs összeg']);
});

test('chat line before any date gets today and a flag', () => {
  const [row] = parseChat('kenyer 10', TODAY);
  assert.equal(row.date, '2026-10-14');
  assert.deepEqual(row.problems, ['nincs dátum']);
});

test('category suggestion uses the longest matching keyword, accent-insensitive', () => {
  const rules = [{ keyword: 'benzin', category_id: 2 }, { keyword: 'omv', category_id: 2 },
    { keyword: 'kenyer', category_id: 1 }, { keyword: 'alkatresz', category_id: 3 }];
  assert.equal(suggestCategory('OMV benzin', rules), 2);
  assert.equal(suggestCategory('Kenyér', rules), 1);
  assert.equal(suggestCategory('Emag alkatrész pompához', rules), 3);
  assert.equal(suggestCategory('fagyi', rules), null);
  assert.equal(suggestCategory('omlett', [{ keyword: 'mol', category_id: 2 }]), null);
  assert.equal(suggestCategory('kenyerek', rules), 1);
});

test('rule keyword is the first real word', () => {
  assert.equal(ruleKeyword('Kenyér'), 'kenyer');
  assert.equal(ruleKeyword('2 db Túró Rudi'), 'turo');
  assert.equal(ruleKeyword('12'), null);
});

test('day headers from the export script set the date and are not rows', () => {
  const rows = parseChat('2026.10.13\n  140 lej profi\n  OMV - 200 lej - Okt 9\n  250 gyogyszer\n\n2026.10.15\n  20 lej profi', TODAY);
  assert.deepEqual(rows.map(r => [r.description, r.amount, r.date]), [
    ['profi', 140, '2026-10-13'],
    ['OMV', 200, '2026-10-09'],          // its own date wins for itself…
    ['gyogyszer', 250, '2026-10-13'],    // …but does not move the day for the next line
    ['profi', 20, '2026-10-15'],
  ]);
  assert.ok(rows.every(r => r.problems.length === 0));
});

test('Messenger noise lines are flagged, not imported', () => {
  const rows = parseChat('Robert Megu\n10:32\nkenyer 10,88 okt 10', TODAY);
  assert.deepEqual(rows.map(r => r.problems.length > 0), [true, true, false]);
});

// The Mega Image receipt from 2026-11-02, as a phone's "copy text" hands it over.
const MEGA = `MEGA IMAGE SRL
MUNICIPIUL ORADEA, STR. SULFINEI, NR. 1A
JUDETUL BIHOR
Cod Identificare Fiscala: RO6719278
Lei
1,000 Buc x 14,49
SMANTANA 12%GR 850G 14,49 B
1,000 Buc x 7,99
POIANA AMARUIE 80G 7,99 A
REDUCERE POIANA
DISCOUNT 2,00-A
1,000 Buc x 7,99
POIANA EXTRA DARK80G 7,99 A
REDUCERE POIANA
DISCOUNT 2,00-A
0,214 Kg x 51,00
SALAM CASA GASTRO 10,91 B
0,208 Kg x 45,70
CAROLI SUNCA PRES. P 9,51 B
1,000 Buc x 6,55
LA CASA PAINE INTEGR 6,55 B
SUBTOTAL 53,44
TOTAL 53.44
TOTAL TVA 6.19
TVA A 21.00% 2,08
TVA B 11.00% 4.11
CARD 53,44
02/11/2026 16:11:52 Suma:53,44 RON
ID UNIC: 50010761192026110216094002470653
BF. 00653 DATA:02/11/2026 ORA:16-09-40
BON FISCAL`;

test('receipt: store, date, items with their discounts, and the total check', () => {
  const r = parseReceipt(MEGA);
  assert.equal(r.store, 'Mega Image');
  assert.equal(r.date, '2026-11-02');
  assert.equal(r.total, 53.44);
  assert.deepEqual(r.items.map(i => [i.name, i.amount]), [
    ['Smantana 12%gr 850g', 14.49],
    ['Poiana amaruie 80g', 5.99],
    ['Poiana extra dark80g', 5.99],
    ['Salam casa gastro', 10.91],
    ['Caroli sunca pres. p', 9.51],
    ['La casa paine integr', 6.55],
  ]);
  assert.equal(r.items[1].discount, 2);
  assert.equal(r.items[3].qty, 0.214);
  assert.equal(r.sum, 53.44);
  assert.equal(r.matches, true);
});

test('receipt: prices copied apart from the names still come from quantity x unit price', () => {
  // Some phones copy the right-hand price column as a separate block at the end.
  const r = parseReceipt(`PROFI ROM FOOD SRL
1,000 Buc x 3,50
PAINE ALBA
2,000 Buc x 4,25
LAPTE 1,5%
TOTAL
12,00
3,50 B
8,50 B
DATA:15/10/2026`);
  assert.equal(r.store, 'Profi Rom Food');
  assert.equal(r.date, '2026-10-15');
  assert.deepEqual(r.items.map(i => [i.name, i.amount]), [['Paine alba', 3.5], ['Lapte 1,5%', 8.5]]);
  assert.equal(r.total, 12);
  assert.equal(r.matches, true);
});

test('receipt: a missing discount shows up as a total mismatch, not a silent error', () => {
  const r = parseReceipt(MEGA.replace(/DISCOUNT 2,00-A/g, 'DISCOUNT'));
  assert.equal(r.sum, 57.44);
  assert.equal(r.total, 53.44);
  assert.equal(r.matches, false);
});

test('receipt: text that is not a receipt gives no items', () => {
  const r = parseReceipt('Szia! Mikor jössz haza?');
  assert.deepEqual(r.items, []);
  assert.equal(r.total, null);
});
