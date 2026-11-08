import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { toast } from 'sonner'
import { AuthContext } from '@/features/auth/useAuth'
import { jsonResponse, makeClient, routeFetch } from '@/test/utils'
import { CardDetailPage } from './CardDetailPage'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const card = (over: object = {}) => ({
  _id: 'k1', name: 'Visa', limitCents: 150000, cutoffDay: 5, paymentDay: 20,
  annualRatePercent: 0, debtCents: 50000, availableCents: 100000, isArchived: false, ...over,
})
const tx = (over: object) => ({
  _id: 't?', type: 'expense', amountCents: 1000, date: '2026-03-10T00:00:00.000Z',
  source: 'manual', ...over,
})
const statement = {
  cardId: 'k1',
  period: { start: '2026-03-06T00:00:00.000Z', end: '2026-04-05T23:59:59.999Z' },
  paymentDueDate: '2026-04-20T00:00:00.000Z',
  purchases: [tx({ _id: 't1', amountCents: 4000, creditCardId: 'k1', note: 'Cena', categoryId: 'c1' })],
  payments: [tx({ _id: 't2', type: 'transfer', amountCents: 2000, accountId: 'a1', toCreditCardId: 'k1' })],
  installmentsDue: [
    { purchaseId: 'p1', description: 'Laptop', number: 4, of: 12, dueDate: '2026-04-20T00:00:00.000Z',
      principalCents: 10000, interestCents: 0, paymentCents: 10000 },
  ],
  totals: { purchasesCents: 4000, paymentsCents: 2000, installmentsDueCents: 10000 },
  debtCents: 50000,
  availableCents: 100000,
}

const row = (n: number, paid: boolean, principal = 10000, interest = 0) => ({
  number: n, dueDate: `2026-${String(n).padStart(2, '0')}-20T00:00:00.000Z`,
  principalCents: principal, interestCents: interest, paymentCents: principal + interest,
  remainingPrincipalCents: 0, paid,
})
const purchase = (over: object) => ({
  _id: 'p?', creditCardId: 'k1', description: 'Compra', categoryId: 'c1', totalCents: 120000,
  installments: 12, annualRatePercent: 0, startDate: '2026-01-10T00:00:00.000Z',
  firstDueDate: '2026-02-20T00:00:00.000Z', paymentDay: 20, paidInstallments: 0,
  purchaseTransactionId: 'tx', isPaidOff: false, schedule: [], ...over,
})
const laptop = purchase({
  _id: 'p1', description: 'Laptop', paidInstallments: 3,
  schedule: Array.from({ length: 12 }, (_, i) => row(i + 1, i < 3)),
})
const phone = purchase({
  _id: 'p2', description: 'Celular', totalCents: 20000, installments: 2, paidInstallments: 2,
  isPaidOff: true, schedule: [row(1, true), row(2, true)],
})
const chair = purchase({
  _id: 'p3', description: 'Silla', totalCents: 60000, installments: 6, paidInstallments: 0,
  schedule: Array.from({ length: 6 }, (_, i) => row(i + 1, false)),
})

const cat = (over: object) => ({ icon: 'tag', color: '#000000', isArchived: false, subcategories: [], ...over })
const categories = [
  cat({ _id: 'c1', type: 'expense', name: 'Compras', subcategories: [{ _id: 's1', name: 'Tecnología', isArchived: false }] }),
  cat({ _id: 'c3', type: 'income', name: 'Salario' }),
  cat({ _id: 'c9', type: 'expense', name: 'Antigua', isArchived: true }),
]
const acc = (_id: string, name: string, isArchived = false) => ({ _id, name, type: 'cash', balanceCents: 0, isArchived })
const accounts = [acc('a1', 'Caja'), acc('a2', 'Banco'), acc('a9', 'Vieja', true)]

const routes = (over: Record<string, () => Response | Promise<Response>> = {}) => ({
  'GET /credit-cards?includeArchived=true': () => jsonResponse(200, [card()]),
  'GET /credit-cards/k1/statement': () => jsonResponse(200, statement),
  'GET /installment-purchases?creditCardId=k1': () => jsonResponse(200, [laptop, phone, chair]),
  'GET /categories?includeArchived=true': () => jsonResponse(200, categories),
  'GET /accounts?includeArchived=true': () => jsonResponse(200, accounts),
  ...over,
})

function renderPage() {
  const auth = {
    user: { id: 'u', email: 'a@b.co', name: 'Ana', currency: 'USD' },
    status: 'authenticated' as const,
    login: vi.fn(), register: vi.fn(), logout: vi.fn(),
  }
  return render(
    <QueryClientProvider client={makeClient()}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/tarjetas/k1']}>
          <Routes>
            <Route path="/tarjetas/:id" element={<CardDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

const purchaseCard = (name: string) => screen.getByText(name).closest('[data-testid="purchase"]') as HTMLElement

describe('CardDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 2, 20, 12, 0)) // inside the statement period
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows the card header, debt and available credit', async () => {
    routeFetch(routes())
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Visa' })).toBeInTheDocument()
    expect(screen.getByTestId('header-debt')).toHaveTextContent('500,00')
    expect(screen.getByTestId('header-available')).toHaveTextContent('1.000,00')
  })

  it('shows the statement: purchases, payments, installments due, totals and due date', async () => {
    routeFetch(routes())
    renderPage()
    const panel = (await screen.findByText('Estado de cuenta')).closest('section') as HTMLElement
    expect(await within(panel).findByText('Cena')).toBeInTheDocument()
    expect(within(panel).getByText(/Laptop · cuota 4 de 12/)).toBeInTheDocument()
    expect(within(panel).getByTestId('total-purchases')).toHaveTextContent('40,00')
    expect(within(panel).getByTestId('total-payments')).toHaveTextContent('20,00')
    expect(within(panel).getByTestId('total-due')).toHaveTextContent('100,00')
    expect(within(panel).getByText(/Fecha límite de pago/)).toHaveTextContent('20 abr 2026')
  })

  it('navigates periods: Anterior asks for the day before the start; Siguiente is off in the current one', async () => {
    const calls = routeFetch(
      routes({
        'GET /credit-cards/k1/statement?date=2026-03-05T00:00:00.000Z': () =>
          jsonResponse(200, { ...statement, period: { start: '2026-02-06T00:00:00.000Z', end: '2026-03-05T23:59:59.999Z' } }),
      }),
    )
    renderPage()
    await screen.findByText('Cena')
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    await waitFor(() =>
      expect(calls.some((c) => c.path === '/credit-cards/k1/statement?date=2026-03-05T00:00:00.000Z')).toBe(true),
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled())
  })

  it('lists purchases with progress and an expandable calendar', async () => {
    routeFetch(routes())
    renderPage()
    await screen.findByText('Laptop')
    const laptopCard = purchaseCard('Laptop')
    expect(within(laptopCard).getByText('3 de 12 cuotas pagadas')).toBeInTheDocument()
    expect(within(laptopCard).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
    expect(within(laptopCard).queryByRole('table')).toBeNull()
    await userEvent.click(within(laptopCard).getByRole('button', { name: /calendario/i }))
    const table = within(laptopCard).getByRole('table')
    expect(within(table).getAllByText('Pagada')).toHaveLength(3)
    expect(within(table).getAllByText('Pendiente')).toHaveLength(9)
  })

  it('a fully paid purchase has no Pagar button and is marked Pagada', async () => {
    routeFetch(routes())
    renderPage()
    await screen.findByText('Celular')
    const c = purchaseCard('Celular')
    expect(within(c).queryByRole('button', { name: 'Pagar cuota' })).toBeNull()
    expect(within(c).getByText('Pagada')).toBeInTheDocument()
    expect(within(purchaseCard('Laptop')).getByRole('button', { name: 'Pagar cuota' })).toBeInTheDocument()
  })

  it('creates a purchase with a live preview', async () => {
    const calls = routeFetch(routes({ 'POST /installment-purchases': () => jsonResponse(201, chair) }))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Nueva compra a cuotas/ }))
    await userEvent.type(screen.getByLabelText('Descripción'), 'Moto')
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'c1')
    await userEvent.type(screen.getByLabelText('Monto total'), '1200')
    await userEvent.type(screen.getByLabelText('Cuotas'), '12')
    expect(screen.getByTestId('preview')).toHaveTextContent('100,00')
    await userEvent.type(screen.getByLabelText('Tasa anual (%)'), '12')
    expect(screen.getByTestId('preview')).toHaveTextContent('106,62')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Compra registrada'))
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      creditCardId: 'k1', description: 'Moto', categoryId: 'c1', totalCents: 120000,
      installments: 12, annualRatePercent: 12,
    })
  })

  it('invalid amount or installments show errors, no request, and the preview does not break', async () => {
    const calls = routeFetch(routes())
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Nueva compra a cuotas/ }))
    await userEvent.type(screen.getByLabelText('Descripción'), 'X')
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'c1')
    await userEvent.type(screen.getByLabelText('Monto total'), 'abc')
    await userEvent.type(screen.getByLabelText('Cuotas'), '1')
    expect(screen.getByTestId('preview')).toHaveTextContent('Completa')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Monto no válido')).toBeInTheDocument()
    expect(screen.getByText('Entre 2 y 60 cuotas')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('only offers active expense categories', async () => {
    routeFetch(routes())
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Nueva compra a cuotas/ }))
    expect(screen.getByRole('option', { name: 'Compras' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Salario' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'Antigua' })).toBeNull()
  })

  it('pays the next installment: shows the breakdown and sends one request on a double click', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const withInterest = purchase({
      ...laptop, _id: 'p1', annualRatePercent: 12,
      schedule: Array.from({ length: 12 }, (_, i) => row(i + 1, i < 3, i === 3 ? 9462 : 10000, i === 3 ? 1200 : 0)),
    })
    const calls = routeFetch(
      routes({
        'GET /installment-purchases?creditCardId=k1': () => jsonResponse(200, [withInterest]),
        'POST /installment-purchases/p1/pay': async () => {
          await gate
          return jsonResponse(200, withInterest)
        },
      }),
    )
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Pagar cuota' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByTestId('breakdown')).toHaveTextContent('94,62')
    expect(within(dialog).getByTestId('breakdown')).toHaveTextContent('12,00')
    expect(within(dialog).getByTestId('breakdown')).toHaveTextContent('106,62')
    expect(within(dialog).queryByRole('option', { name: 'Vieja' })).toBeNull() // archived account
    await userEvent.selectOptions(within(dialog).getByLabelText('Cuenta de origen'), 'a1')
    await userEvent.dblClick(within(dialog).getByRole('button', { name: 'Pagar' }))
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
    release()
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Cuota pagada'))
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ accountId: 'a1' })
  })

  it('a 409 when paying toasts the message and keeps the dialog open', async () => {
    routeFetch(
      routes({
        'POST /installment-purchases/p1/pay': () => jsonResponse(409, { message: 'Installment already paid' }),
      }),
    )
    renderPage()
    await screen.findByText('Laptop')
    await userEvent.click(within(purchaseCard('Laptop')).getByRole('button', { name: 'Pagar cuota' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.selectOptions(within(dialog).getByLabelText('Cuenta de origen'), 'a1')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pagar' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Installment already paid'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('requires an account to pay', async () => {
    const calls = routeFetch(routes())
    renderPage()
    await screen.findByText('Laptop')
    await userEvent.click(within(purchaseCard('Laptop')).getByRole('button', { name: 'Pagar cuota' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pagar' }))
    expect(await within(dialog).findByText('Elige una cuenta')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('cannot delete a purchase with paid installments, but can delete one without', async () => {
    const calls = routeFetch(routes({ 'DELETE /installment-purchases/p3': () => jsonResponse(204) }))
    renderPage()
    await screen.findByText('Laptop')
    const del = within(purchaseCard('Laptop')).getByRole('button', { name: 'Eliminar' })
    expect(del).toBeDisabled()
    expect(within(purchaseCard('Laptop')).getByText(/ya tiene cuotas pagadas/)).toBeInTheDocument()

    await userEvent.click(within(purchaseCard('Silla')).getByRole('button', { name: 'Eliminar' }))
    const dialog = await screen.findByRole('dialog')
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Compra eliminada'))
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/installment-purchases/p3')).toBe(true)
  })

  it('edits only the description and category', async () => {
    const calls = routeFetch(routes({ 'PATCH /installment-purchases/p1': () => jsonResponse(200, laptop) }))
    renderPage()
    await screen.findByText('Laptop')
    await userEvent.click(within(purchaseCard('Laptop')).getByRole('button', { name: 'Editar' }))
    expect(screen.queryByLabelText('Monto total')).toBeNull()
    expect(screen.queryByLabelText('Cuotas')).toBeNull()
    const desc = screen.getByLabelText('Descripción')
    await userEvent.clear(desc)
    await userEvent.type(desc, 'Laptop nueva')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Compra actualizada'))
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      description: 'Laptop nueva', categoryId: 'c1', subcategoryId: null,
    })
  })

  it('an archived card cannot get new purchases', async () => {
    routeFetch(routes({ 'GET /credit-cards?includeArchived=true': () => jsonResponse(200, [card({ isArchived: true })]) }))
    renderPage()
    expect(await screen.findByRole('button', { name: /Nueva compra a cuotas/ })).toBeDisabled()
  })
})
