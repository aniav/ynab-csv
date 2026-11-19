/**
 * Unit tests for the ynabApp Alpine component (src/app.js), exercised as a
 * plain object with the real DataObject and PapaParse.
 * The full page, rendered by Alpine, is covered by app_browser.test.js.
 */
global.Papa = require('papaparse');
require('../src/data_object.js');
const { ynabApp, defaultProfile, old_ynab_cols, new_ynab_cols } = require('../src/app.js');

const BANK_CSV = 'When,Who,Amount\n2024-01-01,Shop,-12.50\n2024-01-02,Employer,1000\n';

function createApp() {
  const app = ynabApp();
  app.init();
  return app;
}

const stored = () => JSON.parse(localStorage.getItem('profiles'));

// FileReader is async in jsdom; wait for onload to run.
const flush = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('initial state', () => {
  test('uses the default profile', () => {
    const app = createApp();
    expect(app.loaded).toBe(true);
    expect(app.profileName).toBe('default profile');
    expect(app.ynab_cols).toEqual(old_ynab_cols);
    expect(app.ynab_map).toEqual({ Date: 'Date', Payee: 'Payee', Memo: 'Memo', Outflow: 'Outflow', Inflow: 'Inflow' });
    expect(app.file).toMatchObject({ chosenEncoding: 'UTF-8', chosenDelimiter: 'auto', startAtRow: 1, extraRow: false });
    expect(app.file.encodings).toContain('windows-1250');
    expect(app.file.delimiters).toEqual(['auto', ',', ';', '|']);
    expect(app.normalize_date).toBe(false);
    expect(app.data_object.base_json).toBeNull();
    expect(app.preview).toEqual([]);
    expect(app.nonDefaultProfilesExist()).toBe(false);
  });

  test('does not share or mutate the built-in default profile', () => {
    const a = createApp();
    a.toggleColumnFormat();
    a.ynab_map.Date = 'Something';
    const b = createApp();
    localStorage.clear();
    const c = createApp();
    expect(c.ynab_cols).toEqual(old_ynab_cols);
    expect(c.ynab_map.Date).toBe('Date');
    expect(defaultProfile.columnFormat).toEqual(old_ynab_cols);
    expect(b).toBeDefined();
  });

  test('picks the profile from ?profile= (case-insensitive)', () => {
    localStorage.setItem('profiles', JSON.stringify({
      'default profile': defaultProfile,
      'my bank': { ...defaultProfile, chosenDelimiter: ';', startAtRow: 3, extraRow: true, normalizeDate: true },
    }));
    window.history.replaceState(null, '', '/?profile=My%20Bank');
    const app = createApp();
    expect(app.profileName).toBe('my bank');
    expect(app.file).toMatchObject({ chosenDelimiter: ';', startAtRow: 3, extraRow: true });
    expect(app.normalize_date).toBe(true);
    expect(app.nonDefaultProfilesExist()).toBe(true);
  });

  test('falls back to the profile name stored in localStorage', () => {
    localStorage.setItem('profileName', 'Other');
    const app = createApp();
    expect(app.profileName).toBe('other');
    expect(app.profiles.other).toEqual(defaultProfile);
  });

  test('copes with saved profiles missing newer fields', () => {
    localStorage.setItem('profiles', JSON.stringify({ 'default profile': { chosenEncoding: 'UTF-8' } }));
    const app = createApp();
    expect(app.ynab_cols).toEqual(old_ynab_cols);
    expect(app.ynab_map).toEqual({});
    expect(app.file).toMatchObject({ chosenDelimiter: 'auto', startAtRow: 1, extraRow: false });
  });
});

describe('settings and profiles', () => {
  test('settingsChanged copies the input file config into the saved profile', () => {
    const app = createApp();
    Object.assign(app.file, { chosenEncoding: 'windows-1250', chosenDelimiter: ';', startAtRow: 2, extraRow: true });
    app.settingsChanged();
    expect(stored()['default profile']).toMatchObject({
      chosenEncoding: 'windows-1250', chosenDelimiter: ';', startAtRow: 2, extraRow: true,
    });
  });

  test('profileChosen updates the URL, remembers the choice and applies the profile', () => {
    localStorage.setItem('profiles', JSON.stringify({
      'default profile': defaultProfile,
      'my bank': { ...defaultProfile, columnFormat: new_ynab_cols, chosenColumns: { Amount: 'Value' }, chosenDelimiter: '|' },
    }));
    const app = createApp();
    app.profileChosen('my bank');
    expect(new URLSearchParams(window.location.search).get('profile')).toBe('my bank');
    expect(localStorage.getItem('profileName')).toBe('my bank');
    expect(app.ynab_cols).toEqual(new_ynab_cols);
    expect(app.ynab_map).toEqual({ Amount: 'Value' });
    expect(app.file.chosenDelimiter).toBe('|');
  });

  test('saveProfiles persists column mapping changes', () => {
    const app = createApp();
    app.ynab_map.Date = 'When';
    app.saveProfiles();
    expect(stored()['default profile'].chosenColumns.Date).toBe('When');
  });

  test('toggleColumnFormat switches between formats and saves it', () => {
    const app = createApp();
    app.toggleColumnFormat();
    expect(app.ynab_cols).toEqual(new_ynab_cols);
    expect(stored()['default profile'].columnFormat).toEqual(new_ynab_cols);
    app.toggleColumnFormat();
    expect(app.ynab_cols).toEqual(old_ynab_cols);
    expect(stored()['default profile'].columnFormat).toEqual(old_ynab_cols);
  });

  test('toggleColumnFormat works for a profile saved in the new format', () => {
    localStorage.setItem('profiles', JSON.stringify({ 'default profile': { ...defaultProfile, columnFormat: new_ynab_cols } }));
    const app = createApp();
    app.toggleColumnFormat();
    expect(app.ynab_cols).toEqual(old_ynab_cols);
  });

  test('toggleNormalizeDate flips and saves the setting', () => {
    const app = createApp();
    app.toggleNormalizeDate();
    expect(app.normalize_date).toBe(true);
    expect(stored()['default profile'].normalizeDate).toBe(true);
    app.toggleNormalizeDate();
    expect(stored()['default profile'].normalizeDate).toBe(false);
  });
});

describe('loading and converting data', () => {
  test('loadCsv parses with auto-detected delimiter and builds the preview', () => {
    const app = createApp();
    app.loadCsv('Date;Payee;Outflow\n2024-01-01;Shop;5\n');
    expect(app.data_object.fields()).toEqual(['Date', 'Payee', 'Outflow']);
    expect(app.preview).toEqual([{ Date: '2024-01-01', Payee: 'Shop', Outflow: '5' }]);
  });

  test('loadCsv honours delimiter, start row and extra row settings', () => {
    const app = createApp();
    Object.assign(app.file, { chosenDelimiter: ',', startAtRow: 2 });
    app.profile.extraRow = true;
    app.loadCsv('junk;line\n2024-01-01,Shop;Inc,5\n');
    expect(app.data_object.fields()).toEqual(['2024-01-01', 'Shop;Inc', '5']);
    expect(app.data_object.rows()).toHaveLength(1);
  });

  test('loadCsv ignores empty input', () => {
    const app = createApp();
    app.loadCsv('');
    expect(app.data_object.base_json).toBeNull();
  });

  test('preview is limited to 10 rows, csvString includes all', () => {
    const app = createApp();
    let csv = 'Date,Outflow\n';
    for (let i = 0; i < 15; i++) csv += `2024-01-${10 + i},${i}\n`;
    app.loadCsv(csv);
    expect(app.preview).toHaveLength(10);
    expect(app.csvString().trim().split('\n')).toHaveLength(16);
  });

  test('preview reflects mapping, inverted flows and date normalization', () => {
    const app = createApp();
    app.loadCsv('When,Who,Amount\n2020-11-30T17:07:16,Shop,-12.50\n');
    Object.assign(app.ynab_map, { Date: 'When', Payee: 'Who', Outflow: 'Amount', Inflow: 'Amount' });
    expect(app.preview[0]).toEqual({ Date: '2020-11-30T17:07:16', Payee: 'Shop', Outflow: '12.50', Inflow: '' });

    app.invertFlows();
    expect(app.preview[0]).toEqual({ Date: '2020-11-30T17:07:16', Payee: 'Shop', Outflow: '', Inflow: '12.50' });

    app.toggleNormalizeDate();
    expect(app.preview[0].Date).toBe('2020-11-30');
    expect(app.csvString()).toBe('"Date","Payee","Memo","Outflow","Inflow"\n"2020-11-30","Shop","","","12.50"\n');
  });

  test('reloadApp clears loaded data and inverted flows', () => {
    const app = createApp();
    app.loadCsv(BANK_CSV);
    app.invertFlows();
    app.reloadApp();
    expect(app.data_object.base_json).toBeNull();
    expect(app.inverted_outflow).toBe(false);
  });
});

describe('file input, drag & drop and paste', () => {
  test('onFileChange reads the file with the chosen encoding and resets the input', async () => {
    const app = createApp();
    app.file.chosenEncoding = 'windows-1250';
    const spy = jest.spyOn(FileReader.prototype, 'readAsText');
    const target = { files: [new File([BANK_CSV], 'a.csv')], value: 'C:\\fakepath\\a.csv' };

    app.onFileChange({ target });
    expect(spy).toHaveBeenCalledWith(target.files[0], 'windows-1250');
    expect(target.value).toBe('');
    await flush();
    expect(app.data_object.fields()).toEqual(['When', 'Who', 'Amount']);
    spy.mockRestore();
  });

  test('onFileChange without a file does nothing', () => {
    const app = createApp();
    app.onFileChange({ target: { files: [], value: '' } });
    expect(app.data_object.base_json).toBeNull();
  });

  test('onDragOver marks dragging and sets the drop effect', () => {
    const app = createApp();
    const copy = { effectAllowed: 'all' };
    app.onDragOver({ dataTransfer: copy });
    expect(app.dragging).toBe(true);
    expect(copy.dropEffect).toBe('copy');

    const move = { effectAllowed: 'linkMove' };
    app.onDragOver({ dataTransfer: move });
    expect(move.dropEffect).toBe('move');
  });

  test('onDrop reads the dropped file', async () => {
    const app = createApp();
    app.dragging = true;
    app.onDrop({ dataTransfer: { files: [new File([BANK_CSV], 'a.csv')] } });
    expect(app.dragging).toBe(false);
    await flush();
    expect(app.data_object.rows()).toHaveLength(2);
  });

  test('onDrop without files only clears dragging', () => {
    const app = createApp();
    app.dragging = true;
    app.onDrop({ dataTransfer: { files: [] } });
    expect(app.dragging).toBe(false);
    expect(app.data_object.base_json).toBeNull();
  });

  test('onPaste loads the text/plain clipboard item', () => {
    const app = createApp();
    const html = { type: 'text/html', getAsString: jest.fn() };
    app.onPaste({ clipboardData: { items: [html, { type: 'text/plain', getAsString: (cb) => cb(BANK_CSV) }] } });
    expect(html.getAsString).not.toHaveBeenCalled();
    expect(app.data_object.rows()).toHaveLength(2);
  });

  test('onPaste ignores non-text clipboard content', () => {
    const app = createApp();
    expect(() => app.onPaste({ clipboardData: { items: [{ type: 'image/png' }] } })).not.toThrow();
    expect(() => app.onPaste({})).not.toThrow();
    expect(app.data_object.base_json).toBeNull();
  });
});

describe('missingColumns / canSave', () => {
  test('nothing can be saved before a file is loaded', () => {
    const app = createApp();
    expect(app.canSave).toBe(false);
  });

  test('default mapping to names the file does not have counts as missing', () => {
    const app = createApp();
    app.loadCsv(BANK_CSV);
    expect(app.missingColumns).toEqual(['Date', 'Payee', 'Outflow or Inflow']);
    expect(app.saveHint).toMatch(/Date, Payee, Outflow or Inflow/);
  });

  test('either Outflow or Inflow is enough in the old format', () => {
    const app = createApp();
    app.loadCsv(BANK_CSV);
    app.ynab_map.Date = 'When';
    app.ynab_map.Payee = 'Who';
    app.ynab_map.Inflow = 'Amount';
    expect(app.missingColumns).toEqual([]);
    expect(app.canSave).toBe(true);
    expect(app.saveHint).toBe('');
  });

  test('Amount is required in the new format; Memo never is', () => {
    const app = createApp();
    app.loadCsv(BANK_CSV);
    app.toggleColumnFormat();
    app.ynab_map.Date = 'When';
    app.ynab_map.Payee = 'Who';
    app.ynab_map.Amount = '';
    expect(app.missingColumns).toEqual(['Amount']);
    app.ynab_map.Amount = 'Amount';
    expect(app.canSave).toBe(true);
  });
});

describe('downloadFile', () => {
  test('downloads a UTF-8 base64 data URL named with today\'s date and cleans up', () => {
    const app = createApp();
    app.loadCsv('Date,Payee,Outflow\n2024-01-01,Łódź,1\n');
    const clicked = [];
    const spy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      clicked.push({ href: this.href, download: this.download, attached: this.isConnected });
    });

    app.downloadFile();

    expect(clicked).toHaveLength(1);
    const { href, download, attached } = clicked[0];
    expect(attached).toBe(true);
    expect(download).toBe(`ynab_data_${new Date().yyyymmdd()}.csv`);
    const csv = Buffer.from(href.replace('data:attachment/csv;base64,', ''), 'base64').toString('utf8');
    expect(csv).toBe('"Date","Payee","Memo","Outflow","Inflow"\n"2024-01-01","Łódź","","1",""\n');
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
    spy.mockRestore();
  });

  test('does nothing until Date, Payee and an amount are mapped', () => {
    const app = createApp();
    app.loadCsv(BANK_CSV);
    const spy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(app.canSave).toBe(false);
    app.downloadFile();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('Date#yyyymmdd zero-pads month and day', () => {
    expect(new Date(2024, 0, 5).yyyymmdd()).toBe('20240105');
    expect(new Date(2024, 10, 25).yyyymmdd()).toBe('20241125');
  });
});
