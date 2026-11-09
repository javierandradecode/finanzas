import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Segmented } from './Segmented'

const options = [
  { value: 'a', label: 'Uno' },
  { value: 'b', label: 'Dos' },
  { value: 'c', label: 'Tres' },
]

describe('Segmented', () => {
  it('is a labelled radio group with the current option checked', () => {
    render(<Segmented label="Tipo" value="b" options={options} onChange={vi.fn()} />)
    expect(screen.getByRole('radiogroup', { name: 'Tipo' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Dos' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Uno' })).not.toBeChecked()
  })

  it('reports the chosen value on click', async () => {
    const onChange = vi.fn()
    render(<Segmented label="Tipo" value="a" options={options} onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Tres' }))
    expect(onChange).toHaveBeenCalledWith('c')
  })

  it('moves with the arrow keys like any radio group', async () => {
    const onChange = vi.fn()
    render(<Segmented label="Tipo" value="a" options={options} onChange={onChange} />)
    screen.getByRole('radio', { name: 'Uno' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('can be named by a visible label instead', () => {
    render(
      <>
        <span id="lbl">Tipo de cuenta</span>
        <Segmented labelledBy="lbl" value="a" options={options} onChange={vi.fn()} />
      </>,
    )
    expect(screen.getByRole('radiogroup', { name: 'Tipo de cuenta' })).toBeInTheDocument()
  })

  it('two groups on one page do not share their selection', () => {
    render(
      <>
        <Segmented label="Uno" value="a" options={options} onChange={vi.fn()} />
        <Segmented label="Dos" value="b" options={options} onChange={vi.fn()} />
      </>,
    )
    const checked = screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked)
    expect(checked).toHaveLength(2)
  })
})
