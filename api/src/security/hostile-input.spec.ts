/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { bootApp, Harness, signUp } from '../../test/app-harness';

jest.setTimeout(240_000);

/**
 * Inputs an attacker (or a bug) could send: MongoDB operators where a string is
 * expected, malformed ids, and fields that must never be settable from outside.
 * Nothing may crash (5xx) or leak data of another user.
 */
describe('hostile inputs', () => {
  let h: Harness;
  let a: { token: string; userId: string };
  let b: { token: string; userId: string };
  const aIds: Record<string, string> = {};

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const post = (token: string, path: string, body: unknown) =>
    h
      .http()
      .post(`/api${path}`)
      .set(as(token))
      .send(body as object);
  const patch = (token: string, path: string, body: unknown) =>
    h
      .http()
      .patch(`/api${path}`)
      .set(as(token))
      .send(body as object);

  beforeAll(async () => {
    h = await bootApp();
    a = await signUp(h.http, 'a@example.com');
    b = await signUp(h.http, 'b@example.com');

    const cats = (await h.http().get('/api/categories').set(as(a.token)))
      .body as any[];
    aIds.expenseCat = cats.find((c) => c.type === 'expense')._id;
    aIds.account = (
      await post(a.token, '/accounts', {
        type: 'checking',
        name: 'A cuenta',
        initialBalanceCents: 50000,
      })
    ).body._id;
    aIds.tx = (
      await post(a.token, '/transactions', {
        type: 'expense',
        amountCents: 1000,
        date: '2026-03-10',
        accountId: aIds.account,
        categoryId: aIds.expenseCat,
        note: 'secreto de A',
      })
    ).body._id;
    aIds.budget = (
      await post(a.token, '/budgets', {
        categoryId: aIds.expenseCat,
        month: '2026-03',
        limitCents: 9000,
      })
    ).body._id;
  });

  afterAll(async () => {
    await h.stop();
  });

  const leaksA = (body: unknown) => {
    const text = JSON.stringify(body);
    return [aIds.account, aIds.tx, aIds.budget, 'secreto de A'].filter((x) =>
      text.includes(x),
    );
  };

  const hostileQueries = [
    '/categories?type[$ne]=expense',
    '/categories?type[$regex]=.&includeArchived[]=true',
    '/accounts?includeArchived[$ne]=x',
    '/credit-cards?includeArchived[$ne]=x',
    '/transactions?accountId[$ne]=x',
    '/transactions?categoryId[$gt]=',
    '/transactions?type[$regex]=.',
    '/transactions?from[$gt]=&to[$ne]=x',
    '/transactions?page[$ne]=1&limit[$gt]=0',
    '/transactions?accountId[]=a&accountId[]=b',
    '/budgets?month[$ne]=x',
    '/reports/summary?month[$gt]=',
    '/reports/spending-by-category?from[$ne]=x&to[$ne]=y',
    '/reports/income-vs-expenses?from[$ne]=x&to[$ne]=y',
    '/reports/budget-vs-spent?month[$ne]=x',
    '/reports/card-debt?months[$gt]=0',
    '/subscriptions/upcoming?days[$gt]=1',
    '/installment-purchases?creditCardId[$ne]=x',
    '/installment-purchases/projection?months[$gt]=1&creditCardId[$ne]=x',
  ];

  it.each(hostileQueries)(
    'query %s never crashes and never leaks A',
    async (path) => {
      const res = await h.http().get(`/api${path}`).set(as(b.token));
      expect(res.status).toBeLessThan(500);
      expect(leaksA(res.body)).toEqual([]);
    },
  );

  it.each([
    '/transactions?accountId=not-an-id',
    '/transactions?categoryId=123',
    '/installment-purchases?creditCardId=not-an-id',
    '/installment-purchases/projection?creditCardId=not-an-id',
  ])('a malformed id in the query (%s) is a 400, not a 500', async (path) => {
    const res = await h.http().get(`/api${path}`).set(as(b.token));
    expect(res.status).toBe(400);
  });

  it.each([
    '/accounts/not-an-id',
    '/accounts/%7B%22%24ne%22%3Anull%7D',
    '/transactions/123',
    '/credit-cards/%24where',
    '/budgets/not-an-id',
  ])('malformed id %s is a 4xx, not a 5xx', async (path) => {
    for (const method of ['get', 'patch', 'delete'] as const) {
      const res = await h
        .http()
        [method](`/api${path}`)
        .set(as(b.token))
        .send({});
      expect([400, 404, 405]).toContain(res.status);
    }
  });

  describe('operators in the body', () => {
    it('login with Mongo operators instead of credentials is refused', async () => {
      const res = await h
        .http()
        .post('/api/auth/login')
        .send({ email: { $ne: null }, password: { $ne: null } });
      expect([400, 401]).toContain(res.status);
      expect(res.body.accessToken).toBeUndefined();
    });

    it('login with an operator only as email (valid password) is a 400', async () => {
      const res = await h
        .http()
        .post('/api/auth/login')
        .send({ email: { $ne: null }, password: 'password123' });
      expect(res.status).toBe(400);
      expect(res.body.accessToken).toBeUndefined();
    });

    it('login with an operator only as password (valid email) is a 400', async () => {
      const res = await h
        .http()
        .post('/api/auth/login')
        .send({ email: 'a@example.com', password: { $ne: null } });
      expect(res.status).toBe(400);
    });

    it('register with an operator as email is refused', async () => {
      const res = await h
        .http()
        .post('/api/auth/register')
        .send({ email: { $gt: '' }, password: 'password123', name: 'X' });
      expect(res.status).toBe(400);
    });

    it.each([
      [
        'an operator as accountId',
        {
          type: 'expense',
          amountCents: 100,
          date: '2026-03-10',
          accountId: { $ne: null },
          categoryId: 'x',
        },
      ],
      [
        'an operator as amount',
        { type: 'expense', amountCents: { $gt: 0 }, date: '2026-03-10' },
      ],
      [
        'an array as note',
        { type: 'expense', amountCents: 100, date: '2026-03-10', note: ['a'] },
      ],
    ])('creating a transaction with %s is a 400', async (_name, body) => {
      const res = await post(b.token, '/transactions', body);
      expect(res.status).toBe(400);
    });

    it('copying budgets with operators as months is a 400', async () => {
      const res = await post(b.token, '/budgets/copy', {
        from: { $ne: null },
        to: { $ne: null },
      });
      expect(res.status).toBe(400);
    });

    it('an update with an operator as a value is a 400', async () => {
      const own = await post(b.token, '/accounts', {
        type: 'cash',
        name: 'B cuenta',
      });
      const res = await patch(b.token, `/accounts/${own.body._id}`, {
        name: { $ne: 1 },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('fields that cannot be set from outside', () => {
    it('creating an account ignores userId and balanceCents', async () => {
      const res = await post(b.token, '/accounts', {
        type: 'cash',
        name: 'B mass',
        userId: a.userId,
        balanceCents: 999999,
        isArchived: true,
      });
      expect(res.status).toBe(201);
      expect(res.body.userId).toBe(b.userId);
      expect(res.body.balanceCents).toBe(0);
      expect(res.body.isArchived).toBe(false);
      const aList = await h
        .http()
        .get('/api/accounts?includeArchived=true')
        .set(as(a.token));
      expect(JSON.stringify(aList.body)).not.toContain('B mass');
    });

    it('updating an account cannot move it to another owner or change its balance', async () => {
      const own = await post(b.token, '/accounts', {
        type: 'cash',
        name: 'B patch',
        initialBalanceCents: 100,
      });
      const res = await patch(b.token, `/accounts/${own.body._id}`, {
        name: 'B patched',
        userId: a.userId,
        balanceCents: 777777,
      });
      expect(res.status).toBe(200);
      const after = await h
        .http()
        .get(`/api/accounts/${own.body._id}`)
        .set(as(b.token))
        .expect(200);
      expect(after.body.userId).toBe(b.userId);
      expect(after.body.balanceCents).toBe(100);
      expect(after.body.name).toBe('B patched');
    });

    it('a transaction cannot be created for another user', async () => {
      const bAcc = await post(b.token, '/accounts', {
        type: 'cash',
        name: 'B para tx',
      });
      const bCats = (await h.http().get('/api/categories').set(as(b.token)))
        .body as any[];
      const res = await post(b.token, '/transactions', {
        type: 'expense',
        amountCents: 100,
        date: '2026-03-10',
        accountId: bAcc.body._id,
        categoryId: bCats.find((c) => c.type === 'expense')._id,
        userId: a.userId,
        source: 'subscription',
      });
      expect(res.status).toBe(201);
      expect(res.body.userId).toBe(b.userId);
      expect(res.body.source).toBe('manual');
    });
  });

  it("A's data is untouched after all of that", async () => {
    const acc = await h
      .http()
      .get(`/api/accounts/${aIds.account}`)
      .set(as(a.token))
      .expect(200);
    expect(acc.body.balanceCents).toBe(49000); // 50000 minus the 1000 expense
    expect(acc.body.userId).toBe(a.userId);
    const txs = await h
      .http()
      .get('/api/transactions?limit=100')
      .set(as(a.token))
      .expect(200);
    expect(txs.body.total).toBe(1);
  });
});
