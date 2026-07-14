import { listMeetings, readMeeting } from './store'
import type { EventBrief, Meeting } from '../shared/types'

// ---------------------------------------------------------------------------
// Pre-meeting briefs: for a calendar event, find the most recent library
// meeting from the same series and surface where it left off. Built entirely
// from the stored summary — no model call, no cost, no latency.
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'meeting', 'call', 'sync', 'weekly', 'monthly', 'daily', 'check'
])

function significantWords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
}

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString()
}

/**
 * The most recent past meeting matching an event title. Recordings made
 * during a calendar event inherit its title, so recurring series match
 * exactly; otherwise fall back to "every significant word appears somewhere
 * in the meeting" like library search.
 */
function findSeriesMeeting(eventTitle: string): Meeting | null {
  const items = listMeetings() // newest first
  const norm = eventTitle.trim().toLowerCase()

  for (const it of items) {
    if (isToday(it.createdAt)) continue
    if (it.title.trim().toLowerCase() === norm) {
      const m = readMeeting(it.id)
      if (m) return m
    }
  }

  // one generic word ("team") matches half the library; demand at least two
  const words = significantWords(eventTitle)
  if (words.length < 2) return null
  for (const it of items) {
    if (isToday(it.createdAt)) continue
    const m = readMeeting(it.id)
    if (!m) continue
    const haystack = [
      m.title,
      m.summary ? JSON.stringify(m.summary) : '',
      (m.transcript ?? []).map((s) => s.text).join(' ')
    ]
      .join(' ')
      .toLowerCase()
    if (words.every((w) => haystack.includes(w))) return m
  }
  return null
}

export function briefForEvent(eventTitle: string): EventBrief | null {
  const meeting = findSeriesMeeting(eventTitle)
  if (!meeting) return null
  const s = meeting.summary
  return {
    meetingId: meeting.id,
    meetingTitle: meeting.title,
    createdAt: meeting.createdAt,
    tldr: s?.tldr ?? null,
    decisions: s?.decisions ?? [],
    openActions: (s?.actionItems ?? [])
      .filter((a) => !a.done)
      .map((a) => ({ task: a.task, owner: a.owner, due: a.due })),
    openQuestions: s?.openQuestions ?? []
  }
}
