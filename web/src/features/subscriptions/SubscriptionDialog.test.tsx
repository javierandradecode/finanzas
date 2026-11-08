import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import type { Subscription } from '@/api/subscriptions'
import { todayLocal } from '@/lib/dates'
import { jsonResponse, makeClient, routeFetch } from '@/test/utils'
import { SubscriptionDialog } from './SubscriptionDialog'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const acc = (_id: string, name: string, isArchived = false) => ({ _id, name, type: 'cash', balanceCents: 0, isArchived })
const accounts = [acc('a1', 'Caja'), acc('a2', 'Banco'), acc('a9', 'Vieja', true)]
const cards = [
  { _id: 'k1', name: 'Visa', limitCents: 0, cutoffDay: 1, paymentDay: 10, annualRatePercent: 0, debtCents: 0, availableCents: 0, isArchived: false },
  { _id: 'k9', name: 'Cerrada', limitCents: 0, cutoffDay: 1, paymentDay: 10, annualRatePercent: 0, debtCents: 0, availableCents: 0, isArchived: true },
]
const cat = (over: object) => ({ icon: 'tag', color: '#000000', isArchived: false, subcategories: [], ...over })
const categories = [
  cat({ _id: 'c1', type: 'expense', name: 'Entretenimiento', subcategories: [
    { _id: 's1', name: 'Streaming', isArchived: false },
    { _id: 's2', name: 'Juegos', isArchived: false },
  ] }),
  cat({ _id: 'c2', type: 'expense', name: 'Servicios' }),
  cat({ _id: 'c3', type: 'income', name: 'Salario' }),
  cat({ _id: 'c9', type: 'expense', name: 'Antigua', isArchived: true }),
]

const lists = {
  'GET /accounts?includeArchived=true': () => jsonResponse(200, accounts),
  'GET /credit-cards?includeArchived=true': () => jsonResponse(200, cards),
  'GET /categories?includeArchived=true': () => jsonResponse(200, categories),
}

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  _id: 's1', name: 'Netflix', amountCents: 999, frequency: 'monthly', nextDate: '2026-12-15T00:00:00.000Z',
  anchorDay: 15, accountId: 'a1', categoryId: 'c1', active: true, ...over,
})

function renderDialog(subscription?: Subscription, onOpenChange = vi.fn()) {
  render(
    <QueryClientProvider client={makeClient()}>
      <SubscriptionDialog open onOpenChange={onOpenChange} subscription={subscription} />
    </QueryClientProvider>,
  )
  return { onOpenChange }
}

const pick = (label: string, value: string) => userEvent.selectOptions(screen.getByLabelText(label), value)
const save = () => userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
const loaded = () => screen.findByRole('option', { name: 'Caja' })

async function fillNew(payer = 'account:a1') {
  await userEvent.type(screen.getByLabelText('Nombre'), 'Netflix')
  await userEvent.type(screen.getByLabelText('Monto'), '9,99')
  await pick('Se paga con', payer)
  await pick('Categoría', 'c1')
}

describe('SubscriptionDialog', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('creates a subscription paid with an account', async () => {
    const calls = routeFetch({ ...lists, 'POST /subscriptions': () => jsonResponse(201, sub()) })
    const { onOpenChange } = renderDialog()
    await loaded()
    await fillNew()
    await save()
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Suscripción creada'))
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      name: 'Netflix', amountCents: 999, frequency: 'monthly', nextDate: todayLocal(),
      accountId: 'a1', categoryId: 'c1',
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('creates one paid with a card (no accountId)', async () => {
    const calls = routeFetch({ ...lists, 'POST /subscriptions': () => jsonResponse(201, sub()) })
    renderDialog()
    await loaded()
    await fillNew('card:k1')
    await pick('Frecuencia', 'yearly')
    await save()
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    const body = calls.find((c) => c.method === 'POST')?.body as Record<string, unknown>
    expect(body.creditCardId).toBe('k1')
    expect(body.frequency).toBe('yearly')
    expect(body).not.toHaveProperty('accountId')
  })

  it('offers only active payers and active expense categories', async () => {
    routeFetch(lists)
    renderDialog()
    await loaded()
    expect(screen.getByRole('option', { name: 'Banco' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Visa' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Vieja' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'Cerrada' })).toBeNull()
    expect(screen.getByRole('option', { name: 'Servicios' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Salario' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'Antigua' })).toBeNull()
  })

  it('lists the subcategories of the chosen category and resets them when it changes', async () => {
    routeFetch(lists)
    renderDialog()
    await loaded()
    await pick('Categoría', 'c1')
    expect(screen.getByRole('option', { name: 'Streaming' })).toBeInTheDocument()
    await pick('Subcategoría', 's1')
    expect(screen.getByLabelText('Subcategoría')).toHaveValue('s1')
    await pick('Categoría', 'c2')
    expect(screen.queryByRole('option', { name: 'Streaming' })).toBeNull()
    expect(screen.getByLabelText('Subcategoría')).toHaveValue('')
  })

  it('a stale subcategory is not submitted after changing the category', async () => {
    const calls = routeFetch({ ...lists, 'POST /subscriptions': () => jsonResponse(201, sub()) })
    renderDialog()
    await loaded()
    await userEvent.type(screen.getByLabelText('Nombre'), 'Netflix')
    await userEvent.type(screen.getByLabelText('Monto'), '9,99')
    await pick('Se paga con', 'account:a1')
    await pick('Categoría', 'c1')
    await pick('Subcategoría', 's1')
    await pick('Categoría', 'c2')
    await save()
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(calls.find((c) => c.method === 'POST')?.body).not.toHaveProperty('subcategoryId')
  })

  it('defaults the date to today', async () => {
    routeFetch(lists)
    renderDialog()
    await loaded()
    expect(screen.getByLabelText('Próximo cobro')).toHaveValue(todayLocal())
  })

  it('warns about a past date but still saves', async () => {
    const calls = routeFetch({ ...lists, 'POST /subscriptions': () => jsonResponse(201, sub()) })
    renderDialog()
    await loaded()
    await fillNew()
    const date = screen.getByLabelText('Próximo cobro')
    await userEvent.clear(date)
    await userEvent.type(date, '2020-01-15')
    expect(await screen.findByText(/Se cobrarán los períodos vencidos/)).toBeInTheDocument()
    await save()
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ nextDate: '2020-01-15' })
  })

  it('shows validation errors without calling the API', async () => {
    const calls = routeFetch(lists)
    renderDialog()
    await loaded()
    await userEvent.type(screen.getByLabelText('Monto'), 'abc')
    await save()
    expect(await screen.findByText('Ingresa un nombre')).toBeInTheDocument()
    expect(screen.getByText('Monto no válido')).toBeInTheDocument()
    expect(screen.getByText('Elige con qué se paga')).toBeInTheDocument()
    expect(screen.getByText('Elige una categoría')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('switching the payer from an account to a card sends nulls on the other side', async () => {
    const calls = routeFetch({ ...lists, 'PATCH /subscriptions/s1': () => jsonResponse(200, sub()) })
    renderDialog(sub())
    await loaded()
    expect(screen.getByLabelText('Monto')).toHaveValue('9,99')
    await pick('Se paga con', 'card:k1')
    await save()
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Suscripción actualizada'))
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      name: 'Netflix', amountCents: 999, frequency: 'monthly', nextDate: '2026-12-15',
      accountId: null, creditCardId: 'k1', categoryId: 'c1', subcategoryId: null,
    })
  })

  it('keeps an archived payer and category as selected options when editing', async () => {
    routeFetch(lists)
    renderDialog(sub({ accountId: 'a9', categoryId: 'c9' }))
    await screen.findByRole('option', { name: 'Vieja' })
    expect(screen.getByLabelText('Se paga con')).toHaveValue('account:a9')
    expect(screen.getByLabelText('Categoría')).toHaveValue('c9')
  })

  it('toasts the API error and keeps the dialog open', async () => {
    routeFetch({
      ...lists,
      'POST /subscriptions': () => jsonResponse(409, { message: 'Account is archived' }),
    })
    const { onOpenChange } = renderDialog()
    await loaded()
    await fillNew()
    await save()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Account is archived'))
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
})
