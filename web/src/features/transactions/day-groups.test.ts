import { groupByDay } from './day-groups'

const tx = (id: string, day: string) => ({ id, date: `${day}T00:00:00.000Z` })

describe('groupByDay', () => {
  it('groups consecutive items of the same UTC day and keeps the order', () => {
    const groups = groupByDay([
      tx('a', '2026-03-12'),
      tx('b', '2026-03-12'),
      tx('c', '2026-03-10'),
    ])
    expect(groups.map((g) => g.day)).toEqual(['2026-03-12', '2026-03-10'])
    expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(groups[1].items.map((i) => i.id)).toEqual(['c'])
  })

  it('uses the UTC day, not the local one', () => {
    // 23:30 UTC is already "tomorrow" in some timezones, but the day is the UTC one
    const [g] = groupByDay([{ date: '2026-03-12T23:30:00.000Z' }])
    expect(g.day).toBe('2026-03-12')
  })

  it('does not merge a day that comes back later (the API sorts by date)', () => {
    expect(
      groupByDay([tx('a', '2026-03-12'), tx('b', '2026-03-10'), tx('c', '2026-03-12')]),
    ).toHaveLength(3)
  })

  it('returns no groups for no items', () => {
    expect(groupByDay([])).toEqual([])
  })
})
