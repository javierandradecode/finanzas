import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import type { Transaction } from '@/api/transactions'
import { todayLocal } from '@/lib/dates'
import { jsonResponse, makeClient, routeFetch } from '@/test/utils'
import { TransactionDialog } from './TransactionDialog'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const accounts = [
  { _id: 'a1', type: 'cash', name: 'Caja', balanceCents: 0, isArchived: false },
  { _id: 'a2', type: 'checking', name: 'Banco', balanceCents: 0, isArchived: false },
]
const cards = [
  { _id: 'k1', name: 'Visa', limitCents: 0, cutoffDay: 1, paymentDay: 10, annualRatePercent: 0, debtCents: 0, isArchived: false },
]
const cat = (over: object) => ({ icon: 'tag', color: '#000000', isArchived: false, subcategories: [], ...over })
const categories = [
  cat({ _id: 'c1', type: 'expense', name: 'Alimentación', subcategories: [
    { _id: 's1', name: 'Super', isArchived: false },
    { _id: 's2', name: 'Restaurante', isArchived: false },
    { _id: 's3', name: 'Vieja sub', isArchived: true },
  ] }),
  cat({ _id: 'c2', type: 'expense', name: 'Transporte' }),
  cat({ _id: 'c3', type: 'income', name: 'Salario' }),
  cat({ _id: 'c9', type: 'expense', name: 'Antigua', isArchived: true }),
]

const lists = {
  'GET /accounts?includeArchived=true': () => jsonResponse(200, accounts),
  'GET /credit-cards?includeArchived=true': () => jsonResponse(200, cards),
  'GET /categories?includeArchived=true': () => jsonResponse(200, categories),
}

function renderDialog(transaction?: Transaction, onOpenChange = vi.fn()) {
  render(
    <QueryClientProvider client={makeClient()}>
      <TransactionDialog open onOpenChange={onOpenChange} transaction={transaction} />
    </QueryClientProvider>,
  )
  return { onOpenChange }
}

const pick = (label: string, value: string) =>
  userEvent.selectOptions(screen.getByLabelText(label), value)
const press = (name: string) => userEvent.click(screen.getByRole('button', { name }))
const save = () => press('Guardar')
const chooseType = (name: string) => userEvent.click(screen.getByRole('radio', { name }))
const waitLoaded = () => screen.findByRole('option', { name: 'Caja' })

const expenseTx: Transaction = {
  _id: 't1',
  type: 'expense',
  amountCents: 1500,
  date: '2026-03-15T00:00:00.000Z',
  accountId: 'a1',
  categoryId: 'c1',
  subcategoryId: 's1',
  note: 'Pan',
  source: 'manual',
}

describe('TransactionDialog', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('defaults the date to today on the local calendar', async () => {
    routeFetch(lists)
    renderDialog()
    await waitLoaded()
    expect(screen.getByLabelText('Fecha')).toHaveValue(todayLocal())
  })

  it('creates an expense paid with an account', async () => {
    const calls = routeFetch({ ...lists, 'POST /transactions': () => jsonResponse(201, expenseTx) })
    const { onOpenChange } = renderDialog()
    await waitLoaded()
    await userEvent.type(screen.getByLabelText('Monto'), '15,50')
    await pick('Pagado con', 'account:a1')
    await pick('Categoría', 'c1')
    await userEvent.type(screen.getByLabelText('Nota'), 'Pan')
    await save()
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Movimiento creado'))
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      type: 'expense',
      amountCents: 1550,
      date: todayLocal(),
      accountId: 'a1',
      categoryId: 'c1',
      note: 'Pan',
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('the type is a radio group with Gasto chosen by default', async () => {
    routeFetch(lists)
    renderDialog()
    await waitLoaded()
    expect(screen.getByRole('radiogroup', { name: 'Tipo de movimiento' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Gasto' })).toBeChecked()
  })

  it('Guardar y añadir otro saves, stays open and keeps type, date and origin only', async () => {
    const calls = routeFetch({ ...lists, 'POST /transactions': () => jsonResponse(201, expenseTx) })
    const { onOpenChange } = renderDialog()
    await waitLoaded()
    await userEvent.type(screen.getByLabelText('Monto'), '15,50')
    await pick('Pagado con', 'account:a1')
    await pick('Categoría', 'c1')
    await userEvent.type(screen.getByLabelText('Nota'), 'Pan')
    await press('Guardar y añadir otro')
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Movimiento creado'))
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ amountCents: 1550, categoryId: 'c1' })
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    // what belongs to the next one is empty; what usually repeats stays
    await waitFor(() => expect(screen.getByLabelText('Monto')).toHaveValue(''))
    expect(screen.getByLabelText('Nota')).toHaveValue('')
    expect(screen.getByLabelText('Categoría')).toHaveValue('')
    expect(screen.getByLabelText('Pagado con')).toHaveValue('account:a1')
    expect(screen.getByLabelText('Fecha')).toHaveValue(todayLocal())
    expect(screen.getByRole('radio', { name: 'Gasto' })).toBeChecked()
    expect(screen.getByLabelText('Monto')).toHaveFocus()
  })

  it('does not offer to add another when editing', async () => {
    routeFetch(lists)
    renderDialog(expenseTx)
    await waitLoaded()
    expect(screen.queryByRole('button', { name: /añadir otro/ })).toBeNull()
  })

  it('a failed Guardar y añadir otro keeps what was typed', async () => {
    routeFetch({ ...lists, 'POST /transactions': () => jsonResponse(400, { message: 'nope' }) })
    renderDialog()
    await waitLoaded()
    await userEvent.type(screen.getByLabelText('Monto'), '15,50')
    await pick('Pagado con', 'account:a1')
    await pick('Categoría', 'c1')
    await press('Guardar y añadir otro')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('nope'))
    expect(screen.getByLabelText('Monto')).toHaveValue('15,50')
    expect(screen.getByLabelText('Categoría')).toHaveValue('c1')
  })

  it('creates an expense paid with a card (no accountId)', async () => {
    const calls = routeFetch({ ...lists, 'POST /transactions': () => jsonResponse(201, expenseTx) })
    renderDialog()
    await waitLoaded()
    await userEvent.type(screen.getByLabelText('Monto'), '10')
    await pick('Pagado con', 'card:k1')
    await pick('Categoría', 'c2')
    await save()
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    const body = calls.find((c) => c.method === 'POST')?.body as Record<string, unknown>
    expect(body.creditCardId).toBe('k1')
    expect(body).not.toHaveProperty('accountId')
  })

  it('income only offers accounts and income categories', async () => {
    routeFetch(lists)
    renderDialog()
    await waitLoaded()
    await chooseType('Ingreso')
    expect(screen.getByLabelText('Cuenta')).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Visa' })).toBeNull()
    expect(screen.getByRole('option', { name: 'Salario' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Alimentación' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'Antigua' })).toBeNull() // archived
  })

  it('a transfer has no category and rejects origin = destination without calling the API', async () => {
    const calls = routeFetch(lists)
    renderDialog()
    await waitLoaded()
    await chooseType('Transferencia')
    expect(screen.queryByLabelText('Categoría')).toBeNull()
    await userEvent.type(screen.getByLabelText('Monto'), '5')
    await pick('Origen', 'account:a1')
    await pick('Destino', 'account:a1')
    await save()
    expect(await screen.findByText('El destino debe ser distinto del origen')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('a transfer can pay a card', async () => {
    const calls = routeFetch({ ...lists, 'POST /transactions': () => jsonResponse(201, expenseTx) })
    renderDialog()
    await waitLoaded()
    await chooseType('Transferencia')
    await userEvent.type(screen.getByLabelText('Monto'), '20')
    await pick('Origen', 'account:a1')
    await pick('Destino', 'card:k1')
    await save()
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      type: 'transfer',
      accountId: 'a1',
      toCreditCardId: 'k1',
    })
  })

  it('changing the type resets the category', async () => {
    routeFetch(lists)
    renderDialog()
    await waitLoaded()
    await pick('Categoría', 'c1')
    expect(screen.getByLabelText('Categoría')).toHaveValue('c1')
    await chooseType('Ingreso')
    expect(screen.getByLabelText('Categoría')).toHaveValue('')
  })

  it('a category from the old type is not submitted after switching type', async () => {
    const calls = routeFetch({ ...lists, 'POST /transactions': () => jsonResponse(201, expenseTx) })
    renderDialog()
    await waitLoaded()
    await userEvent.type(screen.getByLabelText('Monto'), '10')
    await pick('Categoría', 'c1')
    await chooseType('Ingreso')
    await pick('Cuenta', 'account:a1')
    await save()
    expect(await screen.findByText('Elige una categoría')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('lists only the subcategories of the chosen category (active ones)', async () => {
    routeFetch(lists)
    renderDialog()
    await waitLoaded()
    await pick('Categoría', 'c1')
    expect(screen.getByRole('option', { name: 'Super' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Restaurante' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Vieja sub' })).toBeNull()
    await pick('Categoría', 'c2')
    expect(screen.queryByRole('option', { name: 'Super' })).toBeNull()
  })

  it('editing an expense as a transfer sends nulls for what no longer applies', async () => {
    const calls = routeFetch({ ...lists, 'PATCH /transactions/t1': () => jsonResponse(200, expenseTx) })
    renderDialog(expenseTx)
    await waitLoaded()
    expect(screen.getByLabelText('Monto')).toHaveValue('15,00')
    await chooseType('Transferencia')
    await pick('Destino', 'account:a2')
    await save()
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Movimiento actualizado'))
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      type: 'transfer',
      amountCents: 1500,
      date: '2026-03-15',
      accountId: 'a1',
      toAccountId: 'a2',
      creditCardId: null,
      toCreditCardId: null,
      categoryId: null,
      subcategoryId: null,
      note: 'Pan',
    })
  })

  it('keeps an archived category as the selected option when editing', async () => {
    routeFetch(lists)
    renderDialog({ ...expenseTx, categoryId: 'c9', subcategoryId: undefined })
    await screen.findByRole('option', { name: 'Antigua' })
    expect(screen.getByLabelText('Categoría')).toHaveValue('c9')
  })

  it('toasts the API error and keeps the dialog open', async () => {
    routeFetch({
      ...lists,
      'POST /transactions': () => jsonResponse(409, { message: 'Account is archived' }),
    })
    const { onOpenChange } = renderDialog()
    await waitLoaded()
    await userEvent.type(screen.getByLabelText('Monto'), '3')
    await pick('Pagado con', 'account:a1')
    await pick('Categoría', 'c1')
    await save()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Account is archived'))
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.getByLabelText('Monto')).toBeInTheDocument()
  })

  it('validates before sending (invalid amount)', async () => {
    const calls = routeFetch(lists)
    renderDialog()
    await waitLoaded()
    await userEvent.type(screen.getByLabelText('Monto'), 'abc')
    await pick('Pagado con', 'account:a1')
    await pick('Categoría', 'c1')
    await save()
    expect(await screen.findByText('Monto no válido')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })
})
