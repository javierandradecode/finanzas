import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './AuthProvider'
import { RequireAuth } from './RequireAuth'
import { useAuth } from './useAuth'
import { getToken, setToken } from '@/lib/token'

const user = { id: '1', email: 'a@b.co', name: 'Ana', currency: 'USD' }

function Private() {
  const { user, logout, login } = useAuth()
  return (
    <div>
      <p>private {user?.name}</p>
      <button onClick={logout}>logout</button>
      <button onClick={() => void login({ email: 'a@b.co', password: 'x' })}>
        login
      </button>
    </div>
  )
}

function renderApp(path = '/') {
  const client = new QueryClient()
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<p>login page</p>} />
            <Route element={<RequireAuth />}>
              <Route path="/" element={<Private />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...view, client }
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status })
}

describe('RequireAuth + AuthProvider', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('redirects to /login without a token and never calls the API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderApp()
    expect(await screen.findByText('login page')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('restores the session through /auth/me', async () => {
    setToken('tok')
    const fetchMock = vi.fn().mockResolvedValue(json(200, user))
    vi.stubGlobal('fetch', fetchMock)
    renderApp()
    expect(await screen.findByText('private Ana')).toBeInTheDocument()
    expect(String(fetchMock.mock.calls[0][0])).toContain('/auth/me')
  })

  it('clears an expired token (401) and goes to /login', async () => {
    setToken('old')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(json(401, { message: 'Unauthorized' })),
      ),
    )
    renderApp()
    expect(await screen.findByText('login page')).toBeInTheDocument()
    expect(getToken()).toBeNull()
  })

  it('goes anonymous on a network error while restoring', async () => {
    setToken('tok')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')))
    renderApp()
    expect(await screen.findByText('login page')).toBeInTheDocument()
  })

  it('logout clears the token and redirects', async () => {
    setToken('tok')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, user)))
    renderApp()
    await userEvent.click(await screen.findByText('logout'))
    expect(await screen.findByText('login page')).toBeInTheDocument()
    expect(getToken()).toBeNull()
  })

  it('logout empties the query cache', async () => {
    setToken('tok')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, user)))
    const { client } = renderApp()
    client.setQueryData(['secret'], 1)
    await userEvent.click(await screen.findByText('logout'))
    await screen.findByText('login page')
    expect(client.getQueryData(['secret'])).toBeUndefined()
  })

  it('login stores the token and authenticates', async () => {
    setToken('tok')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, user))
      .mockResolvedValueOnce(json(200, { accessToken: 'new', user }))
    vi.stubGlobal('fetch', fetchMock)
    renderApp()
    await userEvent.click(await screen.findByText('login'))
    await waitFor(() => expect(getToken()).toBe('new'))
    expect(screen.getByText('private Ana')).toBeInTheDocument()
  })
})
