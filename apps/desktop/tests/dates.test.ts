import { groupByDate } from '../src/utils/dates'

const c = (id: string, iso: string) => ({ id, title: id, created_at: iso, updated_at: iso })

describe('groupByDate', () => {
  it('groups into Today / Yesterday / Previous 7 days / Older, in order', () => {
    const now = new Date(2026, 9, 11, 15, 0, 0)
    const local = (d: Date) => d.toISOString().replace('Z', '')
    const day = (n: number) => local(new Date(2026, 9, 11 - n, 12, 0, 0))
    const groups = groupByDate([c('a', day(0)), c('b', day(1)), c('c', day(4)), c('d', day(30))], now)
    expect(groups.map(([g]) => g)).toEqual(['Today', 'Yesterday', 'Previous 7 days', 'Older'])
  })
  it('omits empty groups', () => {
    const now = new Date(2026, 9, 11, 15, 0, 0)
    expect(groupByDate([], now)).toEqual([])
  })
})
