import { listMeetings, readMeeting } from './store'
import { parseDueDate } from './dates'
import type { ActionRollupItem, WeeklyDigest } from '../shared/types'

// ---------------------------------------------------------------------------
// Weekly digest: a Monday-morning review assembled locally from the library —
// last week's meetings, your open items, what's been open too long, and who
// owes what. No model calls.
// ---------------------------------------------------------------------------

const AGING_DAYS = 14

export function buildDigest(): WeeklyDigest {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 86400000)
  const agingCutoff = new Date(now.getTime() - AGING_DAYS * 86400000)

  const lastWeekMeetings: WeeklyDigest['lastWeekMeetings'] = []
  const myOpen: ActionRollupItem[] = []
  const aging: ActionRollupItem[] = []
  const byPerson = new Map<string, { name: string; count: number }>()

  for (const entry of listMeetings()) {
    const m = readMeeting(entry.id)
    if (!m) continue

    const created = new Date(m.createdAt)
    if (created >= weekAgo && created <= now) {
      lastWeekMeetings.push({
        id: m.id,
        title: m.title,
        createdAt: m.createdAt,
        durationMs: m.durationMs
      })
    }

    m.summary?.actionItems.forEach((a, index) => {
      if (a.done) return
      const rollup: ActionRollupItem = {
        meetingId: m.id,
        meetingTitle: m.title,
        createdAt: m.createdAt,
        index,
        task: a.task,
        owner: a.owner,
        due: a.due,
        done: false,
        dueDate: parseDueDate(a.due, m.createdAt) ?? undefined
      }
      const owner = a.owner?.trim().toLowerCase()
      if (owner === 'me') {
        myOpen.push(rollup)
      } else if (a.owner && owner !== 'them') {
        const key = owner!
        const entry = byPerson.get(key) ?? { name: a.owner.trim(), count: 0 }
        entry.count++
        byPerson.set(key, entry)
      }
      if (created < agingCutoff) aging.push(rollup)
    })
  }

  const weekLabel = now.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })

  // most urgent first: dated items ascending, undated after
  const byUrgency = (a: ActionRollupItem, b: ActionRollupItem): number =>
    (a.dueDate ?? '9999') < (b.dueDate ?? '9999') ? -1 : 1
  myOpen.sort(byUrgency)
  aging.sort(byUrgency)

  return {
    weekLabel,
    lastWeekMeetings,
    myOpen,
    aging,
    byPerson: [...byPerson.values()].sort((a, b) => b.count - a.count).slice(0, 8)
  }
}
