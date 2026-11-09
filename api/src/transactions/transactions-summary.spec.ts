/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import { bootApp, Harness, signUp } from '../../test/app-harness';

jest.setTimeout(240_000);

describe('GET /transactions/summary', () => {
  let h: Harness;
  let a: { token: string; userId: string };
  let b: { token: string; userId: string };
  const ids: Record<string, string> = {};

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const post = async (token: string, path: string, body: object) =>
    (await h.http().post(`/api${path}`).set(auth(token)).send(body).expect(201))
      .body;
  const summary = (token: string, query = '') =>
    h.http().get(`/api/transactions/summary${query}`).set(auth(token));

  beforeAll(async () => {
    h = await bootApp();
    a = await signUp(h.http, 'a@example.com');
    b = await signUp(h.http, 'b@example.com');

    const cats = (await h.http().get('/api/categories').set(auth(a.token)))
      .body as any[];
    ids.exp = cats.find((c) => c.type === 'expense')._id;
    ids.exp2 = cats.filter((c) => c.type === 'expense')[1]._id;
    ids.inc = cats.find((c) => c.type === 'income')._id;
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

    const tx = (body: object) => post(a.token, '/transactions', body);
    await tx({
      type: 'expense',
      amountCents: 1250,
      date: '2026-03-10',
      accountId: ids.acc,
      categoryId: ids.exp,
    });
    await tx({
      type: 'expense',
      amountCents: 750,
      date: '2026-03-31',
      accountId: ids.acc,
      categoryId: ids.exp2,
    });
    await tx({
      type: 'income',
      amountCents: 5000,
      date: '2026-03-12',
      accountId: ids.acc2,
      categoryId: ids.inc,
    });
    await tx({
      type: 'transfer',
      amountCents: 9999,
      date: '2026-03-11',
      accountId: ids.acc,
      toAccountId: ids.acc2,
    });
    await tx({
      type: 'expense',
      amountCents: 400,
      date: '2026-04-01',
      accountId: ids.acc,
      categoryId: ids.exp,
    });
  });

  afterAll(async () => {
    await h.stop();
  });

  it('requires a token', async () => {
    await h.http().get('/api/transactions/summary').expect(401);
  });

  it('adds income and expenses of the range, and ignores transfers', async () => {
    const res = await summary(a.token, '?from=2026-03-01&to=2026-03-31').expect(
      200,
    );
    expect(res.body).toEqual({ incomeCents: 5000, expenseCents: 2000 });
  });

  it('covers everything when no dates are given', async () => {
    const res = await summary(a.token).expect(200);
    expect(res.body).toEqual({ incomeCents: 5000, expenseCents: 2400 });
  });

  it('applies the same filters as the list', async () => {
    const range = 'from=2026-03-01&to=2026-03-31';
    expect(
      (await summary(a.token, `?${range}&categoryId=${ids.exp}`)).body,
    ).toEqual({ incomeCents: 0, expenseCents: 1250 });
    expect((await summary(a.token, `?${range}&type=income`)).body).toEqual({
      incomeCents: 5000,
      expenseCents: 0,
    });
    // acc2 is only in the income and as the transfer destination
    expect(
      (await summary(a.token, `?${range}&accountId=${ids.acc2}`)).body,
    ).toEqual({ incomeCents: 5000, expenseCents: 0 });
  });

  it('is all zeros when only transfers match', async () => {
    const res = await summary(a.token, '?type=transfer').expect(200);
    expect(res.body).toEqual({ incomeCents: 0, expenseCents: 0 });
  });

  it('is all zeros for a user without transactions', async () => {
    const res = await summary(b.token).expect(200);
    expect(res.body).toEqual({ incomeCents: 0, expenseCents: 0 });
  });

  it('rejects a malformed filter like the list does', async () => {
    await summary(a.token, '?from=not-a-date').expect(400);
  });
});
