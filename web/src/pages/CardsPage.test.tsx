import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { toast } from 'sonner'
import { AuthContext } from '@/features/auth/useAuth'
import { jsonResponse, makeClient, routeFetch } from '@/test/utils'
import { CardsPage } from './CardsPage'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const card = (over: object) => ({
  _id: 'k1', name: 'Visa', limitCents: 150000, cutoffDay: 5, paymentDay: 20,
  annualRatePercent: 18.5, debtCents: 50000, availableCents: 100000, isArchived: false, ...over,
})
const visa = card({})
const over = card({ _id: 'k2', name: 'Mastercard', limitCents: 100000, debtCents: 120000, availableCents: -20000 })
const old = card({ _id: 'k3', name: 'Vieja', isArchived: true })

const PROJECTION = 'GET /installment-purchases/projection?months=12'
const projection = [
  { month: '2026-03', principalCents: 9000, interestCents: 1000, paymentCents: 10000, count: 3 },
  { month: '2026-04', principalCents: 9000, interestCents: 1000, paymentCents: 10000, count: 3 },
]

function renderPage() {
  const auth = {
    user: { id: 'u', email: 'a@b.co', name: 'Ana', currency: 'USD' },
    status: 'authenticated' as const,
    login: vi.fn(), register: vi.fn(), logout: vi.fn(),
  }
  return render(
    <QueryClientProvider client={makeClient()}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter>
          <CardsPage />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

const base = { [PROJECTION]: () => jsonResponse(200, []) }
const openNew = async () =>
  userEvent.click(await screen.findByRole('button', { name: /Nueva tarjeta/ }))
const fill = async (label: string, text: string) => {
  const input = screen.getByLabelText(label)
  await userEvent.clear(input)
  await userEvent.type(input, text)
}

describe('CardsPage', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('shows debt, available credit, days and the usage bar', async () => {
    routeFetch({ ...base, 'GET /credit-cards': () => jsonResponse(200, [visa]) })
    renderPage()
    expect(await screen.findByText('Visa')).toBeInTheDocument()
    expect(screen.getByText(/Corte día 5 · Pago día 20/)).toBeInTheDocument()
    expect(screen.getByTestId('debt')).toHaveTextContent('500,00')
    expect(screen.getByTestId('available')).toHaveTextContent('1.000,00')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33')
  })

  it('caps the bar at 100 % but shows the real debt when over the limit', async () => {
    routeFetch({ ...base, 'GET /credit-cards': () => jsonResponse(200, [over]) })
    renderPage()
    await screen.findByText('Mastercard')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    expect(screen.getByTestId('debt')).toHaveTextContent('1.200,00')
  })

  it('has an empty state with a call to action', async () => {
    routeFetch({ ...base, 'GET /credit-cards': () => jsonResponse(200, []) })
    renderPage()
    expect(await screen.findByText('Aún no tienes tarjetas.')).toBeInTheDocument()
  })

  it('links to the detail page', async () => {
    routeFetch({ ...base, 'GET /credit-cards': () => jsonResponse(200, [visa]) })
    renderPage()
    expect(await screen.findByRole('link', { name: 'Ver detalle' })).toHaveAttribute(
      'href',
      '/tarjetas/k1',
    )
  })

  it('creates a card sending cents and numbers, without an empty initial debt', async () => {
    const calls = routeFetch({
      ...base,
      'GET /credit-cards': () => jsonResponse(200, []),
      'POST /credit-cards': () => jsonResponse(201, visa),
    })
    renderPage()
    await openNew()
    await fill('Nombre', 'Visa')
    await fill('Cupo', '1.500,00')
    await fill('Día de corte', '5')
    await fill('Día de pago', '20')
    await fill('Tasa anual (%)', '18,5')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Tarjeta creada'))
    const body = calls.find((c) => c.method === 'POST')?.body
    expect(body).toEqual({
      name: 'Visa', limitCents: 150000, cutoffDay: 5, paymentDay: 20, annualRatePercent: 18.5,
    })
  })

  it('sends the initial debt when given', async () => {
    const calls = routeFetch({
      ...base,
      'GET /credit-cards': () => jsonResponse(200, []),
      'POST /credit-cards': () => jsonResponse(201, visa),
    })
    renderPage()
    await openNew()
    await fill('Nombre', 'Visa')
    await fill('Cupo', '1000')
    await fill('Día de corte', '5')
    await fill('Día de pago', '20')
    await fill('Deuda inicial', '250')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      initialDebtCents: 25000,
      annualRatePercent: 0,
    })
  })

  it('validates days and rate before calling the API', async () => {
    const calls = routeFetch({ ...base, 'GET /credit-cards': () => jsonResponse(200, []) })
    renderPage()
    await openNew()
    await fill('Nombre', 'Visa')
    await fill('Cupo', '1000')
    await fill('Día de corte', '32')
    await fill('Día de pago', '20')
    await fill('Tasa anual (%)', 'abc')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Elige un día entre 1 y 31')).toBeInTheDocument()
    expect(screen.getByText('Tasa no válida')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('edits a card without the initial debt field', async () => {
    const calls = routeFetch({
      ...base,
      'GET /credit-cards': () => jsonResponse(200, [visa]),
      'PATCH /credit-cards/k1': () => jsonResponse(200, visa),
    })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    expect(screen.queryByLabelText('Deuda inicial')).toBeNull()
    expect(screen.getByLabelText('Tasa anual (%)')).toHaveValue('18,5')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Tarjeta actualizada'))
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      name: 'Visa', limitCents: 150000, cutoffDay: 5, paymentDay: 20, annualRatePercent: 18.5,
    })
  })

  it('keeps the dialog open and toasts an API error', async () => {
    routeFetch({
      ...base,
      'GET /credit-cards': () => jsonResponse(200, []),
      'POST /credit-cards': () => jsonResponse(400, { message: ['limitCents must be positive'] }),
    })
    renderPage()
    await openNew()
    await fill('Nombre', 'Visa')
    await fill('Cupo', '1000')
    await fill('Día de corte', '5')
    await fill('Día de pago', '20')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('limitCents must be positive'))
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument()
  })

  it('archives after confirming, and restores from the archived list', async () => {
    const calls = routeFetch({
      ...base,
      'GET /credit-cards': () => jsonResponse(200, [visa]),
      'GET /credit-cards?includeArchived=true': () => jsonResponse(200, [visa, old]),
      'DELETE /credit-cards/k1': () => jsonResponse(204),
      'PATCH /credit-cards/k3': () => jsonResponse(200, old),
    })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Archivar' }))
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Archivar' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Tarjeta archivada'))

    await userEvent.click(screen.getByRole('switch', { name: 'Mostrar archivadas' }))
    expect(await screen.findByText('Vieja')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Tarjeta restaurada'))
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ isArchived: false })
  })

  it('lists the upcoming installment payments by month', async () => {
    routeFetch({
      [PROJECTION]: () => jsonResponse(200, projection),
      'GET /credit-cards': () => jsonResponse(200, [visa]),
    })
    renderPage()
    expect(await screen.findByText('marzo de 2026')).toBeInTheDocument()
    expect(screen.getAllByText('3 cuotas')).toHaveLength(2)
    expect(screen.getAllByText(/100,00/).length).toBeGreaterThan(0)
  })

  it('hides months without installments and capitalizes only the first letter', async () => {
    routeFetch({
      [PROJECTION]: () =>
        jsonResponse(200, [
          ...projection,
          { month: '2026-05', principalCents: 0, interestCents: 0, paymentCents: 0, count: 0 },
        ]),
      'GET /credit-cards': () => jsonResponse(200, [visa]),
    })
    renderPage()
    await screen.findByText('marzo de 2026')
    expect(screen.queryByText('mayo de 2026')).toBeNull()
    expect(screen.getByText('marzo de 2026')).toHaveClass('first-letter:uppercase')
    expect(screen.getByText('marzo de 2026')).not.toHaveClass('capitalize')
  })

  it('says so when every month is empty', async () => {
    routeFetch({
      [PROJECTION]: () =>
        jsonResponse(200, [
          { month: '2026-03', principalCents: 0, interestCents: 0, paymentCents: 0, count: 0 },
        ]),
      'GET /credit-cards': () => jsonResponse(200, [visa]),
    })
    renderPage()
    expect(await screen.findByText('Sin cuotas pendientes.')).toBeInTheDocument()
  })

  it('says so when no installments are pending', async () => {
    routeFetch({ ...base, 'GET /credit-cards': () => jsonResponse(200, [visa]) })
    renderPage()
    expect(await screen.findByText('Sin cuotas pendientes.')).toBeInTheDocument()
  })
})
