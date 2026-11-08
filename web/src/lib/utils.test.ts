import { cn } from './utils'

describe('cn', () => {
  it('joins truthy class names and merges tailwind conflicts', () => {
    expect(cn('a', undefined, 'c')).toBe('a c')
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })
})
