import { mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import { meetingDir, writeMeeting } from './store'
import type { Meeting, TranscriptSegment } from '../shared/types'

/** leading [hh:]mm:ss timestamp, with optional brackets/parens */
const TIME_RE = /^\s*[[(]?(\d{1,2}):(\d{2})(?::(\d{2}))?[\])]?\s*[-–—]?\s*/

const WORDS_PER_MS = 150 / 60000 // ~150 spoken words per minute

/**
 * Parse pasted transcript text into segments. Uses the source's own
 * timestamps when at least half the lines carry one; otherwise estimates
 * times from cumulative word count at a normal speaking pace.
 */
export function parseTranscript(text: string): { segments: TranscriptSegment[]; durationMs: number } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  const raw: { time: number | null; text: string }[] = []
  for (const line of lines) {
    const m = line.match(TIME_RE)
    if (m) {
      const h = m[3] !== undefined ? Number(m[1]) : 0
      const min = m[3] !== undefined ? Number(m[2]) : Number(m[1])
      const sec = Number(m[3] ?? m[2])
      const rest = line.slice(m[0].length).trim()
      if (rest) raw.push({ time: (h * 3600 + min * 60 + sec) * 1000, text: rest })
    } else {
      raw.push({ time: null, text: line })
    }
  }
  if (raw.length === 0) return { segments: [], durationMs: 0 }

  const timestamped = raw.filter((r) => r.time !== null).length
  const useSourceTimes = timestamped >= raw.length / 2

  const segments: TranscriptSegment[] = []
  let cursor = 0
  for (const r of raw) {
    const words = r.text.split(/\s+/).length
    const estMs = Math.max(800, Math.round(words / WORDS_PER_MS))
    const from = useSourceTimes && r.time !== null ? r.time : cursor
    segments.push({ from, to: from + estMs, text: r.text })
    cursor = from + estMs
  }
  // when using source times, close each segment at the next one's start
  if (useSourceTimes) {
    for (let i = 0; i < segments.length - 1; i++) {
      if (segments[i + 1].from > segments[i].from) segments[i].to = segments[i + 1].from
    }
  }
  const durationMs = segments[segments.length - 1].to
  return { segments, durationMs }
}

export function createImportedMeeting(title: string, dateIso: string, text: string): Meeting {
  const { segments, durationMs } = parseTranscript(text)
  if (segments.length === 0) {
    throw new Error('No usable text found in the pasted transcript.')
  }
  const when = new Date(dateIso)
  const id = `${when.toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
  mkdirSync(meetingDir(id), { recursive: true })
  const meeting: Meeting = {
    id,
    title: title.trim() || `Imported meeting · ${when.toLocaleDateString()}`,
    createdAt: when.toISOString(),
    durationMs,
    mode: 'imported',
    stage: 'recorded',
    hasAudio: false,
    transcript: segments
  }
  writeMeeting(meeting)
  return meeting
}
