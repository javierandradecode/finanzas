import { CSV_BOM, toCsv } from './csv';

const body = (rows: Parameters<typeof toCsv>[0]) =>
  toCsv(rows).slice(CSV_BOM.length);

describe('toCsv', () => {
  it('starts with a BOM and ends every row with CRLF', () => {
    const out = toCsv([['a', 'b'], ['c']]);
    expect(out.startsWith(CSV_BOM)).toBe(true);
    expect(out).toBe(`${CSV_BOM}a,b\r\nc\r\n`);
  });

  it('is only the BOM with no rows', () => {
    expect(toCsv([])).toBe(CSV_BOM);
  });

  it('quotes cells with commas, quotes and line breaks (RFC 4180)', () => {
    expect(body([['a,b']])).toBe('"a,b"\r\n');
    expect(body([['di "hola"']])).toBe('"di ""hola"""\r\n');
    expect(body([['l1\nl2']])).toBe('"l1\nl2"\r\n');
    expect(body([['l1\r\nl2']])).toBe('"l1\r\nl2"\r\n');
  });

  it('writes undefined as an empty cell', () => {
    expect(body([['a', undefined, 'c']])).toBe('a,,c\r\n');
  });

  it('writes numbers with two decimals and never guards them', () => {
    expect(body([[-12.5, 0, 3]])).toBe('-12.50,0.00,3.00\r\n');
  });

  it.each(['=SUM(A1)', '+1', '-1+1', '@x', '\tx', '\rx'])(
    'prefixes a quote to the formula-like text %j',
    (text) => {
      expect(
        body([[text]])
          .replace(/^"/, '')
          .startsWith(`'${text}`),
      ).toBe(true);
    },
  );

  it('guards and quotes when the text also needs quoting', () => {
    expect(body([['=1,2']])).toBe(`"'=1,2"\r\n`);
  });

  it('leaves harmless text alone', () => {
    expect(body([['ok-guion', '3 - 2', 'a=b']])).toBe('ok-guion,3 - 2,a=b\r\n');
  });
});
