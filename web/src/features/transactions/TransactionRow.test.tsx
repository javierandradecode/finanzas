import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Transaction } from '@/api/transactions'
import { TransactionRow, type Lookups } from './TransactionRow'

const lookups: Lookups = {
  accounts: new Map([
    ['acc1', 'Banco'],
    ['acc2', 'Ahorro'],
  ]),
  cards: new Map(),
  categories: new Map([
    ['cat1', { _id: 'cat1', name: 'Comida', icon: 'tag', color: '#ff0000' } as never],
  ]),
}

const base: Transaction = {
  _id: 't1',
  type: 'expense',
  amountCents: 4520,
  date: '2026-03-10T00:00:00.000Z',
  accountId: 'acc1',
  categoryId: 'cat1',
  note: 'Supermercado',
  source: 'manual',
}

function renderRow(tx: Partial<Transaction> = {}, handlers = { onEdit: vi.fn(), onDelete: vi.fn() }) {
  render(
    <ul>
      <TransactionRow tx={{ ...base, ...tx }} lookups={lookups} currency="USD" {...handlers} />
    </ul>,
  )
  return handlers
}

describe('TransactionRow', () => {
  it('shows the title and category / account, but not the date (the day heading has it)', () => {
    renderRow()
    expect(screen.getByText('Supermercado')).toBeInTheDocument()
    expect(screen.getByText('Comida · Banco')).toBeInTheDocument()
    expect(screen.queryByText(/2026/)).toBeNull()
  })

  it('writes an expense with "-" in the normal text colour, an income in green', () => {
    renderRow()
    const amount = screen.getByTestId('amount')
    expect(amount).toHaveTextContent('-45,20')
    expect(amount).not.toHaveClass('text-destructive')
    expect(amount).toHaveClass('tabular-nums')
  })

  it('writes an income with "+" in green', () => {
    renderRow({ type: 'income' })
    expect(screen.getByTestId('amount')).toHaveTextContent('+45,20')
    expect(screen.getByTestId('amount')).toHaveClass('text-emerald-600')
  })

  it('shows a transfer as origin → destination with no sign', () => {
    renderRow({ type: 'transfer', note: undefined, categoryId: undefined, toAccountId: 'acc2' })
    expect(screen.getByText('Banco → Ahorro')).toBeInTheDocument()
    expect(screen.getByTestId('amount')).not.toHaveTextContent(/[+-]/)
  })

  it('opens a menu named after the movement with Editar and Eliminar', async () => {
    const h = renderRow()
    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Supermercado' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar' }))
    expect(h.onEdit).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Supermercado' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Eliminar' }))
    expect(h.onDelete).toHaveBeenCalledTimes(1)
  })

  it('has no menu when an installment purchase manages it, and says so', () => {
    renderRow({ source: 'installment', installmentPurchaseId: 'p1' })
    expect(screen.queryByRole('button', { name: /Acciones de/ })).toBeNull()
    expect(screen.getByText(/Gestionado por una compra a cuotas/)).toBeInTheDocument()
    expect(screen.getByText('Cuota')).toBeInTheDocument()
  })
})
