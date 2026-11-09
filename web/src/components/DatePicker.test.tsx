import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { todayLocal } from '@/lib/dates'
import { pickDate } from '@/test/utils'
import { DatePicker } from './DatePicker'

function Harness({
  initial = '2026-03-15',
  clearable = false,
  onChange = () => {},
}: {
  initial?: string
  clearable?: boolean
  onChange?: (v: string) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <label htmlFor="d">Fecha</label>
      <DatePicker
        id="d"
        label="Fecha"
        value={value}
        clearable={clearable}
        onChange={(v) => {
          setValue(v)
          onChange(v)
        }}
      />
    </>
  )
}

const trigger = () => screen.getByLabelText('Fecha')

describe('DatePicker', () => {
  it('shows the date as text and keeps the exact value in data-value', () => {
    render(<Harness />)
    expect(trigger()).toHaveTextContent('15 mar 2026')
    expect(trigger()).toHaveAttribute('data-value', '2026-03-15')
  })

  it('names the control with its label and the chosen date for screen readers', () => {
    render(<Harness />)
    expect(trigger()).toHaveAccessibleName('Fecha: 15 mar 2026')
  })

  it('invites to choose when empty or when the value is not a real date', () => {
    const { unmount } = render(<Harness initial="" />)
    expect(trigger()).toHaveTextContent('Elige una fecha')
    unmount()
    render(<Harness initial="2026-02-31" />)
    expect(trigger()).toHaveTextContent('Elige una fecha')
  })

  it('opens a month grid with the current value selected', async () => {
    render(<Harness />)
    await userEvent.click(trigger())
    expect(await screen.findByRole('grid')).toBeInTheDocument()
    expect(document.querySelector('[data-day="2026-03-15"]')).toHaveAttribute('aria-selected', 'true')
  })

  it('opens with the keyboard', async () => {
    render(<Harness />)
    trigger().focus()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByRole('grid')).toBeInTheDocument()
  })

  it('choosing a day reports it, shows it and closes', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.click(trigger())
    await userEvent.click(document.querySelector('[data-day="2026-03-20"] button')!)
    expect(onChange).toHaveBeenCalledWith('2026-03-20')
    expect(trigger()).toHaveAttribute('data-value', '2026-03-20')
    expect(screen.queryByRole('grid')).toBeNull()
  })

  it.each(['2026-03-01', '2026-03-31', '2026-01-31', '2028-02-29', '2020-12-31'])(
    'picks exactly %s, with no timezone shift',
    async (ymd) => {
      const onChange = vi.fn()
      render(<Harness onChange={onChange} />)
      await pickDate('Fecha', ymd)
      expect(onChange).toHaveBeenLastCalledWith(ymd)
      expect(trigger()).toHaveAttribute('data-value', ymd)
    },
  )

  it('Escape closes the calendar without changing the date', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.click(trigger())
    await screen.findByRole('grid')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('grid')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('"Hoy" picks today on the local calendar', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.click(trigger())
    await userEvent.click(await screen.findByRole('button', { name: 'Hoy' }))
    expect(onChange).toHaveBeenCalledWith(todayLocal())
  })

  it('offers "Borrar" only when it can be cleared and there is a value', async () => {
    const { unmount } = render(<Harness />)
    await userEvent.click(trigger())
    await screen.findByRole('grid')
    expect(screen.queryByRole('button', { name: 'Borrar' })).toBeNull()
    unmount()

    const onChange = vi.fn()
    const view = render(<Harness clearable onChange={onChange} />)
    await userEvent.click(trigger())
    await userEvent.click(await screen.findByRole('button', { name: 'Borrar' }))
    expect(onChange).toHaveBeenCalledWith('')
    expect(trigger()).toHaveTextContent('Elige una fecha')
    view.unmount()

    render(<Harness clearable initial="" />)
    await userEvent.click(trigger())
    await screen.findByRole('grid')
    expect(screen.queryByRole('button', { name: 'Borrar' })).toBeNull()
  })

  it('opens on the current month when there is no value', async () => {
    render(<Harness initial="" />)
    await userEvent.click(trigger())
    await screen.findByRole('grid')
    const today = todayLocal()
    expect(document.querySelector(`[data-day="${today}"]`)).not.toBeNull()
  })
})
