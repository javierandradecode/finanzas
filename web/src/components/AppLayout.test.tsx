import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { toast } from 'sonner'
import { AuthContext } from '@/features/auth/useAuth'
import { jsonResponse, makeClient, routeFetch } from '@/test/utils'
import { AppLayout } from './AppLayout'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const PROCESS = 'POST /subscriptions/process-due'

function renderLayout() {
  const auth = {
    user: { id: 'u', email: 'a@b.co', name: 'Ana', currency: 'USD' },
    status: 'authenticated' as const,
    login: vi.fn(), register: vi.fn(), logout: vi.fn(),
  }
  return render(
    <StrictMode>
      <QueryClientProvider client={makeClient()}>
        <AuthContext.Provider value={auth}>
          <MemoryRouter initialEntries={['/uno']}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/uno" element={<Link to="/dos">ir a dos</Link>} />
                <Route path="/dos" element={<p>página dos</p>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    </StrictMode>,
  )
}

const processCalls = (calls: { path: string; method: string }[]) =>
  calls.filter((c) => c.path === '/subscriptions/process-due' && c.method === 'POST')

describe('AppLayout collects due subscriptions', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('calls process-due exactly once on open, even in StrictMode, and not when navigating', async () => {
    const calls = routeFetch({ [PROCESS]: () => jsonResponse(200, { charged: 0, failed: [] }) })
    renderLayout()
    await waitFor(() => expect(processCalls(calls)).toHaveLength(1))
    await userEvent.click(screen.getByText('ir a dos'))
    await screen.findByText('página dos')
    await new Promise((r) => setTimeout(r, 50))
    expect(processCalls(calls)).toHaveLength(1)
  })

  it('announces what was charged (plural)', async () => {
    routeFetch({ [PROCESS]: () => jsonResponse(200, { charged: 2, failed: [] }) })
    renderLayout()
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Se registraron 2 cobros de suscripciones'),
    )
  })

  it('announces what was charged (singular)', async () => {
    routeFetch({ [PROCESS]: () => jsonResponse(200, { charged: 1, failed: [] }) })
    renderLayout()
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Se registró 1 cobro de suscripción'),
    )
  })

  it('stays quiet when nothing was due', async () => {
    const calls = routeFetch({ [PROCESS]: () => jsonResponse(200, { charged: 0, failed: [] }) })
    renderLayout()
    await waitFor(() => expect(processCalls(calls)).toHaveLength(1))
    await new Promise((r) => setTimeout(r, 50))
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('does not bother the user when the call fails', async () => {
    const calls = routeFetch({ [PROCESS]: () => jsonResponse(500, { message: 'boom' }) })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderLayout()
    await waitFor(() => expect(processCalls(calls)).toHaveLength(1))
    await waitFor(() => expect(log).toHaveBeenCalled())
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    log.mockRestore()
  })
})
