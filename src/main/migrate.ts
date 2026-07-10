import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import fixWebmDuration from 'fix-webm-duration'
import { meetingsRoot, meetingDir, readMeeting } from './store'
import { readdirSync } from 'fs'

/** the fix-webm-duration library is browser-oriented; it only needs this much
 *  of FileReader to run in the main process */
function ensureFileReader(): void {
  const g = globalThis as Record<string, unknown>
  if (typeof g.FileReader !== 'undefined') return
  g.FileReader = class {
    result: ArrayBuffer | null = null
    onloadend: (() => void) | null = null
    readAsArrayBuffer(blob: Blob): void {
      blob.arrayBuffer().then((ab) => {
        this.result = ab
        this.onloadend?.()
      })
    }
  }
}

function hasDurationHeader(file: string): boolean {
  const head = readFileSync(file).subarray(0, 4096)
  for (let i = 0; i < head.length - 1; i++) {
    if (head[i] === 0x44 && head[i + 1] === 0x89) return true
  }
  return false
}

/**
 * Recordings made before v0.2.1 lack a webm duration header, which breaks
 * seeking. Patch them in place using the meeting's known duration.
 */
export async function patchLegacyAudioDurations(): Promise<number> {
  ensureFileReader()
  const fix = ((fixWebmDuration as unknown as { default?: typeof fixWebmDuration }).default ??
    fixWebmDuration) as typeof fixWebmDuration
  if (typeof fix !== 'function') return 0

  let patched = 0
  for (const entry of readdirSync(meetingsRoot(), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const meeting = readMeeting(entry.name)
    if (!meeting?.hasAudio || !meeting.durationMs) continue
    const file = join(meetingDir(entry.name), 'audio.webm')
    if (!existsSync(file)) continue
    try {
      if (hasDurationHeader(file)) continue
      const bytes = readFileSync(file)
      const blob = new Blob([bytes], { type: 'audio/webm' })
      const fixed = await fix(blob, meeting.durationMs, { logger: false })
      const out = Buffer.from(await fixed.arrayBuffer())
      if (out.length > bytes.length) {
        writeFileSync(file, out)
        patched++
      }
    } catch {
      // leave the file as-is; playback from the start still works
    }
  }
  return patched
}
