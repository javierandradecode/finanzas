import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { AuthContext } from '@/features/auth/useAuth'
import { jsonResponse, makeClient, routeFetch } from '@/test/utils'
import { DashboardPage } from './DashboardPage'

const summary = (month: string, over: object = {}) => ({
  month, totalBalanceCents: 1234500, cardDebtCents: 70000, incomeCents: 80000, expenseCents: 115000,
  netCents: -35000, topCategories: [], budgets: { limitCents: 40000, spentCents: 50000, overBudgetCount: 1 },
  upcomingSubscriptions: [
    { subscriptionId: 's1', name: 'Netflix', amountCents: 999, date: '2026-11-20T00:00:00.000Z', overdue: false, frequency: 'monthly', accountId: 'a1', categoryId: 'c1' },
  ],
  installmentProjection: [{ month: '2026-11', principalCents: 10000, interestCents: 0, paymentCents: 10000, count: 1 }],
  ...over,
})
const spending = {
  from: '', to: '', totalCents: 115000,
  items: [{ categoryId: 'c1', name: 'Alimentación', icon: 'utensils', color: '#f97316', totalCents: 115000, count: 3 }],
}
const flow = (from: string, to: string) => ({
  from, to,
  months: [{ month: to, incomeCents: 80000, expenseCents: 115000, netCents: -35000 }],
})
const budgets = (month: string) => ({
  month,
  items: [{ budgetId: 'b1', categoryId: 'c1', name: 'Alimentación', icon: 'utensils', color: '#f97316', limitCents: 40000, spentCents: 50000, remainingCents: -10000, percentUsed: 125, overBudget: true }],
  totals: { limitCents: 40000, spentCents: 50000, overBudgetCount: 1 },
})

/** All four report endpoints for November 2026 and October 2026. */
const routes = () => ({
  'GET /reports/summary?month=2026-11': () => jsonResponse(200, summary('2026-11')),
  'GET /reports/spending-by-category?from=2026-11-01&to=2026-11-30': () => jsonResponse(200, spending),
  'GET /reports/income-vs-expenses?from=2026-06&to=2026-11': () => jsonResponse(200, flow('2026-06', '2026-11')),
  'GET /reports/budget-vs-spent?month=2026-11': () => jsonResponse(200, budgets('2026-11')),
  'GET /reports/summary?month=2026-10': () => jsonResponse(200, summary('2026-10')),
  'GET /reports/spending-by-category?from=2026-10-01&to=2026-10-31': () => jsonResponse(200, spending),
  'GET /reports/income-vs-expenses?from=2026-05&to=2026-10': () => jsonResponse(200, flow('2026-05', '2026-10')),
  'GET /reports/budget-vs-spent?month=2026-10': () => jsonResponse(200, budgets('2026-10')),
})

function Where() {
  return <p data-testid="where">{useLocation().search}</p>
}

function renderPage(initial = '/') {
  const auth = {
    user: { id: 'u', email: 'a@b.co', name: 'Ana', currency: 'USD' },
    status: 'authenticated' as const,
    login: vi.fn(), register: vi.fn(), logout: vi.fn(),
  }
  return render(
    <QueryClientProvider client={makeClient()}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[initial]}>
          <DashboardPage />
          <Where />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 8, 12, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('asks for the four reports of the current month with the right ranges', async () => {
    const calls = routeFetch(routes())
    renderPage()
    await screen.findByTestId('card-balance')
    await screen.findByRole('table', { name: 'Presupuesto contra real' })
    const paths = calls.map((c) => c.path)
    expect(paths).toContain('/reports/summary?month=2026-11')
    expect(paths).toContain('/reports/spending-by-category?from=2026-11-01&to=2026-11-30')
    expect(paths).toContain('/reports/income-vs-expenses?from=2026-06&to=2026-11')
    expect(paths).toContain('/reports/budget-vs-spent?month=2026-11')
  })

  it('shows the cards, the three charts (accessible tables) and the upcoming payments', async () => {
    routeFetch(routes())
    renderPage()
    expect(await screen.findByTestId('card-balance')).toHaveTextContent('12.345,00')
    expect(screen.getByTestId('card-debt')).toHaveTextContent('700,00')
    expect(await screen.findByRole('table', { name: 'Gasto por categoría' })).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Evolución mensual' })).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Presupuesto contra real' })).toBeInTheDocument()
    expect(await screen.findAllByTestId('upcoming-sub')).toHaveLength(1)
    expect(screen.getByTestId('month')).toHaveTextContent('noviembre de 2026')
  })

  it('changing the month updates the URL and asks everything again with the new month', async () => {
    const calls = routeFetch(routes())
    renderPage()
    await screen.findByTestId('card-balance')
    await userEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toContain('month=2026-10'))
    await waitFor(() => {
      const paths = calls.map((c) => c.path)
      expect(paths).toContain('/reports/summary?month=2026-10')
      expect(paths).toContain('/reports/spending-by-category?from=2026-10-01&to=2026-10-31')
      expect(paths).toContain('/reports/income-vs-expenses?from=2026-05&to=2026-10')
      expect(paths).toContain('/reports/budget-vs-spent?month=2026-10')
    })
  })

  it('dims the old numbers while the new month is loading', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    routeFetch({
      ...routes(),
      'GET /reports/summary?month=2026-10': async () => {
        await gate
        return jsonResponse(200, summary('2026-10'))
      },
    })
    renderPage()
    const cards = (await screen.findByTestId('card-balance')).closest('[aria-busy]') as HTMLElement
    expect(cards).toHaveAttribute('aria-busy', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
    await waitFor(() =>
      expect((screen.getByTestId('card-balance').closest('[aria-busy]') as HTMLElement)).toHaveAttribute('aria-busy', 'true'),
    )
    expect(screen.getByTestId('card-balance').closest('[aria-busy]')).toHaveClass('opacity-50')
    release()
    await waitFor(() =>
      expect(screen.getByTestId('card-balance').closest('[aria-busy]')).toHaveAttribute('aria-busy', 'false'),
    )
  })

  it('a failing report only breaks its own panel', async () => {
    routeFetch({
      ...routes(),
      'GET /reports/spending-by-category?from=2026-11-01&to=2026-11-30': () =>
        jsonResponse(500, { message: 'Error de prueba' }),
    })
    renderPage()
    const panel = (await screen.findByText('Gasto por categoría')).closest('section') as HTMLElement
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Error de prueba')
    // everything else is still there
    expect(await screen.findByTestId('card-balance')).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Evolución mensual' })).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Presupuesto contra real' })).toBeInTheDocument()
  })

  it('an empty month shows zero cards and the empty texts, without NaN', async () => {
    routeFetch({
      'GET /reports/summary?month=2026-11': () =>
        jsonResponse(200, summary('2026-11', {
          totalBalanceCents: 0, cardDebtCents: 0, incomeCents: 0, expenseCents: 0, netCents: 0,
          upcomingSubscriptions: [], installmentProjection: [],
        })),
      'GET /reports/spending-by-category?from=2026-11-01&to=2026-11-30': () =>
        jsonResponse(200, { from: '', to: '', totalCents: 0, items: [] }),
      'GET /reports/income-vs-expenses?from=2026-06&to=2026-11': () =>
        jsonResponse(200, { from: '2026-06', to: '2026-11', months: [{ month: '2026-11', incomeCents: 0, expenseCents: 0, netCents: 0 }] }),
      'GET /reports/budget-vs-spent?month=2026-11': () =>
        jsonResponse(200, { month: '2026-11', items: [], totals: { limitCents: 0, spentCents: 0, overBudgetCount: 0 } }),
    })
    const { container } = renderPage()
    expect(await screen.findByText('Sin gastos este mes.')).toBeInTheDocument()
    expect(await screen.findByText('Sin movimientos en estos meses.')).toBeInTheDocument()
    expect(await screen.findByText(/Sin presupuestos este mes/)).toBeInTheDocument()
    expect(screen.getByTestId('card-balance')).toHaveTextContent('0,00')
    expect(container.textContent).not.toMatch(/NaN/)
  })
})
