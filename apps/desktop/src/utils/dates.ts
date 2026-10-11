import type { ConversationSummary } from '../types/api'

export const GROUP_ORDER = ['Today', 'Yesterday', 'Previous 7 days', 'Older'] as const

export function groupByDate(items: ConversationSummary[], now = new Date()): [string, ConversationSummary[]][] {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const today = startOfDay(now)
  const DAY = 86_400_000
  const groups = new Map<string, ConversationSummary[]>()
  for (const c of items) {
    // The backend stores UTC without a zone suffix; treat it as UTC.
    const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(c.updated_at) ? c.updated_at : `${c.updated_at}Z`
    const t = startOfDay(new Date(iso))
    const label = t >= today ? 'Today' : t >= today - DAY ? 'Yesterday' : t >= today - 7 * DAY ? 'Previous 7 days' : 'Older'
    groups.set(label, [...(groups.get(label) ?? []), c])
  }
  return GROUP_ORDER.filter((g) => groups.has(g)).map((g) => [g, groups.get(g)!])
}
