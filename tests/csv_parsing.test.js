/**
 * @jest-environment node
 *
 * DataObject running on the real PapaParse build that index.html loads
 * (tests/data_object.test.js mocks Papa; this one doesn't).
 */
const { loadPage } = require('./helpers/page');

let page;
let DataObject;

beforeAll(async () => {
  page = await loadPage({ only: ['papaparse.min.js', 'data_object.js'] });
  DataObject = page.window.DataObject;
});

afterAll(() => page.close());

function parse(csv, ...args) {
  const d = new DataObject();
  d.parseCsv(csv, 'UTF-8', ...args);
  return d;
}

// Results come from the jsdom realm; normalise to plain objects for toEqual.
const plain = (v) => JSON.parse(JSON.stringify(v));

describe('CSV parsing with real PapaParse', () => {
  test('parses a basic comma separated file with headers', () => {
    const d = parse('Date,Payee,Amount\n2024-01-01,Shop,-12.50\n2024-01-02,Salary,1000\n');
    expect(plain(d.fields())).toEqual(['Date', 'Payee', 'Amount']);
    expect(plain(d.rows())).toEqual([
      { Date: '2024-01-01', Payee: 'Shop', Amount: '-12.50' },
      { Date: '2024-01-02', Payee: 'Salary', Amount: '1000' },
    ]);
  });

  test('auto-detects semicolon delimiter', () => {
    const d = parse('Date;Payee;Amount\n01.01.2024;Shop;-12,50\n');
    expect(plain(d.fields())).toEqual(['Date', 'Payee', 'Amount']);
    expect(d.rows()[0].Amount).toBe('-12,50');
  });

  test('auto-detects pipe delimiter', () => {
    const d = parse('Date|Payee|Amount\n2024-01-01|Shop|-1\n');
    expect(plain(d.fields())).toEqual(['Date', 'Payee', 'Amount']);
  });

  test('honours an explicit delimiter', () => {
    const d = parse('a,b;c\n1,2;3\n', 1, false, ';');
    expect(plain(d.fields())).toEqual(['a,b', 'c']);
    expect(d.rows()[0]['a,b']).toBe('1,2');
  });

  test('handles quoted fields with delimiters, quotes and newlines', () => {
    const d = parse('Payee,Memo,Amount\n"Shop, Inc.","He said ""hi""\nsecond line",-5\n');
    expect(plain(d.rows())).toEqual([
      { Payee: 'Shop, Inc.', Memo: 'He said "hi"\nsecond line', Amount: '-5' },
    ]);
  });

  test('handles CRLF line endings', () => {
    const d = parse('Date,Payee,Amount\r\n2024-01-01,Shop,-1\r\n2024-01-02,Other,2\r\n');
    expect(plain(d.fields())).toEqual(['Date', 'Payee', 'Amount']);
    expect(plain(d.rows())).toEqual([
      { Date: '2024-01-01', Payee: 'Shop', Amount: '-1' },
      { Date: '2024-01-02', Payee: 'Other', Amount: '2' },
    ]);
  });

  test('skips empty lines', () => {
    const d = parse('Date,Amount\n\n2024-01-01,1\n\n2024-01-02,2\n\n');
    expect(d.rows()).toHaveLength(2);
  });

  test('preserves non-ASCII characters', () => {
    const d = parse('Payee,Amount\nŁódź Café ñ 日本,-3\n');
    expect(d.rows()[0].Payee).toBe('Łódź Café ñ 日本');
  });

  test('renames empty headers to "Unnamed column"', () => {
    const d = parse('Date,,Amount\n2024-01-01,x,1\n');
    expect(plain(d.fields())).toEqual(['Date', 'Unnamed column', 'Amount']);
    expect(d.rows()[0]['Unnamed column']).toBe('x');
  });

  test('de-duplicates repeated headers with a counter suffix', () => {
    const d = parse('Amount,Amount,Amount,,\n1,2,3,4,5\n');
    expect(plain(d.fields())).toEqual(['Amount', 'Amount (1)', 'Amount (2)', 'Unnamed column', 'Unnamed column (1)']);
    expect(plain(d.rows()[0])).toEqual({
      Amount: '1', 'Amount (1)': '2', 'Amount (2)': '3', 'Unnamed column': '4', 'Unnamed column (1)': '5',
    });
  });

  test('startAtRow skips leading lines before the header', () => {
    const d = parse('Bank export\nAccount 123\nDate,Amount\n2024-01-01,1\n', 3);
    expect(plain(d.fields())).toEqual(['Date', 'Amount']);
    expect(plain(d.rows())).toEqual([{ Date: '2024-01-01', Amount: '1' }]);
  });

  test('extraRow duplicates the first line so it is kept as data', () => {
    const d = parse('2024-01-01,Shop,-1\n2024-01-02,Other,2\n', 1, true);
    expect(plain(d.fields())).toEqual(['2024-01-01', 'Shop', '-1']);
    expect(d.rows()).toHaveLength(2);
    expect(d.rows()[0]['Shop']).toBe('Shop');
  });

  test('rows with missing trailing cells do not break conversion', () => {
    const d = parse('Date,Payee,Amount\n2024-01-01,Shop\n');
    expect(d.rows()[0].Date).toBe('2024-01-01');
    expect(d.rows()[0].Amount).toBeUndefined();
  });

  test('converting before anything was parsed returns empty results instead of throwing', () => {
    const d = new DataObject();
    expect(d.converted_json(null, ['Date'], { Date: 'Date' })).toBeNull();
    expect(d.converted_csv(null, ['Date'], { Date: 'Date' })).toBe('');
  });

  test('end to end: converted_csv with real parsing', () => {
    const d = parse('Date;Payee;Amount\n2024-01-01;"Shop ""A""";-12.50\n2024-01-02;Salary;1000\n');
    const csv = d.converted_csv(null, ['Date', 'Payee', 'Memo', 'Outflow', 'Inflow'], {
      Date: 'Date', Payee: 'Payee', Outflow: 'Amount', Inflow: 'Amount',
    });
    expect(csv).toBe(
      '"Date","Payee","Memo","Outflow","Inflow"\n' +
      '"2024-01-01","Shop ""A""","","12.50",""\n' +
      '"2024-01-02","Salary","","","1000"\n'
    );
  });
});
