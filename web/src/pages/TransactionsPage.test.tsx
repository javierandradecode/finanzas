import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import type { Transaction } from '@/api/transactions'
import { AuthContext } from '@/features/auth/useAuth'
import { jsonResponse, makeClient, routeFetch } from '@/test/utils'
import { TransactionsPage } from './TransactionsPage'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const acc = (_id: string, name: string, isArchived = false) => ({
  _id, name, type: 'cash', balanceCents: 0, isArchived,
})
const accounts = [acc('a1', 'Caja'), acc('a2', 'Banco'), acc('a9', 'Vieja', true)]
const cards = [
  { _id: 'k1', name: 'Visa', limitCents: 0, cutoffDay: 1, paymentDay: 10, annualRatePercent: 0, debtCents: 0, isArchived: false },
]
const cat = (over: object) => ({ icon: 'tag', color: '#000000', isArchived: false, subcategories: [], ...over })
const categories = [
  cat({ _id: 'c1', type: 'expense', name: 'Alimentación' }),
  cat({ _id: 'c3', type: 'income', name: 'Salario' }),
  cat({ _id: 'c9', type: 'expense', name: 'Antigua', isArchived: true }),
]

const tx = (over: Partial<Transaction>): Transaction => ({
  _id: 't?', type: 'expense', amountCents: 1000, date: '2026-03-10T00:00:00.000Z',
  source: 'manual', ...over,
})
const expense = tx({ _id: 't1', amountCents: 123456, accountId: 'a1', categoryId: 'c1', note: 'Mercado' })
const income = tx({ _id: 't2', type: 'income', amountCents: 50000, accountId: 'a2', categoryId: 'c3' })
const transfer = tx({ _id: 't3', type: 'transfer', amountCents: 2000, accountId: 'a1', toAccountId: 'a2' })
const cardPay = tx({ _id: 't4', type: 'transfer', amountCents: 3000, accountId: 'a1', toCreditCardId: 'k1' })
const installment = tx({ _id: 't5', amountCents: 700, creditCardId: 'k1', categoryId: 'c1', source: 'installment', installmentPurchaseId: 'p1' })
const subscription = tx({ _id: 't6', amountCents: 900, accountId: 'a1', categoryId: 'c1', source: 'subscription', subscriptionId: 's1' })
const oldOne = tx({ _id: 't7', accountId: 'a9', categoryId: 'c9' })

const page = (items: Transaction[], extra: object = {}) =>
  jsonResponse(200, { items, total: items.length, page: 1, limit: 20, ...extra })

const lists = {
  'GET /accounts?includeArchived=true': () => jsonResponse(200, accounts),
  'GET /credit-cards?includeArchived=true': () => jsonResponse(200, cards),
  'GET /categories?includeArchived=true': () => jsonResponse(200, categories),
}
const MARCH = '/transactions?from=2026-03-01&to=2026-03-31&page=1&limit=20'
const SUMMARY = '/transactions/summary?from=2026-03-01&to=2026-03-31'

/** Opens the row menu of a movement (by its title) and picks an action. */
async function pickAction(title: string, action: string) {
  await userEvent.click(await screen.findByRole('button', { name: `Acciones de ${title}` }))
  await userEvent.click(await screen.findByRole('menuitem', { name: action }))
}

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.search}</p>
}

function renderPage(initial = '/movimientos') {
  const auth = {
    user: { id: 'u', email: 'a@b.co', name: 'Ana', currency: 'USD' },
    status: 'authenticated' as const,
    login: vi.fn(), register: vi.fn(), logout: vi.fn(),
  }
  return render(
    <QueryClientProvider client={makeClient()}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[initial]}>
          <TransactionsPage />
          <Where />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

const rows = () => screen.getAllByTestId('tx-row')

describe('TransactionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Only Date is faked, so timers and promises keep working.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 2, 15, 12, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('asks for the current month, page 1, limit 20', async () => {
    const calls = routeFetch({ ...lists, [`GET ${MARCH}`]: () => page([expense]) })
    renderPage()
    await screen.findByText('Mercado')
    expect(calls.some((c) => c.path === MARCH)).toBe(true)
  })

  it('shows signs, colors, names and tags', async () => {
    routeFetch({
      ...lists,
      [`GET ${MARCH}`]: () => page([expense, income, transfer, cardPay, installment, subscription, oldOne]),
    })
    renderPage()
    await screen.findByText('Mercado')
    const [r1, r2, r3, r4, r5, r6, r7] = rows()

    expect(within(r1).getByText(/1\.234,56/)).toHaveTextContent('-')
    // an ordinary expense is not an alert: normal text colour
    expect(within(r1).getByTestId('amount')).not.toHaveClass('text-destructive')
    expect(within(r2).getByTestId('amount')).toHaveTextContent('+')
    expect(within(r2).getByText('Salario')).toBeInTheDocument()
    expect(within(r3).getByText('Transferencia')).toBeInTheDocument()
    expect(within(r3).getByText(/Caja → Banco/)).toBeInTheDocument()
    expect(within(r3).getByTestId('amount').textContent).not.toMatch(/[+-]/)
    expect(within(r4).getByText(/Caja → Visa/)).toBeInTheDocument()
    expect(within(r5).getByText('Cuota')).toBeInTheDocument()
    expect(within(r6).getByText('Suscripción')).toBeInTheDocument()
    // archived account and category still show their names
    expect(within(r7).getByText(/Vieja/)).toBeInTheDocument()
    expect(within(r7).getByText(/Antigua/)).toBeInTheDocument()
  })

  it('installment transactions have no menu', async () => {
    routeFetch({ ...lists, [`GET ${MARCH}`]: () => page([installment, expense]) })
    renderPage()
    await screen.findByText('Mercado')
    const [r1, r2] = rows()
    expect(within(r1).queryByRole('button', { name: /Acciones de/ })).toBeNull()
    expect(within(r1).getByText(/Gestionado por una compra a cuotas/)).toBeInTheDocument()
    expect(within(r2).getByRole('button', { name: 'Acciones de Mercado' })).toBeInTheDocument()
  })

  it('groups the page by day with one heading per day', async () => {
    const monday = tx({ _id: 't8', date: '2026-03-09T00:00:00.000Z', accountId: 'a1', categoryId: 'c1', note: 'Lunes' })
    routeFetch({ ...lists, [`GET ${MARCH}`]: () => page([expense, income, monday]) })
    renderPage()
    await screen.findByText('Mercado')
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual([
      expect.stringMatching(/^martes,? 10 de marzo$/),
      expect.stringMatching(/^lunes,? 9 de marzo$/),
    ])
    expect(rows()).toHaveLength(3)
  })

  describe('period summary', () => {
    it('shows income, expenses and net of the whole period, not just the page', async () => {
      routeFetch({
        ...lists,
        [`GET ${MARCH}`]: () => page([expense], { total: 45 }),
        [`GET ${SUMMARY}`]: () => jsonResponse(200, { incomeCents: 240000, expenseCents: 115030 }),
      })
      renderPage()
      expect(await screen.findByTestId('summary-income')).toHaveTextContent('2.400,00')
      expect(screen.getByTestId('summary-expense')).toHaveTextContent('1.150,30')
      expect(screen.getByTestId('summary-net')).toHaveTextContent('1.249,70')
      expect(screen.getByTestId('summary-net')).not.toHaveClass('text-destructive')
    })

    it('writes a negative net in red', async () => {
      routeFetch({
        ...lists,
        [`GET ${MARCH}`]: () => page([expense]),
        [`GET ${SUMMARY}`]: () => jsonResponse(200, { incomeCents: 1000, expenseCents: 5000 }),
      })
      renderPage()
      expect(await screen.findByTestId('summary-net')).toHaveClass('text-destructive')
    })

    it('uses the same filters as the list, and not the page or the range marker', async () => {
      const calls = routeFetch({
        ...lists,
        [`GET /transactions?from=2026-03-01&to=2026-03-31&type=expense&page=2&limit=20`]: () => page([expense], { total: 45, page: 2 }),
        [`GET ${SUMMARY}&type=expense`]: () => jsonResponse(200, { incomeCents: 0, expenseCents: 5 }),
      })
      renderPage('/movimientos?type=expense&page=2')
      await screen.findByTestId('summary-expense')
      expect(calls.some((c) => c.path === `${SUMMARY}&type=expense`)).toBe(true)
    })

    it('does not ask again when only the page changes', async () => {
      const calls = routeFetch({
        ...lists,
        [`GET ${MARCH}`]: () => page([expense], { total: 45 }),
        [`GET /transactions?from=2026-03-01&to=2026-03-31&page=2&limit=20`]: () => page([income], { total: 45, page: 2 }),
        [`GET ${SUMMARY}`]: () => jsonResponse(200, { incomeCents: 0, expenseCents: 0 }),
      })
      renderPage()
      await screen.findByTestId('summary-net')
      await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
      expect(await screen.findByText(/Página 2 de 3/)).toBeInTheDocument()
      expect(calls.filter((c) => c.path.startsWith('/transactions/summary'))).toHaveLength(1)
    })

    it('stays hidden, without breaking the list, when the summary fails', async () => {
      routeFetch({
        ...lists,
        [`GET ${MARCH}`]: () => page([expense]),
        [`GET ${SUMMARY}`]: () => jsonResponse(500, { message: 'boom' }),
      })
      renderPage()
      expect(await screen.findByText('Mercado')).toBeInTheDocument()
      expect(screen.queryByTestId('summary')).toBeNull()
    })
  })

  describe('period and filters', () => {
    it('shows the month and moves with the arrows', async () => {
      routeFetch({
        ...lists,
        [`GET ${MARCH}`]: () => page([expense]),
        [`GET /transactions?from=2026-02-01&to=2026-02-28&page=1&limit=20`]: () => page([income]),
      })
      renderPage()
      expect(await screen.findByTestId('month')).toHaveTextContent('marzo de 2026')
      await userEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
      expect(await screen.findByText('Salario')).toBeInTheDocument()
      expect(screen.getByTestId('where')).toHaveTextContent('from=2026-02-01&to=2026-02-28')
    })

    it('names a custom range and goes back to this month with one click', async () => {
      routeFetch({
        ...lists,
        [`GET /transactions?from=2026-03-05&to=2026-03-20&page=1&limit=20`]: () => page([expense]),
        [`GET ${MARCH}`]: () => page([income]),
      })
      renderPage('/movimientos?from=2026-03-05&to=2026-03-20')
      expect(await screen.findByTestId('period')).toHaveTextContent('Rango personalizado')
      await userEvent.click(screen.getByRole('button', { name: 'Este mes' }))
      expect(await screen.findByTestId('month')).toHaveTextContent('marzo de 2026')
    })

    it('emptying both dates shows the whole history instead of snapping back to the month', async () => {
      const calls = routeFetch({
        ...lists,
        [`GET ${MARCH}`]: () => page([expense]),
        [`GET /transactions?page=1&limit=20`]: () => page([expense, income]),
      })
      renderPage()
      await screen.findByText('Mercado')
      await userEvent.click(screen.getByRole('button', { name: 'Más filtros' }))
      for (const label of ['Desde', 'Hasta']) {
        await userEvent.click(screen.getByLabelText(label))
        await userEvent.click(await screen.findByRole('button', { name: 'Borrar' }))
      }
      expect(await screen.findByTestId('period')).toHaveTextContent('Todo el historial')
      expect(screen.getByTestId('where')).toHaveTextContent('range=all')
      await waitFor(() => expect(rows()).toHaveLength(2))
      // the marker is a web-only thing
      expect(calls.some((c) => c.path.includes('range'))).toBe(false)
    }, 20_000) // opens and closes two calendars

    it('a type filter goes to the request and the URL, and resets the page to 1', async () => {
      const calls = routeFetch({
        ...lists,
        [`GET /transactions?from=2026-03-01&to=2026-03-31&page=3&limit=20`]: () => page([expense], { total: 45, page: 3 }),
        [`GET /transactions?from=2026-03-01&to=2026-03-31&type=expense&page=1&limit=20`]: () => page([expense]),
      })
      renderPage('/movimientos?page=3')
      await screen.findByText('Mercado')
      expect(screen.getByRole('radio', { name: 'Todos' })).toBeChecked()
      await userEvent.click(screen.getByRole('radio', { name: 'Gastos' }))
      await waitFor(() =>
        expect(calls.some((c) => c.path.includes('type=expense') && c.path.includes('page=1'))).toBe(true),
      )
      expect(screen.getByTestId('where').textContent).toContain('type=expense')
      expect(screen.getByTestId('where').textContent).not.toContain('page=')
    })

    it('account and category are in "Más filtros" and filter the list', async () => {
      const calls = routeFetch({
        ...lists,
        [`GET ${MARCH}`]: () => page([expense]),
        [`GET /transactions?from=2026-03-01&to=2026-03-31&accountId=a2&page=1&limit=20`]: () => page([income]),
      })
      renderPage()
      await screen.findByText('Mercado')
      expect(screen.queryByLabelText('Cuenta')).toBeNull()
      await userEvent.click(screen.getByRole('button', { name: 'Más filtros' }))
      await userEvent.selectOptions(screen.getByLabelText('Cuenta'), 'a2')
      // "Salario" is also an option of the category select, so look inside the rows
      await waitFor(() => expect(within(rows()[0]).getByText('Salario')).toBeInTheDocument())
      expect(calls.some((c) => c.path.includes('accountId=a2'))).toBe(true)
    })

    it('shows removable chips for the account and category filters', async () => {
      routeFetch({
        ...lists,
        [`GET /transactions?from=2026-03-01&to=2026-03-31&accountId=a1&categoryId=c1&page=1&limit=20`]: () => page([expense]),
        [`GET /transactions?from=2026-03-01&to=2026-03-31&categoryId=c1&page=1&limit=20`]: () => page([income]),
      })
      renderPage('/movimientos?accountId=a1&categoryId=c1')
      expect(await screen.findByText('Cuenta: Caja')).toBeInTheDocument()
      expect(screen.getByText('Categoría: Alimentación')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Quitar filtro de cuenta' }))
      expect(await screen.findByText('Salario')).toBeInTheDocument()
      expect(screen.queryByText('Cuenta: Caja')).toBeNull()
      expect(screen.getByTestId('where').textContent).not.toContain('accountId')
      expect(screen.getByTestId('where').textContent).toContain('categoryId=c1')
    })
  })

  it('paginates with Anterior/Siguiente', async () => {
    const calls = routeFetch({
      ...lists,
      [`GET ${MARCH}`]: () => page([expense], { total: 45 }),
      [`GET /transactions?from=2026-03-01&to=2026-03-31&page=2&limit=20`]: () => page([income], { total: 45, page: 2 }),
    })
    renderPage()
    await screen.findByText('Mercado')
    expect(screen.getByText(/Página 1 de 3/)).toBeInTheDocument()
    expect(screen.getByText(/45 movimientos/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(calls.some((c) => c.path.includes('page=2'))).toBe(true))
    expect(await screen.findByText(/Página 2 de 3/)).toBeInTheDocument()
  })

  describe('empty states', () => {
    it('an out-of-range page offers to go back to the first one', async () => {
      routeFetch({
        ...lists,
        [`GET /transactions?from=2026-03-01&to=2026-03-31&page=99&limit=20`]: () => page([], { total: 45, page: 99 }),
        [`GET ${MARCH}`]: () => page([expense], { total: 45 }),
      })
      renderPage('/movimientos?page=99')
      expect(await screen.findByText('Esta página no tiene movimientos.')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Ir a la primera página' }))
      expect(await screen.findByText('Mercado')).toBeInTheDocument()
    })

    it('with filters it says so and lets you remove them', async () => {
      routeFetch({
        ...lists,
        [`GET /transactions?from=2026-03-01&to=2026-03-31&type=income&page=1&limit=20`]: () => page([]),
        [`GET ${MARCH}`]: () => page([expense]),
      })
      renderPage('/movimientos?type=income')
      expect(await screen.findByText('No hay movimientos con estos filtros.')).toBeInTheDocument()
      expect(screen.queryByText(/Página/)).toBeNull()
      await userEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }))
      expect(await screen.findByText('Mercado')).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'Todos' })).toBeChecked()
    })

    it('an empty month names the month and offers the whole history', async () => {
      routeFetch({
        ...lists,
        [`GET ${MARCH}`]: () => page([]),
        [`GET /transactions?page=1&limit=20`]: () => page([expense]),
      })
      renderPage()
      expect(await screen.findByText('No hay movimientos en marzo de 2026.')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Ver todo el historial' }))
      expect(await screen.findByText('Mercado')).toBeInTheDocument()
      expect(screen.getByTestId('where')).toHaveTextContent('range=all')
    })

    it('with nothing at all, invites to register the first movement', async () => {
      routeFetch({ ...lists, [`GET /transactions?page=1&limit=20`]: () => page([]) })
      renderPage('/movimientos?range=all')
      expect(await screen.findByText('Aún no registras movimientos.')).toBeInTheDocument()
      expect(screen.queryByText(/Página/)).toBeNull()
    })
  })

  it('shows a skeleton while loading, and the wake-up hint only when it is slow', async () => {
    vi.useFakeTimers() // all timers, this time
    vi.setSystemTime(new Date(2026, 2, 15, 12, 0))
    routeFetch({ ...lists, [`GET ${MARCH}`]: () => new Promise<Response>(() => {}) as never })
    renderPage()
    expect(screen.getByTestId('transactions-skeleton')).toBeInTheDocument()
    expect(screen.queryByText(/primera carga/)).toBeNull()
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.getByText(/primera carga puede tardar/)).toBeInTheDocument()
  })

  it('deletes after confirming', async () => {
    const calls = routeFetch({
      ...lists,
      [`GET ${MARCH}`]: () => page([expense]),
      'DELETE /transactions/t1': () => jsonResponse(204),
    })
    renderPage()
    await screen.findByText('Mercado')
    await pickAction('Mercado', 'Eliminar')
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Movimiento eliminado'))
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/transactions/t1')).toBe(true)
  })

  it('toasts a delete error', async () => {
    routeFetch({
      ...lists,
      [`GET ${MARCH}`]: () => page([expense]),
      'DELETE /transactions/t1': () => jsonResponse(409, { message: 'managed by an installment purchase' }),
    })
    renderPage()
    await screen.findByText('Mercado')
    await pickAction('Mercado', 'Eliminar')
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('managed by an installment purchase'))
  })

  it('opens the edit dialog prefilled', async () => {
    routeFetch({ ...lists, [`GET ${MARCH}`]: () => page([expense]) })
    renderPage()
    await screen.findByText('Mercado')
    await pickAction('Mercado', 'Editar')
    expect(await screen.findByText('Editar movimiento')).toBeInTheDocument()
    expect(await screen.findByLabelText('Monto')).toHaveValue('1234,56')
  })

  describe('CSV export', () => {
    const EXPORT = '/transactions/export?from=2026-03-01&to=2026-03-31'
    const csv = (name = 'movimientos-2026-03-15.csv') =>
      new Response('x', {
        status: 200,
        headers: { 'Content-Disposition': `attachment; filename="${name}"` },
      })
    let click: ReturnType<typeof vi.spyOn>
    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => 'blob:x')
      URL.revokeObjectURL = vi.fn()
      click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    })
    afterEach(() => click.mockRestore())

    it('downloads with the filters of the URL and without page', async () => {
      const calls = routeFetch({
        ...lists,
        [`GET ${MARCH}`]: () => page([expense]),
        [`GET ${EXPORT}&type=expense`]: () => csv(),
      })
      renderPage('/movimientos?type=expense&page=2')
      await userEvent.click(await screen.findByRole('button', { name: /exportar csv/i }))
      await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
      expect(calls.some((c) => c.path === `${EXPORT}&type=expense`)).toBe(true)
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x')
    })

    it('is disabled while downloading, so a double click downloads once', async () => {
      let release: (r: Response) => void = () => {}
      const calls = routeFetch({
        ...lists,
        [`GET ${MARCH}`]: () => page([expense]),
        [`GET ${EXPORT}`]: () =>
          new Promise<Response>((res) => {
            release = res
          }) as never,
      })
      renderPage()
      const button = await screen.findByRole('button', { name: /exportar csv/i })
      await userEvent.click(button)
      await waitFor(() => expect(button).toBeDisabled())
      await userEvent.click(button)
      release(csv())
      await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
      expect(calls.filter((c) => c.path.startsWith('/transactions/export'))).toHaveLength(1)
      await waitFor(() => expect(button).toBeEnabled())
    })

    it('shows the API message when the export fails', async () => {
      routeFetch({
        ...lists,
        [`GET ${MARCH}`]: () => page([expense]),
        [`GET ${EXPORT}`]: () => jsonResponse(400, { message: 'Too many transactions' }),
      })
      renderPage()
      await userEvent.click(await screen.findByRole('button', { name: /exportar csv/i }))
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Too many transactions'))
      expect(click).not.toHaveBeenCalled()
    })
  })
})
