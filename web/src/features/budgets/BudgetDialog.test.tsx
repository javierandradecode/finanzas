import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { ProgressBar } from '@/components/ProgressBar'
import { jsonResponse, makeClient, routeFetch } from '@/test/utils'
import { BudgetDialog } from './BudgetDialog'
import type { BudgetItem } from './budget-form'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const cat = (over: object) => ({ icon: 'tag', color: '#000000', isArchived: false, subcategories: [], ...over })
const categories = [
  cat({ _id: 'c1', type: 'expense', name: 'Alimentación' }),
  cat({ _id: 'c2', type: 'expense', name: 'Transporte' }),
  cat({ _id: 'c3', type: 'income', name: 'Salario' }),
  cat({ _id: 'c9', type: 'expense', name: 'Antigua', isArchived: true }),
]
const lists = { 'GET /categories?includeArchived=true': () => jsonResponse(200, categories) }

const item: BudgetItem = {
  budgetId: 'b1', categoryId: 'c1', name: 'Alimentación', icon: 'utensils', color: '#f97316',
  limitCents: 40000, spentCents: 1000, remainingCents: 39000, percentUsed: 2.5, overBudget: false,
}

function renderDialog(props: { takenCategoryIds?: string[]; item?: BudgetItem } = {}, onOpenChange = vi.fn()) {
  render(
    <QueryClientProvider client={makeClient()}>
      <BudgetDialog
        open
        onOpenChange={onOpenChange}
        month="2026-03"
        takenCategoryIds={props.takenCategoryIds ?? []}
        item={props.item}
      />
    </QueryClientProvider>,
  )
  return { onOpenChange }
}

const save = () => userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

describe('BudgetDialog', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('creates a budget for the visible month', async () => {
    const calls = routeFetch({ ...lists, 'POST /budgets': () => jsonResponse(201, {}) })
    const { onOpenChange } = renderDialog()
    await screen.findByRole('option', { name: 'Alimentación' })
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'c1')
    await userEvent.type(screen.getByLabelText('Límite'), '400')
    await save()
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Presupuesto creado'))
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      categoryId: 'c1', month: '2026-03', limitCents: 40000,
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('only offers active expense categories without a budget that month', async () => {
    routeFetch(lists)
    renderDialog({ takenCategoryIds: ['c1'] })
    await screen.findByRole('option', { name: 'Transporte' })
    expect(screen.queryByRole('option', { name: 'Alimentación' })).toBeNull() // already has one
    expect(screen.queryByRole('option', { name: 'Salario' })).toBeNull() // income
    expect(screen.queryByRole('option', { name: 'Antigua' })).toBeNull() // archived
  })

  it('validates before sending', async () => {
    const calls = routeFetch(lists)
    renderDialog()
    await screen.findByRole('option', { name: 'Alimentación' })
    await userEvent.type(screen.getByLabelText('Límite'), 'abc')
    await save()
    expect(await screen.findByText('Elige una categoría')).toBeInTheDocument()
    expect(screen.getByText('Monto no válido')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('rejects a zero limit', async () => {
    const calls = routeFetch(lists)
    renderDialog()
    await screen.findByRole('option', { name: 'Alimentación' })
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'c1')
    await userEvent.type(screen.getByLabelText('Límite'), '0')
    await save()
    expect(await screen.findByText('El límite debe ser mayor que 0')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('editing shows the category fixed and only sends the limit', async () => {
    const calls = routeFetch({ ...lists, 'PATCH /budgets/b1': () => jsonResponse(200, {}) })
    renderDialog({ item })
    expect(screen.getByText('Alimentación')).toBeInTheDocument()
    expect(screen.queryByLabelText('Categoría')).toBeNull()
    const limit = screen.getByLabelText('Límite')
    expect(limit).toHaveValue('400,00')
    await userEvent.clear(limit)
    await userEvent.type(limit, '450')
    await save()
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Presupuesto actualizado'))
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ limitCents: 45000 })
  })

  it('toasts a 409 and keeps the dialog open', async () => {
    routeFetch({
      ...lists,
      'POST /budgets': () => jsonResponse(409, { message: 'A budget for this category and month already exists' }),
    })
    const { onOpenChange } = renderDialog()
    await screen.findByRole('option', { name: 'Alimentación' })
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'c1')
    await userEvent.type(screen.getByLabelText('Límite'), '10')
    await save()
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('A budget for this category and month already exists'),
    )
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})

describe('ProgressBar tones', () => {
  const fill = (ui: React.ReactElement) => {
    const { container } = render(ui)
    return container.querySelector('[role="progressbar"] > div') as HTMLElement
  }

  it('uses a different colour for ok, warn and over', () => {
    const ok = fill(<ProgressBar value={10} max={100} tone="ok" />).className
    const warn = fill(<ProgressBar value={90} max={100} tone="warn" />).className
    const over = fill(<ProgressBar value={120} max={100} tone="over" />).className
    expect(new Set([ok, warn, over]).size).toBe(3)
    expect(over).toContain('bg-destructive')
  })

  it('keeps `danger` working for the cards screen', () => {
    expect(fill(<ProgressBar value={9} max={10} danger />).className).toContain('bg-destructive')
  })
})
