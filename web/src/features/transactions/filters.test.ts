import { filtersFromSearch, filtersToQuery, filtersToSearch } from './filters'

const now = new Date(2026, 2, 15)
const parse = (qs: string) => filtersFromSearch(new URLSearchParams(qs), now)

describe('transaction filters', () => {
  it('defaults to the current month and page 1', () => {
    expect(parse('')).toEqual({ from: '2026-03-01', to: '2026-03-31', page: 1 })
  })

  it('reads every filter from the URL', () => {
    expect(
      parse('from=2026-01-01&to=2026-01-31&type=expense&accountId=a1&categoryId=c1&page=3'),
    ).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
      type: 'expense',
      accountId: 'a1',
      categoryId: 'c1',
      page: 3,
    })
  })

  it('keeps a single given date without inventing the other', () => {
    expect(parse('from=2026-01-01')).toMatchObject({ from: '2026-01-01', to: undefined })
  })

  it('keeps a lone `to` too, without falling back to the month', () => {
    expect(parse('to=2026-01-31')).toEqual({ to: '2026-01-31', page: 1 })
  })

  it.each(['0', '-2', 'abc', '1.5'])('falls back to page 1 for page=%s', (page) => {
    expect(parse(`page=${page}`).page).toBe(1)
  })

  it('ignores an unknown type', () => {
    expect(parse('type=foo').type).toBeUndefined()
  })

  it('round-trips through the URL, omitting empty values', () => {
    const f = parse('from=2026-01-01&to=2026-01-31&type=income&page=2')
    expect(filtersToSearch(f).toString()).toBe(
      'from=2026-01-01&to=2026-01-31&type=income&page=2',
    )
    expect(filtersFromSearch(filtersToSearch(f), now)).toEqual(f)
    expect(filtersToSearch({ from: '2026-03-01', to: '2026-03-31', page: 1 }).toString()).toBe(
      'from=2026-03-01&to=2026-03-31',
    )
  })

  it('builds the API query with the limit and only present filters', () => {
    expect(
      filtersToQuery({ from: '2026-03-01', to: '2026-03-31', type: 'expense', page: 2 }),
    ).toBe('?from=2026-03-01&to=2026-03-31&type=expense&page=2&limit=20')
    expect(filtersToQuery({ page: 1 } as never, 50)).toBe('?page=1&limit=50')
  })
})
