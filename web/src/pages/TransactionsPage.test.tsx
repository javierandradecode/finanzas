import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
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
    expect(within(r1).getByTestId('amount')).toHaveClass('text-destructive')
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

  it('installment transactions have no edit or delete actions', async () => {
    routeFetch({ ...lists, [`GET ${MARCH}`]: () => page([installment, expense]) })
    renderPage()
    await screen.findByText('Mercado')
    const [r1, r2] = rows()
    expect(within(r1).queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(within(r1).queryByRole('button', { name: 'Eliminar' })).toBeNull()
    expect(within(r1).getByText(/Gestionado por una compra a cuotas/)).toBeInTheDocument()
    expect(within(r2).getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    expect(within(r2).getByRole('button', { name: 'Eliminar' })).toBeInTheDocument()
  })

  it('a filter goes to the request and the URL, and resets the page to 1', async () => {
    const calls = routeFetch({
      ...lists,
      [`GET /transactions?from=2026-03-01&to=2026-03-31&page=3&limit=20`]: () => page([expense], { total: 45, page: 3 }),
      [`GET /transactions?from=2026-03-01&to=2026-03-31&type=expense&page=1&limit=20`]: () => page([expense]),
    })
    renderPage('/movimientos?page=3')
    await screen.findByText('Mercado')
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'expense')
    await waitFor(() =>
      expect(calls.some((c) => c.path.includes('type=expense') && c.path.includes('page=1'))).toBe(true),
    )
    expect(screen.getByTestId('where').textContent).toContain('type=expense')
    expect(screen.getByTestId('where').textContent).not.toContain('page=')
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

  it('shows an empty state for an out-of-range page', async () => {
    routeFetch({
      ...lists,
      [`GET /transactions?from=2026-03-01&to=2026-03-31&page=99&limit=20`]: () => page([], { total: 45, page: 99 }),
    })
    renderPage('/movimientos?page=99')
    expect(await screen.findByText('No hay movimientos para estos filtros.')).toBeInTheDocument()
  })

  it('Limpiar goes back to the current month', async () => {
    routeFetch({
      ...lists,
      [`GET /transactions?from=2026-01-01&to=2026-01-31&page=1&limit=20`]: () => page([]),
      [`GET ${MARCH}`]: () => page([expense]),
    })
    renderPage('/movimientos?from=2026-01-01&to=2026-01-31')
    await screen.findByText('No hay movimientos para estos filtros.')
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar' }))
    expect(await screen.findByText('Mercado')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('')
  })

  it('deletes after confirming', async () => {
    const calls = routeFetch({
      ...lists,
      [`GET ${MARCH}`]: () => page([expense]),
      'DELETE /transactions/t1': () => jsonResponse(204),
    })
    renderPage()
    await screen.findByText('Mercado')
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
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
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('managed by an installment purchase'))
  })

  it('opens the edit dialog prefilled', async () => {
    routeFetch({ ...lists, [`GET ${MARCH}`]: () => page([expense]) })
    renderPage()
    await screen.findByText('Mercado')
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(await screen.findByText('Editar movimiento')).toBeInTheDocument()
    expect(await screen.findByLabelText('Monto')).toHaveValue('1234,56')
  })
})
