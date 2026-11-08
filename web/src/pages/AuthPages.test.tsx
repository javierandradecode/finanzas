import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { setToken } from '@/lib/token'
import { LoginPage } from './LoginPage'
import { RegisterPage } from './RegisterPage'

const user = { id: '1', email: 'a@b.co', name: 'Ana', currency: 'USD' }
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status })

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<p>home</p>} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('shows validation errors in Spanish on empty submit', async () => {
    vi.stubGlobal('fetch', vi.fn())
    renderAt('/login')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('Correo no válido')).toBeInTheDocument()
    expect(screen.getByText('Ingresa tu contraseña')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('goes home after a successful login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json(200, { accessToken: 't', user })),
    )
    renderAt('/login')
    await userEvent.type(screen.getByLabelText('Correo'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secret')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('home')).toBeInTheDocument()
  })

  it('shows a friendly message on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json(401, { message: 'Unauthorized' })),
    )
    renderAt('/login')
    await userEvent.type(screen.getByLabelText('Correo'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'bad')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Correo o contraseña incorrectos',
    )
  })

  it('shows the connection error when the server is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')))
    renderAt('/login')
    await userEvent.type(screen.getByLabelText('Correo'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo conectar con el servidor',
    )
  })

  it('disables the button while submitting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    renderAt('/login')
    await userEvent.type(screen.getByLabelText('Correo'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('button', { name: 'Entrando…' })).toBeDisabled()
  })

  it('redirects home when there is already a session', async () => {
    setToken('tok')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, user)))
    renderAt('/login')
    expect(await screen.findByText('home')).toBeInTheDocument()
  })
})

describe('RegisterPage', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  async function fill() {
    await userEvent.type(screen.getByLabelText('Nombre'), 'Ana')
    await userEvent.type(screen.getByLabelText('Correo'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Contraseña'), '12345678')
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
  }

  it('requires at least 8 characters', async () => {
    vi.stubGlobal('fetch', vi.fn())
    renderAt('/register')
    await userEvent.type(screen.getByLabelText('Nombre'), 'Ana')
    await userEvent.type(screen.getByLabelText('Correo'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Contraseña'), '123')
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(
      await screen.findByText('La contraseña debe tener al menos 8 caracteres'),
    ).toBeInTheDocument()
  })

  it('goes home after registering', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json(201, { accessToken: 't', user })),
    )
    renderAt('/register')
    await fill()
    expect(await screen.findByText('home')).toBeInTheDocument()
  })

  it('shows a friendly message on 409', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json(409, { message: 'Email already registered' })),
    )
    renderAt('/register')
    await fill()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ese correo ya está registrado',
    )
  })

  it('shows array messages from a 400 joined', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json(400, { message: ['uno', 'dos'] })),
    )
    renderAt('/register')
    await fill()
    expect(await screen.findByRole('alert')).toHaveTextContent('uno, dos')
  })
})
