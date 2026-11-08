import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { CategoryIcon } from './CategoryIcon'
import { ConfirmDialog } from './ConfirmDialog'
import { MoneyInput } from './MoneyInput'

describe('CategoryIcon', () => {
  it.each(['utensils', 'not-a-real-icon'])('renders an svg for %s', (name) => {
    const { container } = render(<CategoryIcon name={name} color="#ef4444" />)
    expect(container.querySelector('svg')).not.toBeNull()
  })
})

describe('MoneyInput', () => {
  it('reports cents, null when empty and NaN for invalid text', async () => {
    const onChange = vi.fn()
    render(<MoneyInput value={null} onChange={onChange} aria-label="monto" />)
    const input = screen.getByLabelText('monto')

    await userEvent.type(input, '12,50')
    expect(onChange).toHaveBeenLastCalledWith(1250)

    await userEvent.clear(input)
    expect(onChange).toHaveBeenLastCalledWith(null)
    await userEvent.type(input, 'abc')
    expect(onChange).toHaveBeenLastCalledWith(Number.NaN)
  })

  it('shows the initial value and reformats on blur', async () => {
    function Harness() {
      const [v, setV] = useState<number | null>(1234)
      return <MoneyInput value={v} onChange={setV} aria-label="monto" />
    }
    render(<Harness />)
    const input = screen.getByLabelText('monto') as HTMLInputElement
    expect(input.value).toBe('12,34')

    await userEvent.clear(input)
    await userEvent.type(input, '5')
    await userEvent.tab()
    expect(input.value).toBe('5,00')
  })

  it('follows external resets of the value', async () => {
    function Harness() {
      const [v, setV] = useState<number | null>(500)
      return (
        <>
          <MoneyInput value={v} onChange={setV} aria-label="monto" />
          <button onClick={() => setV(null)}>reset</button>
        </>
      )
    }
    render(<Harness />)
    await userEvent.click(screen.getByText('reset'))
    expect((screen.getByLabelText('monto') as HTMLInputElement).value).toBe('')
  })
})

describe('ConfirmDialog', () => {
  function setup() {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="¿Archivar?"
        description="Se puede restaurar"
        confirmLabel="Archivar"
        onConfirm={onConfirm}
      />,
    )
    return { onConfirm, onOpenChange }
  }

  it('calls onConfirm and closes when confirming', async () => {
    const { onConfirm, onOpenChange } = setup()
    expect(screen.getByText('¿Archivar?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Archivar' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('does not confirm when cancelling', async () => {
    const { onConfirm, onOpenChange } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
