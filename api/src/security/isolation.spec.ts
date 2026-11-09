/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
import type { Response } from 'supertest';
import { bootApp, Harness, signUp } from '../../test/app-harness';

jest.setTimeout(240_000);

/**
 * Cross-user isolation over the real application: user A owns data of every
 * kind; user B, with a valid token of their own, tries every route that
 * touches data. Nothing of A's may be readable, changeable or usable by B.
 */

type Ctx = {
  h: Harness;
  a: { token: string; userId: string };
  b: { token: string; userId: string };
  /** A user with no data at all, for the "nothing to see" checks. */
  e: { token: string; userId: string };
  ids: Record<string, string>;
  bIds: Record<string, string>;
};

const REJECTED = [400, 404];

/** Routes that do not touch user data (or are public by design). */
const EXEMPT = new Set([
  'GET /api/health',
  'POST /api/auth/register',
  'POST /api/auth/login',
  'GET /api/auth/me',
]);

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const send = (
  c: Ctx,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  token: string,
  body?: object,
) => {
  const req = c.h.http()[method](`/api${path}`).set(auth(token));
  return body ? req.send(body) : req;
};
const asB = (
  c: Ctx,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  body?: object,
) => send(c, method, path, c.b.token, body);
const asE = (
  c: Ctx,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  body?: object,
) => send(c, method, path, c.e.token, body);
const asA = (
  c: Ctx,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  body?: object,
) => send(c, method, path, c.a.token, body);

const created = async (res: Response | Promise<Response>) => {
  const r = await res;
  expect([200, 201]).toContain(r.status);
  return r.body as Record<string, any>;
};

async function seedUser(c: Pick<Ctx, 'h'>, token: string, tag: string) {
  const mk = (method: 'post', path: string, body: object) =>
    created(c.h.http()[method](`/api${path}`).set(auth(token)).send(body));
  const ids: Record<string, string> = {};

  const acc1 = await mk('post', '/accounts', {
    type: 'checking',
    name: `${tag} cuenta 1`,
    initialBalanceCents: 100000,
  });
  const acc2 = await mk('post', '/accounts', {
    type: 'savings',
    name: `${tag} cuenta 2`,
  });
  ids.account = acc1._id;
  ids.account2 = acc2._id;

  const cats = (
    await c.h.http().get('/api/categories').set(auth(token)).expect(200)
  ).body as any[];
  ids.expenseCat = cats.find((x) => x.type === 'expense')._id;
  ids.incomeCat = cats.find((x) => x.type === 'income')._id;
  const custom = await mk('post', '/categories', {
    type: 'expense',
    name: `${tag} propia`,
    icon: 'tag',
    color: '#112233',
  });
  ids.customCat = custom._id;
  const withSub = await mk(
    'post',
    `/categories/${ids.expenseCat}/subcategories`,
    { name: `${tag} sub` },
  );
  ids.sub = withSub.subcategories[withSub.subcategories.length - 1]._id;

  const card = await mk('post', '/credit-cards', {
    name: `${tag} tarjeta`,
    limitCents: 500000,
    cutoffDay: 5,
    paymentDay: 20,
  });
  ids.card = card._id;

  const base = { date: '2026-03-10', accountId: ids.account };
  ids.txExpense = (
    await mk('post', '/transactions', {
      ...base,
      type: 'expense',
      amountCents: 1000,
      categoryId: ids.expenseCat,
      subcategoryId: ids.sub,
    })
  )._id;
  ids.txCard = (
    await mk('post', '/transactions', {
      date: '2026-03-11',
      type: 'expense',
      amountCents: 2000,
      creditCardId: ids.card,
      categoryId: ids.expenseCat,
    })
  )._id;
  ids.txIncome = (
    await mk('post', '/transactions', {
      ...base,
      type: 'income',
      amountCents: 5000,
      categoryId: ids.incomeCat,
    })
  )._id;
  ids.txTransfer = (
    await mk('post', '/transactions', {
      ...base,
      type: 'transfer',
      amountCents: 300,
      toAccountId: ids.account2,
    })
  )._id;
  ids.txCardPayment = (
    await mk('post', '/transactions', {
      ...base,
      type: 'transfer',
      amountCents: 400,
      toCreditCardId: ids.card,
    })
  )._id;

  ids.purchase = (
    await mk('post', '/installment-purchases', {
      creditCardId: ids.card,
      description: `${tag} compra`,
      categoryId: ids.expenseCat,
      totalCents: 60000,
      installments: 6,
      startDate: '2026-03-01',
    })
  )._id;
  // Overdue on purpose: process-due would charge it for its owner.
  ids.subscription = (
    await mk('post', '/subscriptions', {
      name: `${tag} suscripción`,
      amountCents: 999,
      frequency: 'monthly',
      nextDate: '2026-03-01',
      accountId: ids.account,
      categoryId: ids.expenseCat,
    })
  )._id;
  ids.budget = (
    await mk('post', '/budgets', {
      categoryId: ids.expenseCat,
      month: '2026-03',
      limitCents: 50000,
    })
  )._id;
  return ids;
}

/** Everything A can read, to prove it did not change. */
async function snapshot(c: Ctx) {
  const get = async (path: string) =>
    (await asA(c, 'get', path).expect(200)).body as Record<string, any>;
  return {
    accounts: await get('/accounts?includeArchived=true'),
    categories: await get('/categories?includeArchived=true'),
    cards: await get('/credit-cards?includeArchived=true'),
    transactions: await get('/transactions?limit=100'),
    purchases: await get('/installment-purchases'),
    subscriptions: await get('/subscriptions'),
    budgetsMarch: await get('/budgets?month=2026-03'),
    budgetsApril: await get('/budgets?month=2026-04'),
    summary: await get('/reports/summary?month=2026-03'),
    spending: await get(
      '/reports/spending-by-category?from=2026-01-01&to=2026-12-31',
    ),
  };
}

type Case = {
  /** "METHOD /api/path/:param", exactly as Express registers the route. */
  route: string;
  run: (c: Ctx) => Promise<Response | Response[]>;
  check: (res: Response, c: Ctx) => void;
};

const notFound = (route: string, run: Case['run']): Case => ({
  route,
  run,
  check: (res) => expect(res.status).toBe(404),
});
const rejected = (route: string, run: Case['run']): Case => ({
  route,
  run,
  check: (res) => expect(REJECTED).toContain(res.status),
});
const empty = (
  route: string,
  run: Case['run'],
  assert: (body: any, c: Ctx) => void,
): Case => ({
  route,
  run,
  check: (res, c) => {
    expect(res.status).toBe(200);
    assert(res.body, c);
  },
});

const noneOfA = (body: any, c: Ctx) => {
  const text = JSON.stringify(body);
  for (const id of Object.values(c.ids)) expect(text).not.toContain(id);
};

const CASES: Case[] = [
  // ---- accounts
  notFound('GET /api/accounts/:id', (c) =>
    asB(c, 'get', `/accounts/${c.ids.account}`),
  ),
  notFound('PATCH /api/accounts/:id', (c) =>
    asB(c, 'patch', `/accounts/${c.ids.account}`, { name: 'hijacked' }),
  ),
  notFound('DELETE /api/accounts/:id', (c) =>
    asB(c, 'delete', `/accounts/${c.ids.account}`),
  ),
  empty(
    'GET /api/accounts',
    (c) => asE(c, 'get', '/accounts?includeArchived=true'),
    (body) => {
      expect(body).toEqual([]);
    },
  ),
  {
    route: 'POST /api/accounts',
    run: (c) => asB(c, 'post', '/accounts', { type: 'cash', name: 'B nueva' }),
    check: (res) => expect(res.status).toBe(201),
  },
  // ---- categories
  notFound('GET /api/categories/:id', (c) =>
    asB(c, 'get', `/categories/${c.ids.customCat}`),
  ),
  notFound('PATCH /api/categories/:id', (c) =>
    asB(c, 'patch', `/categories/${c.ids.customCat}`, { name: 'hijacked' }),
  ),
  notFound('DELETE /api/categories/:id', (c) =>
    asB(c, 'delete', `/categories/${c.ids.customCat}`),
  ),
  notFound('POST /api/categories/:id/subcategories', (c) =>
    asB(c, 'post', `/categories/${c.ids.expenseCat}/subcategories`, {
      name: 'intruder',
    }),
  ),
  notFound('PATCH /api/categories/:id/subcategories/:subId', (c) =>
    asB(
      c,
      'patch',
      `/categories/${c.ids.expenseCat}/subcategories/${c.ids.sub}`,
      { name: 'hijacked' },
    ),
  ),
  notFound('DELETE /api/categories/:id/subcategories/:subId', (c) =>
    asB(
      c,
      'delete',
      `/categories/${c.ids.expenseCat}/subcategories/${c.ids.sub}`,
    ),
  ),
  empty(
    'GET /api/categories',
    (c) => asE(c, 'get', '/categories?includeArchived=true'),
    (body, c) => noneOfA(body, c),
  ),
  {
    route: 'POST /api/categories',
    run: (c) =>
      asB(c, 'post', '/categories', {
        type: 'expense',
        name: 'B otra categoría',
        icon: 'tag',
        color: '#445566',
      }),
    check: (res) => expect(res.status).toBe(201),
  },
  // ---- credit cards
  notFound('GET /api/credit-cards/:id', (c) =>
    asB(c, 'get', `/credit-cards/${c.ids.card}`),
  ),
  notFound('GET /api/credit-cards/:id/statement', (c) =>
    asB(c, 'get', `/credit-cards/${c.ids.card}/statement`),
  ),
  notFound('PATCH /api/credit-cards/:id', (c) =>
    asB(c, 'patch', `/credit-cards/${c.ids.card}`, { name: 'hijacked' }),
  ),
  notFound('DELETE /api/credit-cards/:id', (c) =>
    asB(c, 'delete', `/credit-cards/${c.ids.card}`),
  ),
  empty(
    'GET /api/credit-cards',
    (c) => asE(c, 'get', '/credit-cards?includeArchived=true'),
    (body) => {
      expect(body).toEqual([]);
    },
  ),
  {
    route: 'POST /api/credit-cards',
    run: (c) =>
      asB(c, 'post', '/credit-cards', {
        name: 'B otra tarjeta',
        limitCents: 100000,
        cutoffDay: 3,
        paymentDay: 18,
      }),
    check: (res) => expect(res.status).toBe(201),
  },
  // ---- transactions
  notFound('GET /api/transactions/:id', (c) =>
    asB(c, 'get', `/transactions/${c.ids.txExpense}`),
  ),
  notFound('PATCH /api/transactions/:id', (c) =>
    asB(c, 'patch', `/transactions/${c.ids.txExpense}`, { amountCents: 1 }),
  ),
  notFound('DELETE /api/transactions/:id', (c) =>
    asB(c, 'delete', `/transactions/${c.ids.txExpense}`),
  ),
  empty(
    'GET /api/transactions',
    (c) => asE(c, 'get', '/transactions?limit=100'),
    (body, c) => {
      expect(body.total).toBe(0);
      expect(body.items).toEqual([]);
      noneOfA(body, c);
    },
  ),
  rejected('POST /api/transactions', async (c) => {
    const when = { date: '2026-03-12', amountCents: 100 };
    return Promise.all([
      asB(c, 'post', '/transactions', {
        ...when,
        type: 'expense',
        accountId: c.ids.account,
        categoryId: c.bIds.expenseCat,
      }),
      asB(c, 'post', '/transactions', {
        ...when,
        type: 'expense',
        accountId: c.bIds.account,
        categoryId: c.ids.expenseCat,
      }),
      asB(c, 'post', '/transactions', {
        ...when,
        type: 'expense',
        creditCardId: c.ids.card,
        categoryId: c.bIds.expenseCat,
      }),
      asB(c, 'post', '/transactions', {
        ...when,
        type: 'income',
        accountId: c.ids.account,
        categoryId: c.bIds.incomeCat,
      }),
      asB(c, 'post', '/transactions', {
        ...when,
        type: 'transfer',
        accountId: c.bIds.account,
        toAccountId: c.ids.account,
      }),
      asB(c, 'post', '/transactions', {
        ...when,
        type: 'transfer',
        accountId: c.bIds.account,
        toCreditCardId: c.ids.card,
      }),
      asB(c, 'post', '/transactions', {
        ...when,
        type: 'expense',
        accountId: c.bIds.account,
        categoryId: c.bIds.expenseCat,
        subcategoryId: c.ids.sub,
      }),
    ]);
  }),
  // ---- installment purchases
  notFound('GET /api/installment-purchases/:id', (c) =>
    asB(c, 'get', `/installment-purchases/${c.ids.purchase}`),
  ),
  notFound('PATCH /api/installment-purchases/:id', (c) =>
    asB(c, 'patch', `/installment-purchases/${c.ids.purchase}`, {
      description: 'hijacked',
    }),
  ),
  notFound('DELETE /api/installment-purchases/:id', (c) =>
    asB(c, 'delete', `/installment-purchases/${c.ids.purchase}`),
  ),
  notFound('POST /api/installment-purchases/:id/pay', (c) =>
    asB(c, 'post', `/installment-purchases/${c.ids.purchase}/pay`, {
      accountId: c.bIds.account,
    }),
  ),
  empty(
    'GET /api/installment-purchases',
    (c) => asE(c, 'get', '/installment-purchases'),
    (body, c) => {
      expect(body).toEqual([]);
      noneOfA(body, c);
    },
  ),
  empty(
    'GET /api/installment-purchases/projection',
    (c) => asE(c, 'get', '/installment-purchases/projection?months=12'),
    (body) => {
      expect(
        body.every((m: any) => m.count === 0 && m.paymentCents === 0),
      ).toBe(true);
    },
  ),
  rejected('POST /api/installment-purchases', async (c) => {
    const base = {
      description: 'x',
      totalCents: 60000,
      installments: 6,
      startDate: '2026-03-01',
    };
    return Promise.all([
      asB(c, 'post', '/installment-purchases', {
        ...base,
        creditCardId: c.ids.card,
        categoryId: c.bIds.expenseCat,
      }),
      asB(c, 'post', '/installment-purchases', {
        ...base,
        creditCardId: c.bIds.card,
        categoryId: c.ids.expenseCat,
      }),
    ]);
  }),
  // ---- subscriptions
  notFound('GET /api/subscriptions/:id', (c) =>
    asB(c, 'get', `/subscriptions/${c.ids.subscription}`),
  ),
  notFound('PATCH /api/subscriptions/:id', (c) =>
    asB(c, 'patch', `/subscriptions/${c.ids.subscription}`, {
      name: 'hijacked',
    }),
  ),
  notFound('DELETE /api/subscriptions/:id', (c) =>
    asB(c, 'delete', `/subscriptions/${c.ids.subscription}`),
  ),
  empty(
    'GET /api/subscriptions',
    (c) => asE(c, 'get', '/subscriptions'),
    (body, c) => {
      expect(body).toEqual([]);
      noneOfA(body, c);
    },
  ),
  empty(
    'GET /api/subscriptions/upcoming',
    (c) => asE(c, 'get', '/subscriptions/upcoming?days=365'),
    (body) => {
      expect(body).toEqual([]);
    },
  ),
  empty(
    'POST /api/subscriptions/process-due',
    (c) => asB(c, 'post', '/subscriptions/process-due'),
    (body) => {
      // B has its own overdue subscription, so something is charged, but the
      // final snapshot proves the overdue subscription of A was left alone.
      expect(body.charged).toBeGreaterThan(0);
      expect(body.failed).toEqual([]);
    },
  ),
  rejected('POST /api/subscriptions', async (c) => {
    const base = {
      name: 'x',
      amountCents: 500,
      frequency: 'monthly',
      nextDate: '2026-04-01',
    };
    return Promise.all([
      asB(c, 'post', '/subscriptions', {
        ...base,
        accountId: c.ids.account,
        categoryId: c.bIds.expenseCat,
      }),
      asB(c, 'post', '/subscriptions', {
        ...base,
        creditCardId: c.ids.card,
        categoryId: c.bIds.expenseCat,
      }),
      asB(c, 'post', '/subscriptions', {
        ...base,
        accountId: c.bIds.account,
        categoryId: c.ids.expenseCat,
      }),
    ]);
  }),
  // ---- budgets
  notFound('PATCH /api/budgets/:id', (c) =>
    asB(c, 'patch', `/budgets/${c.ids.budget}`, { limitCents: 1 }),
  ),
  notFound('DELETE /api/budgets/:id', (c) =>
    asB(c, 'delete', `/budgets/${c.ids.budget}`),
  ),
  empty(
    'GET /api/budgets',
    (c) => asE(c, 'get', '/budgets?month=2026-03'),
    (body, c) => {
      expect(body).toEqual([]);
      noneOfA(body, c);
    },
  ),
  rejected('POST /api/budgets', (c) =>
    asB(c, 'post', '/budgets', {
      categoryId: c.ids.expenseCat,
      month: '2026-05',
      limitCents: 100,
    }),
  ),
  empty(
    'POST /api/budgets/copy',
    (c) => asE(c, 'post', '/budgets/copy', { from: '2026-03', to: '2026-04' }),
    (body) => {
      expect(body).toMatchObject({ copied: 0 }); // A's March budget must not be copied for B
    },
  ),
  // ---- reports
  empty(
    'GET /api/reports/summary',
    (c) => asE(c, 'get', '/reports/summary?month=2026-03'),
    (body, c) => {
      expect(body).toMatchObject({
        totalBalanceCents: 0,
        cardDebtCents: 0,
        incomeCents: 0,
        expenseCents: 0,
      });
      expect(body.topCategories).toEqual([]);
      expect(body.upcomingSubscriptions).toEqual([]);
      noneOfA(body, c);
    },
  ),
  empty(
    'GET /api/reports/spending-by-category',
    (c) =>
      asE(
        c,
        'get',
        '/reports/spending-by-category?from=2026-01-01&to=2026-12-31',
      ),
    (body) => {
      expect(body.totalCents).toBe(0);
      expect(body.items).toEqual([]);
    },
  ),
  empty(
    'GET /api/reports/income-vs-expenses',
    (c) => asE(c, 'get', '/reports/income-vs-expenses?from=2026-01&to=2026-06'),
    (body) => {
      expect(
        body.months.every(
          (m: any) => m.incomeCents === 0 && m.expenseCents === 0,
        ),
      ).toBe(true);
    },
  ),
  empty(
    'GET /api/reports/budget-vs-spent',
    (c) => asE(c, 'get', '/reports/budget-vs-spent?month=2026-03'),
    (body) => {
      expect(body.items).toEqual([]);
      expect(body.totals.limitCents).toBe(0);
    },
  ),
  empty(
    'GET /api/reports/card-debt',
    (c) => asE(c, 'get', '/reports/card-debt?months=12'),
    (body) => {
      expect(body.cards).toEqual([]);
      expect(body.totalDebtCents).toBe(0);
    },
  ),
];

/** Every `METHOD path` the running app serves, read from Express. */
function servedRoutes(h: Harness): string[] {
  const instance = h.app.getHttpAdapter().getInstance() as any;
  const router = instance.router ?? instance._router;
  if (!router?.stack) throw new Error('Cannot read the Express route table');
  const routes: string[] = [];
  for (const layer of router.stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
      routes.push(`${method.toUpperCase()} ${layer.route.path}`);
    }
  }
  return routes;
}

describe('cross-user isolation', () => {
  let c: Ctx;
  let before: Awaited<ReturnType<typeof snapshot>>;

  beforeAll(async () => {
    const h = await bootApp();
    const a = await signUp(h.http, 'a@example.com', 'User A');
    const b = await signUp(h.http, 'b@example.com', 'User B');
    const e = await signUp(h.http, 'empty@example.com', 'Nobody');
    c = { h, a, b, e, ids: {}, bIds: {} };
    c.ids = await seedUser(c, a.token, 'A');
    c.bIds = await seedUser(c, b.token, 'B');
    before = await snapshot(c);
  });

  afterAll(async () => {
    await c.h.stop();
  });

  it('has data to protect (sanity check of the seed)', () => {
    expect(Object.keys(c.ids).length).toBeGreaterThanOrEqual(15);
    expect(before.accounts).toHaveLength(2);
    expect(before.transactions.total).toBeGreaterThanOrEqual(5);
    expect(before.purchases).toHaveLength(1);
    expect(before.subscriptions).toHaveLength(1);
    expect(before.budgetsMarch).toHaveLength(1);
  });

  it('has a case for every route that touches data', () => {
    const covered = new Set(CASES.map((x) => x.route));
    const missing = servedRoutes(c.h).filter(
      (r) => !covered.has(r) && !EXEMPT.has(r),
    );
    expect(missing).toEqual([]);
    // and no case points at a route that does not exist any more
    const served = new Set(servedRoutes(c.h));
    expect([...covered].filter((r) => !served.has(r))).toEqual([]);
  });

  it.each(CASES.map((x) => [x.route, x] as const))(
    '%s',
    async (_route, testCase) => {
      const result = await testCase.run(c);
      for (const res of Array.isArray(result) ? result : [result]) {
        testCase.check(res, c);
      }
    },
  );

  it("B cannot move A's money by editing B's own records to point at A's", async () => {
    const own = c.bIds;
    const rejects = await Promise.all([
      asB(c, 'patch', `/transactions/${own.txExpense}`, {
        accountId: c.ids.account,
      }),
      asB(c, 'patch', `/transactions/${own.txExpense}`, {
        categoryId: c.ids.expenseCat,
      }),
      asB(c, 'patch', `/subscriptions/${own.subscription}`, {
        accountId: c.ids.account,
      }),
      asB(c, 'patch', `/subscriptions/${own.subscription}`, {
        categoryId: c.ids.expenseCat,
      }),
      asB(c, 'patch', `/installment-purchases/${own.purchase}`, {
        categoryId: c.ids.expenseCat,
      }),
    ]);
    for (const res of rejects) expect(REJECTED).toContain(res.status);
  });

  it('own listings and reports of B contain nothing of A', async () => {
    for (const path of [
      '/accounts?includeArchived=true',
      '/categories?includeArchived=true',
      '/credit-cards?includeArchived=true',
      '/transactions?limit=100',
      '/installment-purchases',
      '/subscriptions',
      '/budgets?month=2026-03',
      '/reports/summary?month=2026-03',
      '/reports/spending-by-category?from=2026-01-01&to=2026-12-31',
      '/reports/card-debt?months=12',
    ]) {
      const res = await asB(c, 'get', path).expect(200);
      noneOfA(res.body, c);
    }
  });

  it("A's data is exactly as it was after everything B tried", async () => {
    expect(await snapshot(c)).toEqual(before);
  });
});
