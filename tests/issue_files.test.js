/**
 * @jest-environment node
 *
 * Real files people attached to (or pasted into) GitHub issues, run through
 * the full page the way a user would: set the upload options, load the file,
 * pick the columns in the dropdowns and press "Save YNAB Data".
 *
 * For every file this checks that:
 *  - with the untouched default mapping the Save button is disabled (that
 *    default is what produced the "headers + empty rows" files reported in
 *    #40, #54, #80, #103 and #109);
 *  - once Date, Payee and an amount are chosen, the download has one row per
 *    transaction and every row has a date and an amount.
 *
 * Fixtures live in tests/fixtures/issues/, prefixed with the issue number.
 * #36 had personal details, which were replaced with placeholders.
 *
 * tests/fixtures/au/ holds synthetic files (made-up transactions) in the
 * layouts Australian banks export, as documented by the open-source fpos
 * (github.com/amboar/fpos) and bank2ynab (github.com/bank2ynab/bank2ynab)
 * importers. CommBank, NAB and ANZ export without a header row, so those
 * need "duplicate first row" and are mapped by the first row's values.
 */
const fs = require('fs');
const path = require('path');
const {
  loadPage, click, setValue, uploadFile, selectOption, mappingSelects, decodeDownload,
} = require('./helpers/page');

const FIXTURES = path.join(__dirname, 'fixtures');

// format: 'old' = Date/Payee/Memo/Outflow/Inflow (the default), 'new' = Date/Payee/Memo/Amount.
// map: YNAB column -> label of the source column as shown in the dropdown.
// first: optional exact first output rows as [Date, Payee, Memo, Outflow, Inflow] (or Amount).
const ISSUE_CASES = [
  {
    issue: 1, file: '001-dkb-semicolon-bom.csv', rows: 3, format: 'old',
    map: { Date: 'Buchung', Payee: 'Sender / Empfänger', Memo: 'Verwendungszweck', Outflow: 'Betrag in EUR', Inflow: 'Betrag in EUR' },
  },
  {
    issue: 5, file: '005-hungarian-preamble.csv', rows: 1, format: 'new', startAtRow: 4,
    map: { Date: 'Könyvelési dátum', Payee: 'Ellenoldali számla tulajdonosa', Memo: 'Közlemény', Amount: 'Összeg' },
  },
  {
    issue: 6, file: '006-ynab-amount-format.csv', rows: 1, format: 'new',
    map: { Date: 'Date', Payee: 'Payee', Memo: 'Memo', Amount: 'Amount' },
  },
  {
    issue: 23, file: '023-n26-amount-eur.csv', rows: 2, format: 'old',
    map: { Date: 'Date', Payee: 'Payee', Outflow: 'Amount (EUR)', Inflow: 'Amount (EUR)' },
  },
  {
    issue: 30, file: '030-negative-debit.csv', rows: 3, format: 'old',
    map: { Date: 'Transaction Date', Payee: 'Description', Outflow: 'Debit', Inflow: 'Credit' },
  },
  {
    issue: 36, file: '036-polish-bank.csv', rows: 3, format: 'new',
    map: { Date: 'Data księgowania', Payee: 'Nazwa nadawcy/odbiorcy', Memo: 'Dane dodatkowe', Amount: 'Kwota' },
  },
  {
    issue: 54, file: '054-settlement-date-total.csv', rows: 202, format: 'old',
    map: { Date: 'settlement_date', Payee: 'description', Outflow: 'total', Inflow: 'total' },
  },
  {
    issue: 56, file: '056-text-month-dates.csv', rows: 62, format: 'old',
    map: { Date: 'different_date', Payee: 'description', Outflow: 'total', Inflow: 'total' },
  },
  {
    issue: 61, file: '061-headerless.csv', rows: 4, format: 'new', extraRow: true,
    map: { Date: '09-11-2023', Payee: 'Fakta', Amount: '-326,03' },
  },
  {
    issue: 64, file: '064-starling.csv', rows: 47, format: 'new',
    map: { Date: 'Date', Payee: 'Counter Party', Memo: 'Reference', Amount: 'Amount (GBP)' },
  },
  {
    issue: 99, file: '099-macroman-input-output.csv', rows: 75, format: 'old', encoding: 'macintosh',
    map: { Date: 'Date', Payee: 'Name', Outflow: 'Output', Inflow: 'Input' },
  },
].map((c) => ({ ...c, name: `issue #${c.issue}`, file: `issues/${c.file}` }));

const AU_CASES = [
  {
    name: 'CommBank (no header)', file: 'au/commbank-headerless.csv', rows: 3, format: 'old', extraRow: true,
    map: { Date: '19/11/2026', Payee: 'WOOLWORTHS 1234 NEWCASTLE NS AUS Card xx1234 Value Date: 17/11/2026', Outflow: '-12.50', Inflow: '-12.50' },
    first: [
      ['19/11/2026', 'WOOLWORTHS 1234 NEWCASTLE NS AUS Card xx1234 Value Date: 17/11/2026', '', '12.50', ''],
      ['18/11/2026', 'Salary ACME PTY LTD', '', '', '+1000.00'],
    ],
  },
  {
    // fpos: "At some point Commbank started putting spaces before the sign."
    name: 'CommBank (no header, space before the sign)', file: 'au/commbank-space-before-sign.csv', rows: 3, format: 'old', extraRow: true,
    map: { Date: '19/11/2026', Payee: 'WOOLWORTHS 1234 NEWCASTLE NS AUS Card xx1234', Outflow: '-12.50', Inflow: '-12.50' },
    first: [
      ['19/11/2026', 'WOOLWORTHS 1234 NEWCASTLE NS AUS Card xx1234', '', '12.50', ''],
      ['18/11/2026', 'Salary ACME PTY LTD', '', '', '+1000.00'],
    ],
  },
  {
    name: 'NAB (no header)', file: 'au/nab-headerless.csv', rows: 3, format: 'old', extraRow: true,
    map: { Date: '19 Nov 26', Payee: 'WOOLWORTHS 1234 NEWCASTLE', Memo: 'EFTPOS DEBIT', Outflow: '-12.00', Inflow: '-12.00' },
    first: [
      ['19 Nov 26', 'WOOLWORTHS 1234 NEWCASTLE', 'EFTPOS DEBIT', '12.00', ''],
      ['18 Nov 26', 'INTERNET TRANSFER   Salary', 'TRANSFER CREDIT', '', '+1,500.00'],
      ['17 Nov 26', 'INTERNET TRANSFER   Rent', 'TRANSFER DEBIT', '1,234.56', ''],
    ],
  },
  {
    name: 'ANZ (no header)', file: 'au/anz-headerless.csv', rows: 3, format: 'new', extraRow: true,
    map: { Date: '19/11/2026', Payee: 'WOOLWORTHS 1234 NEWCASTLE', Amount: '-12.50' },
    first: [
      ['19/11/2026', 'WOOLWORTHS 1234 NEWCASTLE', '', '-12.50'],
      ['18/11/2026', 'PAYMENT FROM ACME PTY LTD', '', '1000.00'],
    ],
  },
  {
    name: 'Westpac', file: 'au/westpac.csv', rows: 3, format: 'old',
    map: { Date: 'Date', Payee: 'Narrative', Outflow: 'Debit Amount', Inflow: 'Credit Amount' },
    first: [
      ['19/11/2026', 'EFTPOS PURCHASE WOOLWORTHS 1234 NEWCASTLE', '', '12.50', ''],
      ['18/11/2026', 'DEPOSIT ACME PTY LTD SALARY', '', '', '1000.00'],
    ],
  },
  {
    name: 'St George', file: 'au/stgeorge.csv', rows: 3, format: 'old',
    map: { Date: 'Date', Payee: 'Description', Outflow: 'Debit', Inflow: 'Credit' },
  },
  {
    name: 'Bankwest', file: 'au/bankwest.csv', rows: 2, format: 'old',
    map: { Date: 'Transaction Date', Payee: 'Narration', Outflow: 'Debit', Inflow: 'Credit' },
  },
  {
    name: 'ING (negative debits)', file: 'au/ing.csv', rows: 2, format: 'old',
    map: { Date: 'Date', Payee: 'Description', Outflow: 'Debit', Inflow: 'Credit' },
    first: [
      ['19/11/2026', 'WOOLWORTHS 1234 NEWCASTLE - Visa Purchase - Receipt 123456', '', '12.50', ''],
      ['18/11/2026', 'Salary Deposit - Receipt 654321 ACME PTY LTD', '', '', '1000.00'],
    ],
  },
];

const CASES = [...ISSUE_CASES, ...AU_CASES];

let page;

afterEach(() => {
  if (page) {
    expect(page.errors.map((e) => e.message)).toEqual([]);
    page.close();
    page = null;
  }
});

const saveButton = (p) => Array.from(p.$$('#header_nav .btn')).find((b) => /Save YNAB Data/.test(b.textContent));
const toggleFormat = (p) => Array.from(p.$$('#tool_wrapper .card-header .btn')).find((b) => /Toggle amounts format/.test(b.textContent));

// Minimal CSV reader for the app's own output: every value is quoted, quotes are doubled.
function readOutput(csv) {
  const lines = csv.split('\n').filter(Boolean);
  const parse = (line) => line.slice(1, -1).split('","').map((v) => v.replace(/""/g, '"'));
  const head = parse(lines[0]);
  return lines.slice(1).map((line) => Object.fromEntries(parse(line).map((v, i) => [head[i], v])));
}

describe.each(CASES)('$name ($file)', (c) => {
  test('Save stays disabled with the default mapping, then exports every transaction once mapped', async () => {
    page = await loadPage();

    if (c.encoding) await selectOption(page, page.$('#encoding'), c.encoding);
    if (c.startAtRow) await setValue(page, page.$('#start_row'), String(c.startAtRow));
    if (c.extraRow) await click(page, page.$('#extra_row'));
    // Raw bytes, so non-UTF-8 files are decoded by the app with the chosen encoding.
    await uploadFile(page, fs.readFileSync(path.join(FIXTURES, c.file)), c.file);

    expect(saveButton(page).disabled).toBe(true);
    await click(page, saveButton(page));
    expect(page.downloads).toHaveLength(0);

    if (c.format === 'new') await click(page, toggleFormat(page));
    const selects = mappingSelects(page);
    for (const [col, label] of Object.entries(c.map)) {
      await selectOption(page, selects[col], label);
    }

    expect(saveButton(page).disabled).toBe(false);
    await click(page, saveButton(page));
    expect(page.downloads).toHaveLength(1);

    const rows = readOutput(decodeDownload(page.downloads[0].href));
    expect(rows).toHaveLength(c.rows);
    const amount = (r) => (c.format === 'new' ? r.Amount : r.Outflow || r.Inflow);
    expect(rows.filter((r) => !r.Date || !amount(r))).toEqual([]);
    if (c.first) {
      expect(rows.slice(0, c.first.length).map((r) => Object.values(r))).toEqual(c.first);
    }
  });
});
