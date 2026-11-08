import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { IncomeVsExpenses, SpendingReport } from '@/api/reports'
import type { BudgetItem } from '@/features/budgets/budget-form'
import { BudgetBars } from './BudgetBars'
import type { CategorySpend } from './dashboard-data'
import { MonthlyBars } from './MonthlyBars'
import { SpendingDonut } from './SpendingDonut'

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

const cat = (i: number, totalCents: number): CategorySpend => ({
  categoryId: `c${i}`, name: `Cat ${i}`, icon: 'tag', color: '#112233', totalCents, count: 1,
})
const seven = [cat(1, 700), cat(2, 600), cat(3, 500), cat(4, 400), cat(5, 300), cat(6, 200), cat(7, 100)]

describe('SpendingDonut', () => {
  it('lists the top five and groups the rest as "Otras" in an accessible table', () => {
    const report: SpendingReport = { from: '', to: '', totalCents: 2800, items: seven }
    wrap(<SpendingDonut report={report} currency="USD" />)
    const table = screen.getByRole('table', { name: 'Gasto por categoría' })
    const rows = within(table).getAllByRole('row').slice(1) // without the header
    expect(rows).toHaveLength(6)
    expect(within(rows[0]).getByText('Cat 1')).toBeInTheDocument()
    expect(within(rows[0]).getByText(/7,00/)).toBeInTheDocument()
    expect(within(rows[0]).getByText('25 %')).toBeInTheDocument()
    expect(within(rows[5]).getByText('Otras')).toBeInTheDocument()
    expect(within(rows[5]).getByText(/3,00/)).toBeInTheDocument()
    expect(within(rows[5]).getByText('10,7 %')).toBeInTheDocument()
  })

  it('adds no "Otras" with five categories or fewer', () => {
    const report: SpendingReport = { from: '', to: '', totalCents: 1000, items: seven.slice(0, 2) }
    wrap(<SpendingDonut report={report} currency="USD" />)
    expect(screen.queryByText('Otras')).toBeNull()
  })

  it('shows an empty text, with no table and no NaN, when nothing was spent', () => {
    const report: SpendingReport = { from: '', to: '', totalCents: 0, items: [] }
    const { container } = wrap(<SpendingDonut report={report} currency="USD" />)
    expect(screen.getByText('Sin gastos este mes.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
    expect(container.textContent).not.toMatch(/NaN/)
  })
})

describe('MonthlyBars', () => {
  const months = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02'].map((month, i) => ({
    month, incomeCents: i === 5 ? 80000 : 0, expenseCents: i === 5 ? 115000 : 0, netCents: i === 5 ? -35000 : 0,
  }))
  const flow: IncomeVsExpenses = { from: '2025-09', to: '2026-02', months }

  it('has a row per month, with the year change and signed net', () => {
    wrap(<MonthlyBars flow={flow} currency="USD" />)
    const table = screen.getByRole('table', { name: 'Evolución mensual' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(6)
    expect(rows[0]).toHaveTextContent('25')
    expect(rows[5]).toHaveTextContent('26')
    expect(rows[5]).toHaveTextContent('800,00')
    expect(rows[5]).toHaveTextContent('1.150,00')
    expect(rows[5]).toHaveTextContent('-350,00')
  })

  it('shows an empty text when every month is zero', () => {
    const empty: IncomeVsExpenses = {
      from: '2025-09', to: '2026-02',
      months: months.map((m) => ({ ...m, incomeCents: 0, expenseCents: 0, netCents: 0 })),
    }
    wrap(<MonthlyBars flow={empty} currency="USD" />)
    expect(screen.getByText('Sin movimientos en estos meses.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('BudgetBars', () => {
  const item = (over: Partial<BudgetItem>): BudgetItem => ({
    budgetId: 'b', categoryId: 'c', name: 'X', icon: 'tag', color: '#000000',
    limitCents: 10000, spentCents: 5000, remainingCents: 5000, percentUsed: 50, overBudget: false, ...over,
  })

  it('has a row per budget and marks the exceeded ones', () => {
    wrap(
      <BudgetBars
        currency="USD"
        items={[
          item({ name: 'Comida', limitCents: 40000, spentCents: 50000, remainingCents: -10000, percentUsed: 125, overBudget: true }),
          item({ name: 'Transporte' }),
        ]}
      />,
    )
    const table = screen.getByRole('table', { name: 'Presupuesto contra real' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Comida')
    expect(rows[0]).toHaveTextContent('400,00')
    expect(rows[0]).toHaveTextContent('500,00')
    expect(rows[0]).toHaveTextContent('Excedido')
    expect(rows[1]).toHaveTextContent('Dentro del límite')
  })

  it('invites to create budgets when there are none', () => {
    wrap(<BudgetBars currency="USD" items={[]} />)
    expect(screen.getByText('Sin presupuestos este mes.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /presupuesto/i })).toHaveAttribute('href', '/presupuestos')
    expect(screen.queryByRole('table')).toBeNull()
  })
})
