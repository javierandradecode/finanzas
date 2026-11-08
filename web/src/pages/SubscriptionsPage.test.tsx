import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { AuthContext } from '@/features/auth/useAuth'
import { jsonResponse, makeClient, routeFetch } from '@/test/utils'
import { SubscriptionsPage } from './SubscriptionsPage'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const acc = (_id: string, name: string, isArchived = false) => ({ _id, name, type: 'cash', balanceCents: 0, isArchived })
const accounts = [acc('a1', 'Caja'), acc('a9', 'Vieja', true)]
const cards = [
  { _id: 'k1', name: 'Visa', limitCents: 0, cutoffDay: 1, paymentDay: 10, annualRatePercent: 0, debtCents: 0, availableCents: 0, isArchived: false },
]
const cat = (over: object) => ({ icon: 'tag', color: '#000000', isArchived: false, subcategories: [], ...over })
const categories = [
  cat({ _id: 'c1', type: 'expense', name: 'Entretenimiento' }),
  cat({ _id: 'c2', type: 'expense', name: 'Servicios' }),
  cat({ _id: 'c9', type: 'expense', name: 'Antigua', isArchived: true }),
]

const netflix = {
  _id: 's1', name: 'Netflix', amountCents: 999, frequency: 'monthly', nextDate: '2026-12-15T00:00:00.000Z',
  anchorDay: 15, accountId: 'a1', categoryId: 'c1', active: true,
}
const spotify = {
  _id: 's2', name: 'Dominio', amountCents: 1200, frequency: 'yearly', nextDate: '2027-01-10T00:00:00.000Z',
  anchorDay: 10, creditCardId: 'k1', categoryId: 'c2', active: true,
  lastError: 'Credit card is archived', lastErrorAt: '2026-11-07T00:05:00.000Z',
}
const paused = {
  _id: 's3', name: 'Revista', amountCents: 1000, frequency: 'weekly', nextDate: '2026-11-20T00:00:00.000Z',
  anchorDay: 20, accountId: 'a9', categoryId: 'c9', active: false,
}

const upcoming = [
  { subscriptionId: 's1', name: 'Netflix', amountCents: 999, date: '2026-11-01T00:00:00.000Z', overdue: true, frequency: 'monthly', accountId: 'a1', categoryId: 'c1' },
  { subscriptionId: 's2', name: 'Dominio', amountCents: 1200, date: '2026-12-10T00:00:00.000Z', overdue: false, frequency: 'yearly', creditCardId: 'k1', categoryId: 'c2' },
]

const lists = {
  'GET /accounts?includeArchived=true': () => jsonResponse(200, accounts),
  'GET /credit-cards?includeArchived=true': () => jsonResponse(200, cards),
  'GET /categories?includeArchived=true': () => jsonResponse(200, categories),
  'GET /subscriptions/upcoming?days=30': () => jsonResponse(200, []),
}

function renderPage() {
  const auth = {
    user: { id: 'u', email: 'a@b.co', name: 'Ana', currency: 'USD' },
    status: 'authenticated' as const,
    login: vi.fn(), register: vi.fn(), logout: vi.fn(),
  }
  return render(
    <QueryClientProvider client={makeClient()}>
      <AuthContext.Provider value={auth}>
        <SubscriptionsPage />
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

const withSubs = (subs: unknown[], extra: Record<string, () => Response | Promise<Response>> = {}) => ({
  ...lists,
  'GET /subscriptions': () => jsonResponse(200, subs),
  ...extra,
})
const rows = () => screen.getAllByTestId('subscription')
const rowOf = (name: string) => rows().find((r) => within(r).queryByText(name)) as HTMLElement

describe('SubscriptionsPage', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('summarizes the active subscriptions and their monthly cost, ignoring paused ones', async () => {
    routeFetch(withSubs([netflix, spotify, paused]))
    renderPage()
    await screen.findByText('Netflix')
    const summary = screen.getByTestId('summary')
    expect(summary).toHaveTextContent('2 suscripciones activas')
    expect(summary).toHaveTextContent('10,99') // 9,99 + 12,00 / 12
  })

  it('lists amount with its unit, payer and category, paused ones last and dimmed', async () => {
    routeFetch(withSubs([paused, spotify, netflix]))
    renderPage()
    await screen.findByText('Netflix')
    const [first, second, last] = rows()
    expect(within(first).getByText('Netflix')).toBeInTheDocument()
    expect(within(first).getByText(/9,99.*\/ mes/)).toBeInTheDocument()
    expect(within(first).getByText(/Caja/)).toBeInTheDocument()
    expect(within(first).getByText(/Entretenimiento/)).toBeInTheDocument()
    expect(within(first).getByText(/15 dic 2026/)).toBeInTheDocument()
    expect(within(second).getByText('Dominio')).toBeInTheDocument()
    expect(within(second).getByText(/12,00.*\/ año/)).toBeInTheDocument()
    expect(within(second).getByText(/Visa/)).toBeInTheDocument()
    // paused: archived account and category still show their names
    expect(within(last).getByText('Revista')).toBeInTheDocument()
    expect(within(last).getByText('Pausada')).toBeInTheDocument()
    expect(within(last).getByText(/Vieja/)).toBeInTheDocument()
    expect(within(last).getByText(/Antigua/)).toBeInTheDocument()
    expect(last).toHaveClass('opacity-60')
  })

  it('shows the last charge error of a subscription', async () => {
    routeFetch(withSubs([netflix, spotify]))
    renderPage()
    await screen.findByText('Dominio')
    expect(within(rowOf('Dominio')).getByRole('alert')).toHaveTextContent('Credit card is archived')
    expect(within(rowOf('Netflix')).queryByRole('alert')).toBeNull()
  })

  it('has an empty state with a call to action', async () => {
    routeFetch(withSubs([]))
    renderPage()
    expect(await screen.findByText('Aún no tienes suscripciones.')).toBeInTheDocument()
  })

  it('pauses after confirming', async () => {
    const calls = routeFetch(withSubs([netflix], { 'DELETE /subscriptions/s1': () => jsonResponse(204) }))
    renderPage()
    await screen.findByText('Netflix')
    await userEvent.click(within(rowOf('Netflix')).getByRole('button', { name: 'Pausar' }))
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pausar' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Suscripción pausada'))
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/subscriptions/s1')).toBe(true)
  })

  it('reactivates a paused one without asking', async () => {
    const calls = routeFetch(withSubs([paused], { 'PATCH /subscriptions/s3': () => jsonResponse(200, paused) }))
    renderPage()
    await screen.findByText('Revista')
    expect(within(rowOf('Revista')).queryByRole('button', { name: 'Pausar' })).toBeNull()
    await userEvent.click(within(rowOf('Revista')).getByRole('button', { name: 'Reactivar' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Suscripción reactivada'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ active: true })
  })

  it('opens the edit dialog with the subscription data', async () => {
    routeFetch(withSubs([netflix]))
    renderPage()
    await screen.findByText('Netflix')
    await userEvent.click(within(rowOf('Netflix')).getByRole('button', { name: 'Editar' }))
    expect(await screen.findByText('Editar suscripción')).toBeInTheDocument()
    expect(await screen.findByLabelText('Nombre')).toHaveValue('Netflix')
  })

  it('lists upcoming charges with an Atrasado tag for the overdue ones', async () => {
    routeFetch(withSubs([netflix, spotify], { 'GET /subscriptions/upcoming?days=30': () => jsonResponse(200, upcoming) }))
    renderPage()
    const panel = (await screen.findByText('Próximos 30 días')).closest('section') as HTMLElement
    const items = await within(panel).findAllByTestId('upcoming')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Netflix')).toBeInTheDocument()
    expect(within(items[0]).getByText('Atrasado')).toBeInTheDocument()
    expect(within(items[1]).queryByText('Atrasado')).toBeNull()
    expect(within(items[1]).getByText(/12,00/)).toBeInTheDocument()
  })

  it('says so when nothing is coming', async () => {
    routeFetch(withSubs([netflix]))
    renderPage()
    expect(await screen.findByText('Sin cobros en los próximos 30 días.')).toBeInTheDocument()
  })

  describe('Cobrar vencidos ahora', () => {
    const click = async () =>
      userEvent.click(await screen.findByRole('button', { name: 'Cobrar vencidos ahora' }))
    const process = (body: unknown) => ({ 'POST /subscriptions/process-due': () => jsonResponse(200, body) })

    it('reports how many charges were made', async () => {
      routeFetch(withSubs([netflix], process({ charged: 2, failed: [] })))
      renderPage()
      await click()
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('2 cobros realizados'))
    })

    it('uses the singular for one', async () => {
      routeFetch(withSubs([netflix], process({ charged: 1, failed: [] })))
      renderPage()
      await click()
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('1 cobro realizado'))
    })

    it('says there was nothing due', async () => {
      routeFetch(withSubs([netflix], process({ charged: 0, failed: [] })))
      renderPage()
      await click()
      await waitFor(() => expect(toast.info).toHaveBeenCalledWith('No había cobros vencidos'))
      expect(toast.success).not.toHaveBeenCalled()
    })

    it('reports failures with the subscription name and the reason', async () => {
      routeFetch(
        withSubs(
          [netflix],
          process({ charged: 0, failed: [{ subscriptionId: 's1', name: 'Netflix', error: 'Account is archived' }] }),
        ),
      )
      renderPage()
      await click()
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Netflix')),
      )
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Account is archived'))
      expect(toast.info).not.toHaveBeenCalled()
      expect(toast.success).not.toHaveBeenCalled()
    })

    it('is disabled while running: a double click sends one request', async () => {
      let release!: () => void
      const gate = new Promise<void>((r) => (release = r))
      const calls = routeFetch(
        withSubs([netflix], {
          'POST /subscriptions/process-due': async () => {
            await gate
            return jsonResponse(200, { charged: 0, failed: [] })
          },
        }),
      )
      renderPage()
      const button = await screen.findByRole('button', { name: 'Cobrar vencidos ahora' })
      await userEvent.dblClick(button)
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
      expect(button).toBeDisabled()
      release()
      await waitFor(() => expect(toast.info).toHaveBeenCalled())
    })
  })
})
