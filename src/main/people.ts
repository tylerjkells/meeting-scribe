import { listMeetings, readMeeting } from './store'
import { getSettings } from './settings'
import { parseDueDate } from './dates'
import type {
  ActionRollupItem,
  Meeting,
  PersonMeetingRef,
  PersonProfile,
  PersonSummary
} from '../shared/types'

// ---------------------------------------------------------------------------
// Person pages: everything the library knows about one colleague, assembled
// from data that already exists — action-item owners, calendar attendees,
// named speakers, and the team directory. No model calls.
// ---------------------------------------------------------------------------

const NOT_PEOPLE = new Set(['me', 'them'])

function norm(name: string): string {
  return name.trim().toLowerCase()
}

/** display names of everyone associated with a meeting (excluding the user) */
function meetingPeople(m: Meeting): string[] {
  const names: string[] = []
  for (const a of m.attendees ?? []) names.push(a)
  if (m.speakerNames?.them) names.push(m.speakerNames.them)
  for (const item of m.summary?.actionItems ?? []) {
    if (item.owner) names.push(item.owner)
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of names) {
    const key = norm(n)
    if (!key || NOT_PEOPLE.has(key) || seen.has(key)) continue
    seen.add(key)
    out.push(n.trim())
  }
  return out
}

export function listPeople(): PersonSummary[] {
  const byKey = new Map<string, PersonSummary>()
  const add = (name: string): PersonSummary => {
    const key = norm(name)
    let entry = byKey.get(key)
    if (!entry) {
      entry = { name: name.trim(), meetingCount: 0, openItems: 0 }
      byKey.set(key, entry)
    }
    return entry
  }

  // directory members always appear, even before any meetings
  for (const name of getSettings().people) add(name)

  for (const listItem of listMeetings()) {
    const m = readMeeting(listItem.id)
    if (!m) continue
    for (const name of meetingPeople(m)) {
      add(name).meetingCount++
    }
    for (const item of m.summary?.actionItems ?? []) {
      if (!item.owner || NOT_PEOPLE.has(norm(item.owner)) || item.done) continue
      add(item.owner).openItems++
    }
  }

  return [...byKey.values()].sort(
    (a, b) => b.openItems - a.openItems || b.meetingCount - a.meetingCount || a.name.localeCompare(b.name)
  )
}

export function personProfile(name: string): PersonProfile | null {
  const key = norm(name)
  if (!key || NOT_PEOPLE.has(key)) return null

  const meetings: PersonMeetingRef[] = []
  const items: ActionRollupItem[] = []
  const myCommitments: ActionRollupItem[] = []
  let display = name.trim()

  for (const listItem of listMeetings()) {
    const m = readMeeting(listItem.id)
    if (!m) continue
    const people = meetingPeople(m)
    const together = people.some((p) => norm(p) === key)
    if (!together) continue

    // keep the most recent spelling as the display name
    if (meetings.length === 0) {
      const match = people.find((p) => norm(p) === key)
      if (match) display = match
    }
    meetings.push({
      id: m.id,
      title: m.title,
      createdAt: m.createdAt,
      tldr: m.summary?.tldr
    })

    m.summary?.actionItems.forEach((a, index) => {
      const rollup: ActionRollupItem = {
        meetingId: m.id,
        meetingTitle: m.title,
        createdAt: m.createdAt,
        index,
        task: a.task,
        owner: a.owner,
        due: a.due,
        done: a.done ?? false,
        dueDate: parseDueDate(a.due, m.createdAt) ?? undefined
      }
      if (a.owner && norm(a.owner) === key) items.push(rollup)
      else if (a.owner && norm(a.owner) === 'me' && !rollup.done) myCommitments.push(rollup)
    })
  }

  return { name: display, meetings, items, myCommitments }
}
