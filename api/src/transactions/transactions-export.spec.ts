/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import { bootApp, Harness, signUp } from '../../test/app-harness';
import { CSV_BOM } from '../common/utils/csv';
import * as service from './transactions.service';

jest.setTimeout(240_000);

const HEADER =
  'fecha,tipo,monto,cuenta,cuenta destino,tarjeta,categoría,subcategoría,nota,origen';

describe('GET /transactions/export', () => {
  let h: Harness;
  let a: { token: string; userId: string };
  let b: { token: string; userId: string };
  const ids: Record<string, string> = {};

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const post = async (token: string, path: string, body: object) =>
    (await h.http().post(`/api${path}`).set(auth(token)).send(body).expect(201))
      .body;
  const exportAs = (token: string, query = '') =>
    h.http().get(`/api/transactions/export${query}`).set(auth(token));
  /** Body without BOM, split in lines (fine while no cell has a line break). */
  const lines = (text: string) =>
    text.slice(CSV_BOM.length).split('\r\n').slice(0, -1);

  beforeAll(async () => {
    h = await bootApp();
    a = await signUp(h.http, 'a@example.com');
    b = await signUp(h.http, 'b@example.com');

    const cats = (await h.http().get('/api/categories').set(auth(a.token)))
      .body as any[];
    const exp = cats.find((c) => c.type === 'expense');
    ids.exp = exp._id;
    ids.inc = cats.find((c) => c.type === 'income')._id;
    const withSub = await post(
      a.token,
      `/categories/${ids.exp}/subcategories`,
      { name: 'Sub uno' },
    );
    ids.sub = withSub.subcategories.at(-1)._id;

    ids.acc = (
      await post(a.token, '/accounts', {
        type: 'checking',
        name: 'Corriente A',
        initialBalanceCents: 100000,
      })
    )._id;
    ids.acc2 = (
      await post(a.token, '/accounts', { type: 'savings', name: 'Ahorro A' })
    )._id;
    ids.old = (
      await post(a.token, '/accounts', { type: 'cash', name: 'Vieja' })
    )._id;
    ids.card = (
      await post(a.token, '/credit-cards', {
        name: 'Visa A',
        limitCents: 500000,
        cutoffDay: 5,
        paymentDay: 20,
      })
    )._id;

    await post(a.token, '/transactions', {
      type: 'expense',
      amountCents: 1250,
      date: '2026-03-10',
      accountId: ids.acc,
      categoryId: ids.exp,
      subcategoryId: ids.sub,
      note: 'cafe',
    });
    await post(a.token, '/transactions', {
      type: 'income',
      amountCents: 5000,
      date: '2026-03-12',
      accountId: ids.acc,
      categoryId: ids.inc,
    });
    await post(a.token, '/transactions', {
      type: 'transfer',
      amountCents: 300,
      date: '2026-03-11',
      accountId: ids.acc,
      toAccountId: ids.acc2,
    });
    await post(a.token, '/transactions', {
      type: 'expense',
      amountCents: 2000,
      date: '2026-03-09',
      creditCardId: ids.card,
      categoryId: ids.exp,
    });
    await post(a.token, '/transactions', {
      type: 'expense',
      amountCents: 100,
      date: '2026-02-01',
      accountId: ids.old,
      categoryId: ids.exp,
      note: '=1+1',
    });
    await post(a.token, '/transactions', {
      type: 'expense',
      amountCents: 100,
      date: '2026-01-01',
      accountId: ids.acc,
      categoryId: ids.exp,
      note: 'hola, "mundo"\nlinea 2',
    });
    await h
      .http()
      .delete(`/api/accounts/${ids.old}`)
      .set(auth(a.token))
      .expect(204);
  });

  afterAll(async () => {
    await h.stop();
  });

  it('requires a token', async () => {
    await h.http().get('/api/transactions/export').expect(401);
  });

  it('answers a CSV attachment named with today', async () => {
    const res = await exportAs(a.token).expect(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="movimientos-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    expect(res.text.startsWith(CSV_BOM + HEADER + '\r\n')).toBe(true);
  });

  it('writes names, signed amounts and translated types', async () => {
    const res = await exportAs(a.token, '?from=2026-03-01&to=2026-03-31');
    expect(lines(res.text)).toEqual([
      HEADER,
      '2026-03-12,ingreso,50.00,Corriente A,,,Ingresos,,,manual'.replace(
        'Ingresos',
        cat(res.text, '2026-03-12'),
      ),
      '2026-03-11,transferencia,3.00,Corriente A,Ahorro A,,,,,manual',
      expect.stringMatching(
        /^2026-03-10,gasto,-12\.50,Corriente A,,,[^,]+,Sub uno,cafe,manual$/,
      ),
      expect.stringMatching(
        /^2026-03-09,gasto,-20\.00,,,Visa A,[^,]+,,,manual$/,
      ),
    ]);
  });

  it('filters like the list does', async () => {
    const onlyIncome = lines((await exportAs(a.token, '?type=income')).text);
    expect(onlyIncome).toHaveLength(2);
    const byAccount = lines(
      (await exportAs(a.token, `?accountId=${ids.acc2}`)).text,
    );
    expect(byAccount).toHaveLength(2); // destination of the transfer
    const byCat = lines(
      (await exportAs(a.token, `?categoryId=${ids.inc}`)).text,
    );
    expect(byCat).toHaveLength(2);
    const range = lines(
      (await exportAs(a.token, '?from=2026-03-11&to=2026-03-11')).text,
    );
    expect(range).toHaveLength(2);
  });

  it('is ordered by date, newest first', async () => {
    const dates = lines((await exportAs(a.token)).text)
      .slice(1)
      .map((l) => l.slice(0, 10));
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('ignores page and limit', async () => {
    const res = await exportAs(a.token, '?page=2&limit=1&from=2026-03-01');
    expect(lines(res.text).length).toBeGreaterThan(2);
  });

  it('keeps the name of an archived account', async () => {
    const res = await exportAs(a.token, '?from=2026-02-01&to=2026-02-28');
    expect(res.text).toContain(',Vieja,');
  });

  it('guards formulas and keeps awkward notes in one cell', async () => {
    const res = await exportAs(a.token);
    expect(res.text).toContain(",'=1+1,");
    expect(res.text).toContain(`,"hola, ""mundo""\nlinea 2",`);
  });

  it('with nothing to export it is only BOM and header', async () => {
    const res = await exportAs(a.token, '?from=2030-01-01').expect(200);
    expect(res.text).toBe(CSV_BOM + HEADER + '\r\n');
  });

  it.each(['?from=abc', '?accountId=x', '?type=nope'])(
    'invalid filter %s is a 400',
    async (q) => {
      await exportAs(a.token, q).expect(400);
    },
  );

  it('never shows another user the data of A', async () => {
    const res = await exportAs(b.token).expect(200);
    expect(res.text).toBe(CSV_BOM + HEADER + '\r\n');
  });

  it('refuses to export more rows than the cap', async () => {
    jest.replaceProperty(service, 'EXPORT_MAX_ROWS', 2);
    try {
      const res = await exportAs(a.token).expect(400);
      expect(res.body.message).toMatch(/filtros/);
    } finally {
      jest.restoreAllMocks();
    }
  });
});

/** Category name of the line starting with `date` (default categories are seeded). */
function cat(text: string, date: string): string {
  const line = text.split('\r\n').find((l) => l.startsWith(date)) ?? '';
  return line.split(',')[6];
}
