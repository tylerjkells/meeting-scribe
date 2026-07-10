import { app } from 'electron'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  createWriteStream,
  type WriteStream
} from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { EnergySample, Meeting, MeetingListItem, RecordingMode } from '../shared/types'

export function meetingsRoot(): string {
  const dir = join(app.getPath('userData'), 'meetings')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function meetingDir(id: string): string {
  return join(meetingsRoot(), id)
}

function metaPath(id: string): string {
  return join(meetingDir(id), 'meeting.json')
}

export function audioPath(id: string): string {
  return join(meetingDir(id), 'audio.webm')
}

export function wavPath(id: string): string {
  return join(meetingDir(id), 'whisper-input.wav')
}

export function energyPath(id: string): string {
  return join(meetingDir(id), 'energy.json')
}

export function readMeeting(id: string): Meeting | null {
  try {
    return JSON.parse(readFileSync(metaPath(id), 'utf-8')) as Meeting
  } catch {
    return null
  }
}

export function writeMeeting(meeting: Meeting): void {
  mkdirSync(meetingDir(meeting.id), { recursive: true })
  writeFileSync(metaPath(meeting.id), JSON.stringify(meeting, null, 2))
}

export function listMeetings(): MeetingListItem[] {
  const root = meetingsRoot()
  const items: MeetingListItem[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const m = readMeeting(entry.name)
    if (!m) continue
    items.push({
      id: m.id,
      title: m.title,
      createdAt: m.createdAt,
      durationMs: m.durationMs,
      mode: m.mode,
      stage: m.stage,
      progress: m.progress,
      error: m.error,
      tldr: m.summary?.tldr
    })
  }
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return items
}

export function deleteMeeting(id: string): void {
  rmSync(meetingDir(id), { recursive: true, force: true })
}

// ---------------------------------------------------------------------------
// Live recording sessions: PCM chunks stream in over IPC and append to a raw
// file; on finish we wrap it in a WAV header for Whisper and store the
// compressed webm alongside for playback.
// ---------------------------------------------------------------------------

interface RecSession {
  id: string
  mode: RecordingMode
  startedAt: string
  pcmStream: WriteStream
  pcmBytes: number
}

const sessions = new Map<string, RecSession>()

export function beginRecording(mode: RecordingMode): string {
  const now = new Date()
  const id = `${now.toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
  mkdirSync(meetingDir(id), { recursive: true })
  const pcmStream = createWriteStream(join(meetingDir(id), 'raw.pcm'))
  sessions.set(id, { id, mode, startedAt: now.toISOString(), pcmStream, pcmBytes: 0 })
  return id
}

export function appendPcm(id: string, chunk: Buffer): void {
  const s = sessions.get(id)
  if (!s) return
  s.pcmStream.write(chunk)
  s.pcmBytes += chunk.length
}

const SAMPLE_RATE = 16000

function wavHeader(dataBytes: number): Buffer {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + dataBytes, 4)
  h.write('WAVE', 8)
  h.write('fmt ', 12)
  h.writeUInt32LE(16, 16) // PCM chunk size
  h.writeUInt16LE(1, 20) // PCM format
  h.writeUInt16LE(1, 22) // mono
  h.writeUInt32LE(SAMPLE_RATE, 24)
  h.writeUInt32LE(SAMPLE_RATE * 2, 28) // byte rate (16-bit mono)
  h.writeUInt16LE(2, 32) // block align
  h.writeUInt16LE(16, 34) // bits per sample
  h.write('data', 36)
  h.writeUInt32LE(dataBytes, 40)
  return h
}

export async function finishRecording(
  id: string,
  webm: Buffer,
  durationMs: number,
  energy: EnergySample[] | null
): Promise<Meeting> {
  const s = sessions.get(id)
  if (!s) throw new Error(`No active recording session ${id}`)
  sessions.delete(id)

  await new Promise<void>((resolve, reject) =>
    s.pcmStream.end((err: NodeJS.ErrnoException | null | undefined) => (err ? reject(err) : resolve()))
  )

  // raw.pcm -> whisper-input.wav (prepend header, then stream-copy)
  const rawPath = join(meetingDir(id), 'raw.pcm')
  const wav = createWriteStream(wavPath(id))
  wav.write(wavHeader(s.pcmBytes))
  await new Promise<void>((resolve, reject) => {
    const { createReadStream } = require('fs') as typeof import('fs')
    const rd = createReadStream(rawPath)
    rd.on('error', reject)
    wav.on('error', reject)
    wav.on('finish', resolve)
    rd.pipe(wav)
  })
  rmSync(rawPath, { force: true })

  writeFileSync(audioPath(id), webm)
  if (energy && energy.length > 0) {
    writeFileSync(energyPath(id), JSON.stringify(energy))
  }

  const when = new Date(s.startedAt)
  const meeting: Meeting = {
    id,
    title: defaultTitle(when, s.mode),
    createdAt: s.startedAt,
    durationMs,
    mode: s.mode,
    stage: 'recorded',
    hasAudio: true
  }
  writeMeeting(meeting)
  return meeting
}

export function cancelRecording(id: string): void {
  const s = sessions.get(id)
  if (s) {
    s.pcmStream.destroy()
    sessions.delete(id)
  }
  rmSync(meetingDir(id), { recursive: true, force: true })
}

function defaultTitle(when: Date, mode: RecordingMode): string {
  const date = when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const time = when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${mode === 'virtual' ? 'Virtual meeting' : 'Meeting'} · ${date}, ${time}`
}
