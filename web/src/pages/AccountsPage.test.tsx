import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { AuthContext } from '@/features/auth/useAuth'
import { jsonResponse, makeClient } from '@/test/utils'
import { AccountsPage } from './AccountsPage'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const cash = { _id: 'a1', type: 'cash', name: 'Caja', balanceCents: 123456, isArchived: false }
const debt = { _id: 'a2', type: 'checking', name: 'Sobregiro', balanceCents: -5000, isArchived: false }
const old = { _id: 'a3', type: 'savings', name: 'Vieja', balanceCents: 999, isArchived: true }

type Call = { path: string; method: string; body?: unknown }

/** Routes fetch by "METHOD path"; records every call. */
function routeFetch(routes: Record<string, () => Response>) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const path = url.replace(/^https?:\/\/[^/]+\/api/, '')
      const method = init?.method ?? 'GET'
      calls.push({ path, method, body: init?.body ? JSON.parse(init.body as string) : undefined })
      const handler = routes[`${method} ${path}`]
      return Promise.resolve(handler ? handler() : jsonResponse(404, { message: 'no route' }))
    }),
  )
  return calls
}

function renderPage() {
  const auth = {
    user: { id: 'u', email: 'a@b.co', name: 'Ana', currency: 'USD' },
    status: 'authenticated' as const,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }
  return render(
    <QueryClientProvider client={makeClient()}>
      <AuthContext.Provider value={auth}>
        <AccountsPage />
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

describe('AccountsPage', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('lists accounts with formatted balances and the total of active ones', async () => {
    routeFetch({ 'GET /accounts': () => jsonResponse(200, [cash, debt]) })
    renderPage()
    expect(await screen.findByText('Caja')).toBeInTheDocument()
    const balances = screen.getAllByTestId('balance')
    expect(balances[0]).toHaveTextContent('1.234,56')
    expect(balances[0]).not.toHaveClass('text-destructive')
    expect(balances[1]).toHaveTextContent('-')
    expect(balances[1]).toHaveClass('text-destructive')
    expect(screen.getByText(/Saldo total/)).toHaveTextContent('1.184,56')
  })

  it('shows an empty state with a call to action', async () => {
    routeFetch({ 'GET /accounts': () => jsonResponse(200, []) })
    renderPage()
    expect(await screen.findByText('Aún no tienes cuentas.')).toBeInTheDocument()
  })

  it('creates an account sending the balance in cents', async () => {
    const calls = routeFetch({
      'GET /accounts': () => jsonResponse(200, []),
      'POST /accounts': () => jsonResponse(201, cash),
    })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Nueva cuenta/ }))
    await userEvent.type(screen.getByLabelText('Nombre'), 'Caja chica')
    await userEvent.type(screen.getByLabelText('Saldo inicial'), '100,50')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Cuenta creada'))
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      name: 'Caja chica',
      type: 'cash',
      initialBalanceCents: 10050,
    })
  })

  it('rejects an invalid balance without calling the API', async () => {
    const calls = routeFetch({ 'GET /accounts': () => jsonResponse(200, []) })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Nueva cuenta/ }))
    await userEvent.type(screen.getByLabelText('Nombre'), 'X')
    await userEvent.type(screen.getByLabelText('Saldo inicial'), 'abc')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Monto no válido')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('keeps the dialog open and toasts the API error', async () => {
    routeFetch({
      'GET /accounts': () => jsonResponse(200, []),
      'POST /accounts': () => jsonResponse(400, { message: ['name is invalid'] }),
    })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Nueva cuenta/ }))
    await userEvent.type(screen.getByLabelText('Nombre'), 'Caja')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('name is invalid'))
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument()
  })

  it('edits name and type without a balance field', async () => {
    const calls = routeFetch({
      'GET /accounts': () => jsonResponse(200, [cash]),
      'PATCH /accounts/a1': () => jsonResponse(200, cash),
    })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    expect(screen.queryByLabelText('Saldo inicial')).toBeNull()
    await userEvent.clear(screen.getByLabelText('Nombre'))
    await userEvent.type(screen.getByLabelText('Nombre'), 'Caja 2')
    await userEvent.click(screen.getByRole('button', { name: 'Ahorros' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Cuenta actualizada'))
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      name: 'Caja 2',
      type: 'savings',
    })
  })

  it('archives after confirming', async () => {
    const calls = routeFetch({
      'GET /accounts': () => jsonResponse(200, [cash]),
      'DELETE /accounts/a1': () => jsonResponse(204),
    })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Archivar' }))
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Archivar' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Cuenta archivada'))
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/accounts/a1')).toBe(true)
  })

  it('shows archived accounts on demand and restores them', async () => {
    const calls = routeFetch({
      'GET /accounts': () => jsonResponse(200, [cash]),
      'GET /accounts?includeArchived=true': () => jsonResponse(200, [cash, old]),
      'PATCH /accounts/a3': () => jsonResponse(200, { ...old, isArchived: false }),
    })
    renderPage()
    await screen.findByText('Caja')
    expect(screen.queryByText('Vieja')).toBeNull()
    await userEvent.click(screen.getByRole('switch', { name: 'Mostrar archivadas' }))
    expect(await screen.findByText('Vieja')).toBeInTheDocument()
    // archived balances do not count in the total
    expect(screen.getByText(/Saldo total/)).toHaveTextContent('1.234,56')
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Cuenta restaurada'))
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ isArchived: false })
  })
})
