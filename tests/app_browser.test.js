/**
 * @jest-environment node
 *
 * Full-page tests: index.html + the real third-party builds it loads from
 * the CDN + src/*.js, driven only through the DOM. They don't depend on which
 * UI framework renders the page, so they guard library upgrades and rewrites.
 */
const {
  loadPage, fire, click, setValue, makeFile, uploadFile, selectOption,
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
const saveButton = (p) => Array.from(p.$$('#header_nav .btn')).find((b) => /Save YNAB Data/.test(b.textContent));
const reloadButton = (p) => Array.from(p.$$('#header_nav .btn')).find((b) => /Load a different file/.test(b.textContent));

describe('boot', () => {
  test('renders the upload form', async () => {
    page = await loadPage();
    expect(page.$('#tool_wrapper')).toBeNull();
    expect(page.isVisible(page.$('#profile'))).toBe(false);
    expect(saveButton(page) && page.isVisible(saveButton(page))).toBeFalsy();

    const encoding = page.$('#encoding');
    expect(encoding.options).toHaveLength(41);
    expect(selectedLabel(encoding)).toBe('UTF-8');

    const delimiter = page.$('#delimiter');
    expect(Array.from(delimiter.options).map((o) => o.textContent.trim())).toEqual(['auto', ',', ';', '|']);
    expect(selectedLabel(delimiter)).toBe('auto');

    expect(page.$('#start_row').value).toBe('1');
    expect(page.$('#extra_row').checked).toBe(false);
  });

  test('the dropzone wraps the upload form', async () => {
    page = await loadPage();
    expect(page.$('.dropzone #upload_wrapper')).not.toBeNull();
  });
});

describe('loading a file', () => {
  test('file input shows the preview and imported tables', async () => {
    page = await loadPage();
    await uploadFile(page, YNAB_CSV);

    expect(page.isVisible(page.$('#upload_wrapper'))).toBe(false);
    expect(page.isVisible(saveButton(page))).toBe(true);
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

  test('data cards use the full width, not the 600px upload box', async () => {
    page = await loadPage();
    await uploadFile(page, YNAB_CSV);
    const uploadBox = page.$('#upload_wrapper').parentElement;
    expect(uploadBox.getAttribute('style')).toMatch(/width:\s*600px/);
    page.$$('table').forEach((table) => {
      expect(uploadBox.contains(table)).toBe(false);
      expect(page.$('.dropzone').contains(table)).toBe(true);
    });
  });

  test('preview and imported tables are limited to 10 rows', async () => {
    page = await loadPage();
    let csv = 'Date,Payee,Outflow\n';
    for (let i = 1; i <= 25; i++) csv += `2024-01-${String(i).padStart(2, '0')},P${i},${i}\n`;
    await uploadFile(page, csv);

    expect(previewTable(page).rows).toHaveLength(10);
    expect(importedTable(page).rows).toHaveLength(10);

    await click(page, saveButton(page));
    expect(decodeDownload(page.downloads[0].href).trim().split('\n')).toHaveLength(26);
  });

  test('"Load a different file" returns to the upload form', async () => {
    page = await loadPage();
    await uploadFile(page, YNAB_CSV);
    await click(page, reloadButton(page));
    await page.waitFor(() => page.isVisible(page.$('#upload_wrapper')));
    expect(page.isVisible(page.$('#tool_wrapper'))).toBe(false);

    // ...and a new file can be loaded afterwards
    await uploadFile(page, BANK_CSV);
    expect(importedTable(page).head).toEqual(['When', 'Who', 'Amount']);
  });

  test('reads the file using the chosen character encoding', async () => {
    page = await loadPage();
    await selectOption(page, page.$('#encoding'), 'windows-1250');
    expect(storedProfiles()['default profile'].chosenEncoding).toBe('windows-1250');

    // "Payee\nŁódź" encoded as windows-1250
    const bytes = new Uint8Array([...Buffer.from('Payee\n'), 0xa3, 0xf3, 0x64, 0x9f, 0x0a]);
    const input = page.$('#file');
    Object.defineProperty(input, 'files', { value: [new page.window.File([bytes], 'x.csv')] });
    fire(page, input, 'change');
    await page.waitFor(() => page.$('#tool_wrapper') && importedTable(page).rows.length);
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
    expect(page.isVisible(invert())).toBe(false);

    const s = mappingSelects(page);
    await selectOption(page, s.Date, 'When');
    await selectOption(page, s.Payee, 'Who');
    await selectOption(page, s.Outflow, 'Amount');
    await selectOption(page, s.Inflow, 'Amount');

    expect(previewTable(page).rows).toEqual([
      ['2024-01-01', 'Shop', '', '12.50', ''],
      ['2024-01-02', 'Employer', '', '', '1000'],
    ]);
    expect(storedProfiles()['default profile'].chosenColumns).toEqual({
      Date: 'When', Payee: 'Who', Memo: 'Memo', Outflow: 'Amount', Inflow: 'Amount',
    });

    // Same source for in/outflow -> "Invert flows" becomes available
    expect(page.isVisible(invert())).toBe(true);
    await click(page, invert());
    expect(previewTable(page).rows).toEqual([
      ['2024-01-01', 'Shop', '', '', '12.50'],
      ['2024-01-02', 'Employer', '', '1000', ''],
    ]);

    // "Choose option" clears a mapping
    await selectOption(page, s.Payee, 'Choose option');
    expect(previewTable(page).rows.map((r) => r[1])).toEqual(['', '']);
  });

  test('toggling amounts format switches to a single Amount column', async () => {
    page = await loadPage();
    await uploadFile(page, BANK_CSV);
    const toggle = headerButton(page, /Toggle amounts format/);

    await click(page, toggle);
    expect(previewTable(page).head).toEqual(NEW_COLS);
    expect(storedProfiles()['default profile'].columnFormat).toEqual(NEW_COLS);

    const s = mappingSelects(page);
    await selectOption(page, s.Date, 'When');
    await selectOption(page, s.Payee, 'Who');
    await selectOption(page, s.Amount, 'Amount');
    expect(previewTable(page).rows).toEqual([
      ['2024-01-01', 'Shop', '', '-12.50'],
      ['2024-01-02', 'Employer', '', '1000'],
    ]);

    await click(page, saveButton(page));
    expect(decodeDownload(page.downloads[0].href)).toBe(
      '"Date","Payee","Memo","Amount"\n"2024-01-01","Shop","","-12.50"\n"2024-01-02","Employer","","1000"\n'
    );

    await click(page, toggle);
    expect(previewTable(page).head).toEqual(OLD_COLS);
  });
});

describe('toggling amounts format keeps existing mappings', () => {
  test('toggling to Amount and back still shows the mapped values', async () => {
    page = await loadPage();
    await uploadFile(page, YNAB_CSV);
    const expected = [
      ['2024-01-01', 'Shop', 'milk', '12.50', ''],
      ['2024-01-02', 'Employer', '', '', '1000'],
    ];
    expect(previewTable(page).rows).toEqual(expected);
    const toggle = headerButton(page, /Toggle amounts format/);

    await click(page, toggle);
    expect(previewTable(page).rows.map((r) => r.slice(0, 3))).toEqual(expected.map((r) => r.slice(0, 3)));
    await click(page, toggle);

    const s = mappingSelects(page);
    OLD_COLS.forEach((col) => expect(selectedLabel(s[col])).toBe(col));
    expect(storedProfiles()['default profile'].chosenColumns).toEqual({
      Date: 'Date', Payee: 'Payee', Memo: 'Memo', Outflow: 'Outflow', Inflow: 'Inflow',
    });
    expect(previewTable(page).rows).toEqual(expected);
  });

  // Regression: the AngularJS version didn't refresh the preview when toggling,
  // so columns showed a chosen source but empty cells until re-selected.
  test('preview refreshes on every toggle when sources are already chosen', async () => {
    page = await loadPage();
    await uploadFile(page, BANK_CSV);
    const toggle = headerButton(page, /Toggle amounts format/);
    const amounts = () => previewTable(page).rows.map((r) => r.slice(3));

    await selectOption(page, mappingSelects(page).Outflow, 'Amount');
    await selectOption(page, mappingSelects(page).Inflow, 'Amount');
    expect(amounts()).toEqual([['12.50', ''], ['', '1000']]);

    await click(page, toggle);
    expect(amounts()).toEqual([[''], ['']]); // Amount not mapped yet
    await selectOption(page, mappingSelects(page).Amount, 'Amount');
    expect(amounts()).toEqual([['-12.50'], ['1000']]);

    await click(page, toggle);
    expect(selectedLabel(mappingSelects(page).Outflow)).toBe('Amount');
    expect(amounts()).toEqual([['12.50', ''], ['', '1000']]);

    await click(page, toggle);
    expect(selectedLabel(mappingSelects(page).Amount)).toBe('Amount');
    expect(amounts()).toEqual([['-12.50'], ['1000']]);
  });

  test('first toggle after reloading a profile saved in Amount format switches back', async () => {
    page = await loadPage({
      localStorage: {
        profiles: {
          'default profile': {
            ...defaultProfile,
            columnFormat: NEW_COLS,
            chosenColumns: { Date: 'When', Outflow: 'Amount', Inflow: 'Amount', Amount: 'Amount' },
          },
        },
      },
    });
    await uploadFile(page, BANK_CSV);
    expect(previewTable(page).head).toEqual(NEW_COLS);
    await click(page, headerButton(page, /Toggle amounts format/));
    expect(previewTable(page).head).toEqual(OLD_COLS);
    expect(previewTable(page).rows.map((r) => r.slice(3))).toEqual([['12.50', ''], ['', '1000']]);
  });
});

describe('date normalization', () => {
  const VENMO_CSV = 'Date,Payee,Outflow\n2020-11-30T17:07:16,Friend,-5\n2020-12-01,Other,7\n';

  test('toggle strips the time part from ISO timestamps and is saved in the profile', async () => {
    page = await loadPage();
    await uploadFile(page, VENMO_CSV);
    const dates = () => previewTable(page).rows.map((r) => r[0]);

    expect(dates()).toEqual(['2020-11-30T17:07:16', '2020-12-01']);

    await click(page, headerButton(page, /Toggle date normalization/));
    expect(dates()).toEqual(['2020-11-30', '2020-12-01']);
    expect(storedProfiles()['default profile'].normalizeDate).toBe(true);

    await click(page, saveButton(page));
    expect(decodeDownload(page.downloads[0].href).split('\n')[1]).toMatch(/^"2020-11-30","Friend"/);

    await click(page, headerButton(page, /Toggle date normalization/));
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

describe('save button', () => {
  test('is disabled with a hint until Date, Payee and an amount are mapped', async () => {
    page = await loadPage();
    await uploadFile(page, BANK_CSV);
    const hint = () => page.$('#save_wrapper').getAttribute('title');

    expect(saveButton(page).disabled).toBe(true);
    expect(hint()).toMatch(/Date, Payee, Outflow or Inflow/);

    await click(page, saveButton(page));
    expect(page.downloads).toHaveLength(0);

    const s = mappingSelects(page);
    await selectOption(page, s.Date, 'When');
    await selectOption(page, s.Payee, 'Who');
    expect(saveButton(page).disabled).toBe(true);
    expect(hint()).toMatch(/: Outflow or Inflow\./);

    await selectOption(page, s.Outflow, 'Amount');
    expect(saveButton(page).disabled).toBe(false);
    expect(hint()).toBeFalsy();

    await click(page, headerButton(page, /Toggle amounts format/));
    expect(saveButton(page).disabled).toBe(true);
    expect(hint()).toMatch(/: Amount\./);
  });

  test('is enabled right away when the file already uses YNAB column names', async () => {
    page = await loadPage();
    await uploadFile(page, YNAB_CSV);
    expect(saveButton(page).disabled).toBe(false);
  });
});

describe('download', () => {
  test('downloads the converted CSV as a UTF-8 data URL', async () => {
    page = await loadPage();
    await uploadFile(page, 'Date,Payee,Memo,Outflow,Inflow\n2024-01-01,"Łódź ""Café""",ñ 日本,12.50,\n');
    await click(page, saveButton(page));

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
    const toggle = page.$('.dropdown-toggle');
    const menu = page.$('.dropdown-menu');

    expect(menu.classList.contains('show')).toBe(false);
    await click(page, toggle);
    expect(menu.classList.contains('show')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    await click(page, page.$('#encoding'));
    await click(page, page.$('#delimiter'));
    await click(page, page.$('#start_row'));
    expect(menu.classList.contains('show')).toBe(true);

    await click(page, page.document.body);
    expect(menu.classList.contains('show')).toBe(false);
  });

  test('delimiter, start row and extra row settings are saved and used', async () => {
    page = await loadPage();
    await selectOption(page, page.$('#delimiter'), ';');
    await setValue(page, page.$('#start_row'), '2');
    await click(page, page.$('#extra_row'));

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
    await selectOption(page, page.$('#profile'), 'default profile');
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
    await page.settle();
    expect(dz.classList.contains('dragging')).toBe(true);
    const over = fire(page, dz, 'dragover', { dataTransfer });
    expect(over.defaultPrevented).toBe(true);
    expect(dataTransfer.dropEffect).toBe('copy');
    fire(page, dz, 'dragleave');
    await page.settle();
    expect(dz.classList.contains('dragging')).toBe(false);
  });

  test('dropping a file loads it', async () => {
    page = await loadPage();
    const dz = page.$('.dropzone');
    fire(page, dz, 'dragenter');
    fire(page, dz, 'drop', { dataTransfer: { files: [makeFile(page, YNAB_CSV)] } });
    await page.waitFor(() => page.$('#tool_wrapper') && previewTable(page).rows.length);
    await page.settle();
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
    await page.waitFor(() => page.$('#tool_wrapper') && previewTable(page).rows.length);
    expect(previewTable(page).rows[1]).toEqual(['2024-01-02', 'Employer', '', '', '1000']);
  });

  test('pasting something that is not text is ignored', async () => {
    page = await loadPage();
    const items = [{ type: 'image/png', getAsString: () => { throw new Error('wrong item'); } }];
    fire(page, page.$('.dropzone'), 'paste', { clipboardData: { items } });
    await page.settle();
    expect(page.isVisible(page.$('#upload_wrapper'))).toBe(true);
  });
});
