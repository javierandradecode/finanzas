import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { AuthContext } from '@/features/auth/useAuth'
import { jsonResponse, makeClient, routeFetch } from '@/test/utils'
import { BudgetsPage } from './BudgetsPage'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const item = (over: object) => ({
  budgetId: 'b?', categoryId: 'c?', name: 'X', icon: 'tag', color: '#000000',
  limitCents: 10000, spentCents: 0, remainingCents: 10000, percentUsed: 0, overBudget: false, ...over,
})
const food = item({ budgetId: 'b1', categoryId: 'c1', name: 'Alimentación', limitCents: 40000, spentCents: 50000, remainingCents: -10000, percentUsed: 125, overBudget: true })
const transport = item({ budgetId: 'b2', categoryId: 'c2', name: 'Transporte', limitCents: 10000, spentCents: 8000, remainingCents: 2000, percentUsed: 80 })
const fun = item({ budgetId: 'b3', categoryId: 'c3', name: 'Entretenimiento', limitCents: 20000, spentCents: 0, remainingCents: 20000, percentUsed: 0 })
const old = item({ budgetId: 'b4', categoryId: 'c9', name: 'Antigua', limitCents: 5000, spentCents: 500, remainingCents: 4500, percentUsed: 10 })
const report = (items: unknown[], totals = { limitCents: 70000, spentCents: 58000, overBudgetCount: 1 }) =>
  jsonResponse(200, { month: '2026-11', items, totals })

const cat = (over: { _id: string; type: string; name: string; isArchived?: boolean }) => ({
  icon: 'tag', color: '#000000', isArchived: false, subcategories: [], ...over,
})
const categories = [
  cat({ _id: 'c1', type: 'expense', name: 'Alimentación' }),
  cat({ _id: 'c2', type: 'expense', name: 'Transporte' }),
  cat({ _id: 'c3', type: 'expense', name: 'Entretenimiento' }),
  cat({ _id: 'c4', type: 'expense', name: 'Salud' }),
  cat({ _id: 'c5', type: 'income', name: 'Salario' }),
  cat({ _id: 'c9', type: 'expense', name: 'Antigua', isArchived: true }),
]
const lists = { 'GET /categories?includeArchived=true': () => jsonResponse(200, categories) }
const NOV = 'GET /reports/budget-vs-spent?month=2026-11'

function Where() {
  return <p data-testid="where">{useLocation().search}</p>
}

function renderPage(initial = '/presupuestos') {
  const auth = {
    user: { id: 'u', email: 'a@b.co', name: 'Ana', currency: 'USD' },
    status: 'authenticated' as const,
    login: vi.fn(), register: vi.fn(), logout: vi.fn(),
  }
  return render(
    <QueryClientProvider client={makeClient()}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[initial]}>
          <BudgetsPage />
          <Where />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

const rowOf = (name: string) =>
  screen.getAllByTestId('budget').find((r) => within(r).queryByText(name)) as HTMLElement
const fillClass = (row: HTMLElement) => within(row).getByRole('progressbar').firstElementChild!.className

describe('BudgetsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 8, 12, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('loads the current month and names it', async () => {
    const calls = routeFetch({ ...lists, [NOV]: () => report([food]) })
    renderPage()
    await screen.findByText('Alimentación')
    expect(calls.some((c) => c.path === '/reports/budget-vs-spent?month=2026-11')).toBe(true)
    expect(screen.getByTestId('month')).toHaveTextContent('noviembre de 2026')
  })

  it('shows the month summary', async () => {
    routeFetch({ ...lists, [NOV]: () => report([food, transport, fun]) })
    renderPage()
    await screen.findByText('Alimentación')
    expect(screen.getByTestId('sum-limit')).toHaveTextContent('700,00')
    expect(screen.getByTestId('sum-spent')).toHaveTextContent('580,00')
    expect(screen.getByTestId('sum-remaining')).toHaveTextContent('120,00')
    expect(screen.getByTestId('sum-over')).toHaveTextContent('1 excedido')
  })

  it('rows: amounts, remaining or excess, real percentage, and tones', async () => {
    routeFetch({ ...lists, [NOV]: () => report([food, transport, fun]) })
    renderPage()
    await screen.findByText('Alimentación')

    const f = rowOf('Alimentación')
    expect(within(f).getByText(/Gastado.*500,00.*de.*400,00.*excedido por.*100,00/)).toBeInTheDocument()
    expect(within(f).getByTestId('percent')).toHaveTextContent('125 %')
    expect(within(f).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    expect(fillClass(f)).toContain('bg-destructive')

    const t = rowOf('Transporte')
    expect(within(t).getByText(/Gastado.*80,00.*de.*100,00.*queda.*20,00/)).toBeInTheDocument()
    expect(fillClass(t)).toContain('bg-amber-500')

    const e = rowOf('Entretenimiento')
    expect(within(e).getByText(/Gastado.*0,00.*de.*200,00.*queda.*200,00/)).toBeInTheDocument()
    expect(within(e).getByTestId('percent')).toHaveTextContent('0 %')
    expect(within(e).getByTestId('percent').textContent).not.toMatch(/NaN/)
    expect(fillClass(e)).toContain('bg-primary')
  })

  it('moves between months through the URL, across the year boundary', async () => {
    const calls = routeFetch({
      ...lists,
      'GET /reports/budget-vs-spent?month=2026-01': () => report([]),
      'GET /reports/budget-vs-spent?month=2025-12': () => report([]),
      'GET /reports/budget-vs-spent?month=2026-12': () => report([]),
      'GET /reports/budget-vs-spent?month=2027-01': () => report([]),
    })
    renderPage('/presupuestos?month=2026-01')
    await screen.findByText('No hay presupuestos este mes.')
    await userEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
    await waitFor(() => expect(calls.some((c) => c.path.endsWith('month=2025-12'))).toBe(true))
    expect(screen.getByTestId('where').textContent).toContain('month=2025-12')
  })

  it('goes from December to January', async () => {
    const calls = routeFetch({
      ...lists,
      'GET /reports/budget-vs-spent?month=2026-12': () => report([]),
      'GET /reports/budget-vs-spent?month=2027-01': () => report([]),
    })
    renderPage('/presupuestos?month=2026-12')
    await screen.findByText('No hay presupuestos este mes.')
    await userEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    await waitFor(() => expect(calls.some((c) => c.path.endsWith('month=2027-01'))).toBe(true))
  })

  it('an invalid month in the URL falls back to the current one', async () => {
    const calls = routeFetch({ ...lists, [NOV]: () => report([food]) })
    renderPage('/presupuestos?month=abc')
    await screen.findByText('Alimentación')
    expect(calls.some((c) => c.path.endsWith('month=2026-11'))).toBe(true)
  })

  it('does not allow going more than 12 months ahead', async () => {
    routeFetch({
      ...lists,
      'GET /reports/budget-vs-spent?month=2027-11': () => report([]),
      'GET /reports/budget-vs-spent?month=2027-10': () => report([]),
    })
    renderPage('/presupuestos?month=2027-11')
    await screen.findByText('No hay presupuestos este mes.')
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()
  })

  it('suggests how to start when the month is empty', async () => {
    routeFetch({ ...lists, [NOV]: () => report([], { limitCents: 0, spentCents: 0, overBudgetCount: 0 }) })
    renderPage()
    expect(await screen.findByText('No hay presupuestos este mes.')).toBeInTheDocument()
    expect(screen.getByText(/Copia los del mes anterior o crea uno nuevo/)).toBeInTheDocument()
  })

  it('"Nuevo presupuesto" offers the categories without a budget', async () => {
    routeFetch({ ...lists, [NOV]: () => report([food, transport, fun]) })
    renderPage()
    await screen.findByText('Alimentación')
    await userEvent.click(screen.getByRole('button', { name: /Nuevo presupuesto/ }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByRole('option', { name: 'Salud' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('option', { name: 'Alimentación' })).toBeNull()
    expect(within(dialog).queryByRole('option', { name: 'Salario' })).toBeNull()
  })

  it('"Nuevo presupuesto" is disabled, with a reason, when every category has one', async () => {
    routeFetch({
      'GET /categories?includeArchived=true': () =>
        jsonResponse(200, categories.filter((c) => ['c1', 'c2', 'c3'].includes(c._id))),
      [NOV]: () => report([food, transport, fun]),
    })
    renderPage()
    await screen.findByText('Alimentación')
    expect(screen.getByRole('button', { name: /Nuevo presupuesto/ })).toBeDisabled()
    expect(await screen.findByText(/Todas las categorías de gasto ya tienen presupuesto/)).toBeInTheDocument()
  })

  it('edits the limit', async () => {
    const calls = routeFetch({
      ...lists,
      [NOV]: () => report([transport]),
      'PATCH /budgets/b2': () => jsonResponse(200, {}),
    })
    renderPage()
    await screen.findByText('Transporte')
    await userEvent.click(within(rowOf('Transporte')).getByRole('button', { name: 'Editar' }))
    expect(await screen.findByText('Editar presupuesto')).toBeInTheDocument()
    const limit = screen.getByLabelText('Límite')
    expect(limit).toHaveValue('100,00')
    await userEvent.clear(limit)
    await userEvent.type(limit, '150')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Presupuesto actualizado'))
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ limitCents: 15000 })
  })

  it('deletes after confirming, even for an archived category', async () => {
    const calls = routeFetch({
      ...lists,
      [NOV]: () => report([old]),
      'DELETE /budgets/b4': () => jsonResponse(204),
    })
    renderPage()
    await screen.findByText('Antigua')
    await userEvent.click(within(rowOf('Antigua')).getByRole('button', { name: 'Eliminar' }))
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Presupuesto eliminado'))
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/budgets/b4')).toBe(true)
  })

  describe('Copiar mes anterior', () => {
    const copy = (result: unknown) => ({
      ...lists,
      [NOV]: () => report([food]),
      'POST /budgets/copy': () => jsonResponse(200, result),
    })
    const click = async () => {
      await screen.findByText('Alimentación')
      await userEvent.click(screen.getByRole('button', { name: 'Copiar mes anterior' }))
    }

    it('copies the previous month into the visible one and reports it', async () => {
      const calls = routeFetch(copy({ copied: 2, skipped: [] }))
      renderPage()
      await click()
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('2 presupuestos copiados'))
      expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ from: '2026-10', to: '2026-11' })
    })

    it('copies from the month before the one being viewed', async () => {
      const calls = routeFetch({
        ...copy({ copied: 1, skipped: [] }),
        'GET /reports/budget-vs-spent?month=2027-01': () => report([food]),
      })
      renderPage('/presupuestos?month=2027-01')
      await click()
      await waitFor(() => expect(toast.success).toHaveBeenCalled())
      expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ from: '2026-12', to: '2027-01' })
    })

    it('explains the skipped ones', async () => {
      routeFetch(
        copy({
          copied: 1,
          skipped: [
            { categoryId: 'x', reason: 'already-exists' },
            { categoryId: 'y', reason: 'category-archived' },
          ],
        }),
      )
      renderPage()
      await click()
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          '1 presupuesto copiado, 1 ya existía, 1 con categoría archivada',
        ),
      )
    })

    it('says nothing was copied when everything already existed', async () => {
      routeFetch(copy({ copied: 0, skipped: [{ categoryId: 'x', reason: 'already-exists' }] }))
      renderPage()
      await click()
      await waitFor(() => expect(toast.info).toHaveBeenCalledWith('No se copió nada: 1 ya existía'))
      expect(toast.success).not.toHaveBeenCalled()
    })

    it('says there was nothing to copy', async () => {
      routeFetch(copy({ copied: 0, skipped: [] }))
      renderPage()
      await click()
      await waitFor(() =>
        expect(toast.info).toHaveBeenCalledWith('No había presupuestos en el mes anterior'),
      )
    })

    it('toasts an API error', async () => {
      routeFetch({
        ...lists,
        [NOV]: () => report([food]),
        'POST /budgets/copy': () => jsonResponse(400, { message: 'from and to must differ' }),
      })
      renderPage()
      await click()
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('from and to must differ'))
    })
  })
})
