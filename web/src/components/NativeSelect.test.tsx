import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NativeSelect } from './NativeSelect'

describe('NativeSelect', () => {
  it('is still a plain, labelled <select> that reports the chosen option', async () => {
    const onChange = vi.fn()
    render(
      <>
        <label htmlFor="s">Cuenta</label>
        <NativeSelect id="s" defaultValue="" onChange={onChange}>
          <option value="">Todas</option>
          <option value="a">Caja</option>
        </NativeSelect>
      </>,
    )
    const select = screen.getByLabelText('Cuenta')
    expect(select.tagName).toBe('SELECT')
    await userEvent.selectOptions(select, 'a')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(select).toHaveValue('a')
  })

  it('draws its own arrow (the browser one is hidden) and keeps it away from screen readers', () => {
    const { container } = render(
      <NativeSelect aria-label="x">
        <option>uno</option>
      </NativeSelect>,
    )
    expect(screen.getByLabelText('x')).toHaveClass('appearance-none')
    const arrow = container.querySelector('svg')
    expect(arrow).not.toBeNull()
    expect(arrow).toHaveAttribute('aria-hidden', 'true')
    expect(arrow).toHaveClass('pointer-events-none') // clicks reach the select under it
  })

  it('leaves room for the arrow so long option text does not run under it', () => {
    render(
      <NativeSelect aria-label="x">
        <option>uno</option>
      </NativeSelect>,
    )
    expect(screen.getByLabelText('x')).toHaveClass('pr-8')
  })

  it('passes disabled and invalid state through to the select', () => {
    render(
      <NativeSelect aria-label="x" disabled aria-invalid>
        <option>uno</option>
      </NativeSelect>,
    )
    expect(screen.getByLabelText('x')).toBeDisabled()
    expect(screen.getByLabelText('x')).toBeInvalid()
  })
})
