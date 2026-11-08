import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { jsonResponse, makeClient } from '@/test/utils'
import { CategoriesPage } from './CategoriesPage'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const food = {
  _id: 'c1',
  type: 'expense',
  name: 'Alimentación',
  icon: 'utensils',
  color: '#f97316',
  isArchived: false,
  subcategories: [
    { _id: 's1', name: 'Supermercado', isArchived: false },
    { _id: 's2', name: 'Antigua', isArchived: true },
  ],
}
const salary = {
  _id: 'c2',
  type: 'income',
  name: 'Salario',
  icon: 'briefcase',
  color: '#16a34a',
  isArchived: false,
  subcategories: [],
}
const weird = {
  _id: 'c3',
  type: 'expense',
  name: 'Rara',
  icon: 'icon-that-does-not-exist',
  color: '#123456',
  isArchived: false,
  subcategories: [],
}
const archivedCat = { ...food, _id: 'c4', name: 'Vieja', isArchived: true, subcategories: [] }

function routeFetch(routes: Record<string, () => Response>) {
  const calls: { path: string; method: string; body?: unknown }[] = []
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

const renderPage = () =>
  render(
    <QueryClientProvider client={makeClient()}>
      <CategoriesPage />
    </QueryClientProvider>,
  )

const list = (...cats: unknown[]) => () => jsonResponse(200, cats)

describe('CategoriesPage', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('splits expenses and income into tabs', async () => {
    routeFetch({ 'GET /categories': list(food, salary) })
    renderPage()
    expect(await screen.findByText('Alimentación')).toBeInTheDocument()
    expect(screen.queryByText('Salario')).toBeNull()
    await userEvent.click(screen.getByRole('tab', { name: 'Ingresos' }))
    expect(screen.getByText('Salario')).toBeInTheDocument()
    expect(screen.queryByText('Alimentación')).toBeNull()
  })

  it('shows an empty state per tab', async () => {
    routeFetch({ 'GET /categories': list(food) })
    renderPage()
    await screen.findByText('Alimentación')
    await userEvent.click(screen.getByRole('tab', { name: 'Ingresos' }))
    expect(screen.getByText('No hay categorías de ingresos.')).toBeInTheDocument()
  })

  it('creates a category of the active tab with the chosen icon and color', async () => {
    const calls = routeFetch({
      'GET /categories': list(food),
      'POST /categories': () => jsonResponse(201, salary),
    })
    renderPage()
    await screen.findByText('Alimentación')
    await userEvent.click(screen.getByRole('tab', { name: 'Ingresos' }))
    await userEvent.click(screen.getByRole('button', { name: /Nueva categoría/ }))
    await userEvent.type(screen.getByLabelText('Nombre'), 'Freelance')
    await userEvent.click(screen.getByRole('button', { name: 'Icono dumbbell' }))
    await userEvent.click(screen.getByRole('button', { name: 'Color #ef4444' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Categoría creada'))
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      type: 'income',
      name: 'Freelance',
      icon: 'dumbbell',
      color: '#ef4444',
    })
  })

  it('toasts API errors and keeps the dialog open', async () => {
    routeFetch({
      'GET /categories': list(),
      'POST /categories': () => jsonResponse(409, { message: 'Category already exists' }),
    })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Nueva categoría/ }))
    await userEvent.type(screen.getByLabelText('Nombre'), 'Dup')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Category already exists'))
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument()
  })

  it('renders a category with an unknown icon and an off-palette color, and keeps them when editing', async () => {
    const calls = routeFetch({
      'GET /categories': list(weird),
      'PATCH /categories/c3': () => jsonResponse(200, weird),
    })
    renderPage()
    expect(await screen.findByText('Rara')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.getByRole('button', { name: 'Color #123456' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Categoría actualizada'))
    expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({
      name: 'Rara',
      icon: 'icon-that-does-not-exist',
      color: '#123456',
    })
  })

  it('manages subcategories: add, rename, archive and restore', async () => {
    const calls = routeFetch({
      'GET /categories': list(food),
      'GET /categories?includeArchived=true': list(food),
      'POST /categories/c1/subcategories': () => jsonResponse(201, food),
      'PATCH /categories/c1/subcategories/s1': () => jsonResponse(200, food),
      'PATCH /categories/c1/subcategories/s2': () => jsonResponse(200, food),
      'DELETE /categories/c1/subcategories/s1': () => jsonResponse(204),
    })
    renderPage()
    await screen.findByText('Alimentación')
    expect(screen.queryByText('Supermercado')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Subcategorías \(1\)/ }))
    expect(screen.getByText('Supermercado')).toBeInTheDocument()
    expect(screen.queryByText('Antigua')).toBeNull() // archived hidden by default

    await userEvent.type(screen.getByLabelText('Nueva subcategoría'), 'Mercado')
    await userEvent.click(screen.getByRole('button', { name: 'Añadir' }))
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ name: 'Mercado' }),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Renombrar Supermercado' }))
    const rename = screen.getByLabelText('Nuevo nombre')
    await userEvent.clear(rename)
    await userEvent.type(rename, 'Súper')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }))
    await waitFor(() =>
      expect(calls.find((c) => c.path.endsWith('/s1') && c.method === 'PATCH')?.body).toEqual({
        name: 'Súper',
      }),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Archivar Supermercado' }))
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'DELETE' && c.path.endsWith('/s1'))).toBe(true),
    )

    await userEvent.click(screen.getByRole('switch', { name: 'Mostrar archivadas' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Restaurar Antigua' }))
    await waitFor(() =>
      expect(calls.find((c) => c.path.endsWith('/s2') && c.method === 'PATCH')?.body).toEqual({
        isArchived: false,
      }),
    )
  })

  it('archives a category after confirming', async () => {
    const calls = routeFetch({
      'GET /categories': list(salary),
      'DELETE /categories/c2': () => jsonResponse(204),
    })
    renderPage()
    await userEvent.click(await screen.findByRole('tab', { name: 'Ingresos' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Archivar' }))
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Archivar' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Categoría archivada'))
  })

  it('shows and restores archived categories', async () => {
    const calls = routeFetch({
      'GET /categories': list(food),
      'GET /categories?includeArchived=true': list(food, archivedCat),
      'PATCH /categories/c4': () => jsonResponse(200, archivedCat),
    })
    renderPage()
    await screen.findByText('Alimentación')
    await userEvent.click(screen.getByRole('switch', { name: 'Mostrar archivadas' }))
    expect(await screen.findByText('Vieja')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Categoría restaurada'))
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ isArchived: false })
  })
})
