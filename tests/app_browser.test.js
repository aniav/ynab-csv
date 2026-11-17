/**
 * @jest-environment node
 *
 * Full-page tests: index.html + the real jQuery, Popper, Bootstrap,
 * PapaParse and AngularJS builds it loads + src/*.js, driven through the DOM.
 * These guard against regressions when upgrading any of those libraries.
 */
const {
  loadPage, fire, makeFile, uploadFile, selectOption,
  previewTable, importedTable, mappingSelects, selectedLabel, decodeDownload,
} = require('./helpers/page');

const OLD_COLS = ['Date', 'Payee', 'Memo', 'Outflow', 'Inflow'];
const NEW_COLS = ['Date', 'Payee', 'Memo', 'Amount'];
const defaultProfile = {
  columnFormat: OLD_COLS,
  chosenColumns: { Date: 'Date', Payee: 'Payee', Memo: 'Memo', Outflow: 'Outflow', Inflow: 'Inflow' },
  chosenEncoding: 'UTF-8',
  chosenDelimiter: 'auto',
  startAtRow: 1,
  extraRow: false,
};

const YNAB_CSV = 'Date,Payee,Memo,Outflow,Inflow\n2024-01-01,Shop,milk,12.50,\n2024-01-02,Employer,,,1000\n';
const BANK_CSV = 'When,Who,Amount\n2024-01-01,Shop,-12.50\n2024-01-02,Employer,1000\n';

let page;

afterEach(() => {
  if (page) {
    expect(page.errors.map((e) => e.message)).toEqual([]);
    page.close();
    page = null;
  }
});

const storedProfiles = () => JSON.parse(page.window.localStorage.getItem('profiles'));

const headerButton = (p, re) => Array.from(p.$$('#tool_wrapper .card-header .btn')).find((b) => re.test(b.textContent));

describe('boot', () => {
  test('bootstraps the app and renders the upload form', async () => {
    page = await loadPage();
    expect(page.$('#upload_wrapper')).not.toBeNull();
    expect(page.$('#tool_wrapper')).toBeNull();
    expect(page.$('#profile')).toBeNull();

    const encoding = page.$('#encoding');
    expect(encoding.options).toHaveLength(41);
    expect(selectedLabel(encoding)).toBe('UTF-8');

    const delimiter = page.$('#delimiter');
    expect(Array.from(delimiter.options).map((o) => o.textContent.trim())).toEqual(['auto', ',', ';', '|']);
    expect(selectedLabel(delimiter)).toBe('auto');

    expect(page.$('#start_row').value).toBe('1');
    expect(page.$('#extra_row').checked).toBe(false);
  });

  test('wraps the content in the dropzone directive (replace + transclude)', async () => {
    page = await loadPage();
    const dz = page.$('.dropzone');
    expect(dz).not.toBeNull();
    expect(dz.querySelector('[ng-transclude] #upload_wrapper')).not.toBeNull();
  });
});

describe('loading a file', () => {
  test('file input shows the preview and imported tables', async () => {
    page = await loadPage();
    await uploadFile(page, YNAB_CSV);

    expect(page.$('#upload_wrapper')).toBeNull();
    expect(previewTable(page)).toEqual({
      head: OLD_COLS,
      rows: [
        ['2024-01-01', 'Shop', 'milk', '12.50', ''],
        ['2024-01-02', 'Employer', '', '', '1000'],
      ],
    });
    expect(importedTable(page)).toEqual({
      head: ['Date', 'Payee', 'Memo', 'Outflow', 'Inflow'],
      rows: [
        ['2024-01-01', 'Shop', 'milk', '12.50', ''],
        ['2024-01-02', 'Employer', '', '', '1000'],
      ],
    });

    const selects = mappingSelects(page);
    OLD_COLS.forEach((col) => expect(selectedLabel(selects[col])).toBe(col));
    expect(Array.from(selects.Date.options).map((o) => o.textContent.trim()))
      .toEqual(['Choose option', 'Date', 'Payee', 'Memo', 'Outflow', 'Inflow']);
  });

  test('preview and imported tables are limited to 10 rows', async () => {
    page = await loadPage();
    let csv = 'Date,Payee,Outflow\n';
    for (let i = 1; i <= 25; i++) csv += `2024-01-${String(i).padStart(2, '0')},P${i},${i}\n`;
    await uploadFile(page, csv);

    expect(previewTable(page).rows).toHaveLength(10);
    expect(importedTable(page).rows).toHaveLength(10);

    page.$$('#header_nav .btn-success')[0].click();
    expect(decodeDownload(page.downloads[0].href).trim().split('\n')).toHaveLength(26);
  });

  test('"Load a different file" returns to the upload form', async () => {
    page = await loadPage();
    await uploadFile(page, YNAB_CSV);
    page.$('#header_nav .btn-info').click();
    await page.waitFor(() => page.$('#upload_wrapper'));
    expect(page.$('#tool_wrapper')).toBeNull();
  });

  test('reads the file using the chosen character encoding', async () => {
    page = await loadPage();
    selectOption(page, page.$('#encoding'), 'windows-1250');
    expect(storedProfiles()['default profile'].chosenEncoding).toBe('windows-1250');

    // "Payee\nŁódź" encoded as windows-1250
    const bytes = new Uint8Array([...Buffer.from('Payee\n'), 0xa3, 0xf3, 0x64, 0x9f, 0x0a]);
    const input = page.$('#file');
    Object.defineProperty(input, 'files', { value: [new page.window.File([bytes], 'x.csv')] });
    fire(page, input, 'change');
    await page.waitFor(() => page.$('#tool_wrapper'));
    expect(importedTable(page).rows).toEqual([['Łódź']]);
  });
});

describe('column mapping', () => {
  test('choosing source columns updates the preview and saves the profile', async () => {
    page = await loadPage();
    await uploadFile(page, BANK_CSV);

    // Nothing matches the default mapping
    expect(previewTable(page).rows).toEqual([[], []].map(() => ['', '', '', '', '']));
    const invert = () => headerButton(page, /Invert flows/);
    expect(invert().classList.contains('ng-hide')).toBe(true);

    const s = mappingSelects(page);
    selectOption(page, s.Date, 'When');
    selectOption(page, s.Payee, 'Who');
    selectOption(page, s.Outflow, 'Amount');
    selectOption(page, s.Inflow, 'Amount');

    expect(previewTable(page).rows).toEqual([
      ['2024-01-01', 'Shop', '', '12.50', ''],
      ['2024-01-02', 'Employer', '', '', '1000'],
    ]);
    expect(storedProfiles()['default profile'].chosenColumns).toEqual({
      Date: 'When', Payee: 'Who', Memo: 'Memo', Outflow: 'Amount', Inflow: 'Amount',
    });

    // Same source for in/outflow -> "Invert flows" becomes available
    expect(invert().classList.contains('ng-hide')).toBe(false);
    invert().click();
    expect(previewTable(page).rows).toEqual([
      ['2024-01-01', 'Shop', '', '', '12.50'],
      ['2024-01-02', 'Employer', '', '1000', ''],
    ]);

    // "Choose option" clears a mapping
    selectOption(page, s.Payee, 'Choose option');
    expect(previewTable(page).rows.map((r) => r[1])).toEqual(['', '']);
  });

  test('toggling amounts format switches to a single Amount column', async () => {
    page = await loadPage();
    await uploadFile(page, BANK_CSV);
    const toggle = headerButton(page, /Toggle amounts format/);

    toggle.click();
    expect(previewTable(page).head).toEqual(NEW_COLS);
    expect(storedProfiles()['default profile'].columnFormat).toEqual(NEW_COLS);

    const s = mappingSelects(page);
    selectOption(page, s.Date, 'When');
    selectOption(page, s.Amount, 'Amount');
    expect(previewTable(page).rows).toEqual([
      ['2024-01-01', '', '', '-12.50'],
      ['2024-01-02', '', '', '1000'],
    ]);

    page.$('#header_nav .btn-success').click();
    expect(decodeDownload(page.downloads[0].href)).toBe(
      '"Date","Payee","Memo","Amount"\n"2024-01-01","","","-12.50"\n"2024-01-02","","","1000"\n'
    );

    toggle.click();
    expect(previewTable(page).head).toEqual(OLD_COLS);
  });
});

describe('date normalization', () => {
  const VENMO_CSV = 'Date,Payee,Amount\n2020-11-30T17:07:16,Friend,-5\n2020-12-01,Other,7\n';

  test('toggle strips the time part from ISO timestamps and is saved in the profile', async () => {
    page = await loadPage();
    await uploadFile(page, VENMO_CSV);
    const dates = () => previewTable(page).rows.map((r) => r[0]);

    expect(dates()).toEqual(['2020-11-30T17:07:16', '2020-12-01']);

    headerButton(page, /Toggle date normalization/).click();
    expect(dates()).toEqual(['2020-11-30', '2020-12-01']);
    expect(storedProfiles()['default profile'].normalizeDate).toBe(true);

    page.$('#header_nav .btn-success').click();
    expect(decodeDownload(page.downloads[0].href).split('\n')[1]).toMatch(/^"2020-11-30","Friend"/);

    headerButton(page, /Toggle date normalization/).click();
    expect(dates()).toEqual(['2020-11-30T17:07:16', '2020-12-01']);
    expect(storedProfiles()['default profile'].normalizeDate).toBe(false);
  });

  test('saved profile setting is applied on load', async () => {
    page = await loadPage({
      localStorage: { profiles: { 'default profile': { ...defaultProfile, normalizeDate: true } } },
    });
    await uploadFile(page, VENMO_CSV);
    expect(previewTable(page).rows[0][0]).toBe('2020-11-30');
  });
});

describe('download', () => {
  test('downloads the converted CSV as a UTF-8 data URL', async () => {
    page = await loadPage();
    await uploadFile(page, 'Date,Payee,Memo,Outflow,Inflow\n2024-01-01,"Łódź ""Café""",ñ 日本,12.50,\n');
    page.$('#header_nav .btn-success').click();

    expect(page.downloads).toHaveLength(1);
    expect(page.downloads[0].download).toMatch(/^ynab_data_\d{8}\.csv$/);
    expect(page.downloads[0].href).toMatch(/^data:attachment\/csv;base64,/);
    expect(decodeDownload(page.downloads[0].href)).toBe(
      '"Date","Payee","Memo","Outflow","Inflow"\n"2024-01-01","Łódź ""Café""","ñ 日本","12.50",""\n'
    );
  });
});

describe('input file config dropdown', () => {
  test('opens via Bootstrap and stays open while interacting with selects', async () => {
    page = await loadPage();
    const toggle = page.$('[data-toggle="dropdown"]');
    const menu = page.$('.dropdown-menu');

    expect(menu.classList.contains('show')).toBe(false);
    toggle.click();
    expect(menu.classList.contains('show')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    page.$('#encoding').click();
    page.$('#delimiter').click();
    expect(menu.classList.contains('show')).toBe(true);

    page.document.body.click();
    expect(menu.classList.contains('show')).toBe(false);
  });

  test('delimiter, start row and extra row settings are saved and used', async () => {
    page = await loadPage();
    selectOption(page, page.$('#delimiter'), ';');

    const startRow = page.$('#start_row');
    startRow.value = '2';
    fire(page, startRow, 'input');
    page.$('#extra_row').click();

    expect(storedProfiles()['default profile']).toMatchObject({
      chosenDelimiter: ';', startAtRow: 2, extraRow: true,
    });

    await uploadFile(page, 'Bank export, account 1\n2024-01-01;Shop, Inc;-1\n2024-01-02;Other;2\n');
    expect(importedTable(page)).toEqual({
      head: ['2024-01-01', 'Shop, Inc', '-1'],
      rows: [['2024-01-01', 'Shop, Inc', '-1'], ['2024-01-02', 'Other', '2']],
    });
  });
});

describe('saved profiles', () => {
  const bankProfile = {
    columnFormat: NEW_COLS,
    chosenColumns: { Date: 'Booking date', Payee: 'Counterparty', Amount: 'Value' },
    chosenEncoding: 'UTF-8',
    chosenDelimiter: ';',
    startAtRow: 2,
    extraRow: false,
  };
  const storage = { profiles: { 'default profile': defaultProfile, 'my bank': bankProfile } };

  test('?profile= in the URL selects a saved profile', async () => {
    page = await loadPage({ url: 'http://localhost/?profile=My%20Bank', localStorage: storage });

    expect(selectedLabel(page.$('#profile'))).toBe('my bank');
    expect(selectedLabel(page.$('#delimiter'))).toBe(';');
    expect(page.$('#start_row').value).toBe('2');

    await uploadFile(page, 'Account 1\nBooking date;Counterparty;Value\n2024-01-01;Shop;-1\n');
    expect(previewTable(page)).toEqual({ head: NEW_COLS, rows: [['2024-01-01', 'Shop', '', '-1']] });
  });

  test('profile stored in localStorage is used when the URL has none', async () => {
    page = await loadPage({ localStorage: { ...storage, profileName: 'my bank' } });
    expect(selectedLabel(page.$('#profile'))).toBe('my bank');
  });

  test('choosing a profile updates the URL and remembers it', async () => {
    page = await loadPage({ url: 'http://localhost/?profile=my%20bank', localStorage: storage });
    selectOption(page, page.$('#profile'), 'default profile');
    await page.waitFor(() => /profile=default(%20|\+)profile/.test(page.window.location.search));
    expect(page.window.localStorage.getItem('profileName')).toBe('default profile');
  });
});

describe('drag & drop and paste', () => {
  test('drag events toggle the "dragging" class', async () => {
    page = await loadPage();
    const dz = page.$('.dropzone');
    const dataTransfer = { effectAllowed: 'all', dropEffect: 'none' };

    fire(page, dz, 'dragenter');
    expect(dz.classList.contains('dragging')).toBe(true);
    const over = fire(page, dz, 'dragover', { dataTransfer });
    expect(over.defaultPrevented).toBe(true);
    expect(dataTransfer.dropEffect).toBe('copy');
    fire(page, dz, 'dragleave');
    expect(dz.classList.contains('dragging')).toBe(false);
  });

  test('dropping a file loads it', async () => {
    page = await loadPage();
    const dz = page.$('.dropzone');
    fire(page, dz, 'dragenter');
    fire(page, dz, 'drop', { dataTransfer: { files: [makeFile(page, YNAB_CSV)] } });
    await page.waitFor(() => page.$('#tool_wrapper'));
    expect(dz.classList.contains('dragging')).toBe(false);
    expect(previewTable(page).rows[0]).toEqual(['2024-01-01', 'Shop', 'milk', '12.50', '']);
  });

  test('pasting CSV text loads it', async () => {
    page = await loadPage();
    const items = [
      { type: 'text/html', getAsString: () => { throw new Error('wrong item'); } },
      { type: 'text/plain', getAsString: (cb) => cb(YNAB_CSV) },
    ];
    fire(page, page.$('.dropzone'), 'paste', { clipboardData: { items } });
    await page.waitFor(() => page.$('#tool_wrapper'));
    expect(previewTable(page).rows[1]).toEqual(['2024-01-02', 'Employer', '', '', '1000']);
  });
});
