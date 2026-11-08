import { formatMoney, parseMoneyToCents } from './money'

describe('parseMoneyToCents', () => {
  it.each([
    ['12.50', 1250],
    ['12,50', 1250],
    ['12,5', 1250],
    ['0,5', 50],
    ['0.1', 10],
    ['1.234,56', 123456],
    ['1,234.56', 123456],
    ['1.234.567', 123456700],
    ['-3', -300],
    ['-0,5', -50],
    ['  7 ', 700],
    ['1000', 100000],
    ['0', 0],
    ['-0', 0],
  ])('parses %p as %p cents', (text, cents) => {
    expect(parseMoneyToCents(text)).toBe(cents)
  })

  it.each([
    '',
    '   ',
    'abc',
    '-',
    '1.2.3',
    '12.345', // ambiguous (thousands or decimals?): rejected on purpose
    '12,345',
    '1,2.3',
    '1.234,567',
    '12.',
    ',5',
    '1e3',
    '99999999999999999999',
  ])('rejects %p', (text) => {
    expect(parseMoneyToCents(text)).toBeNull()
  })

  it('never goes through floating point', () => {
    expect(parseMoneyToCents('0.1')! + parseMoneyToCents('0.2')!).toBe(30)
    expect(parseMoneyToCents('1.15')).toBe(115)
    expect(parseMoneyToCents('8.20')).toBe(820)
  })
})

describe('formatMoney', () => {
  it('formats thousands and decimals in Spanish', () => {
    const out = formatMoney(123456, 'USD')
    expect(out).toContain('1.234,56')
    expect(out).toMatch(/\$|USD/)
  })

  it('keeps the sign for negatives', () => {
    const out = formatMoney(-500, 'USD')
    expect(out).toContain('-')
    expect(out).toContain('5,00')
  })

  it('formats zero', () => {
    expect(formatMoney(0, 'USD')).toContain('0,00')
  })
})
