import { act, renderHook } from '@testing-library/react'
import { useSlow } from './use-slow'

describe('useSlow', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('turns true only after the wait, while still active', () => {
    const { result } = renderHook(({ active }) => useSlow(active, 4000), {
      initialProps: { active: true },
    })
    expect(result.current).toBe(false)
    act(() => {
      vi.advanceTimersByTime(3999)
    })
    expect(result.current).toBe(false)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe(true)
  })

  it('never fires if the wait ends first, and starts over next time', () => {
    const { result, rerender } = renderHook(({ active }) => useSlow(active, 4000), {
      initialProps: { active: true },
    })
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    rerender({ active: false })
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(result.current).toBe(false)

    rerender({ active: true })
    expect(result.current).toBe(false) // not instantly slow again
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(result.current).toBe(true)
  })
})
