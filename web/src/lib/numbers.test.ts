import { parseIntText, parseRate } from './numbers'

describe('parseRate', () => {
  it.each([
    ['18', 18],
    ['18,5', 18.5],
    ['18.5', 18.5],
    ['0', 0],
    ['0,25', 0.25],
    [' 12 ', 12],
  ])('parses %p as %p', (text, value) => {
    expect(parseRate(text)).toBe(value)
  })

  it.each(['', '  ', 'abc', '-1', '1,234', '1.2.3', '12,', ',5', '1e2'])(
    'rejects %p',
    (text) => {
      expect(parseRate(text)).toBeNull()
    },
  )
})

describe('parseIntText', () => {
  it.each([
    ['5', 5],
    [' 12 ', 12],
    ['031', 31],
  ])('parses %p as %p', (text, value) => {
    expect(parseIntText(text)).toBe(value)
  })

  it.each(['', 'a', '1.5', '-2', '1,5', '1e2'])('rejects %p', (text) => {
    expect(parseIntText(text)).toBeNull()
  })
})
