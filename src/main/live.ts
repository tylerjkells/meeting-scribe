import { writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { transcribeFile, liveThreads, defaultThreads } from './whisper'
import type { TranscriptSegment, WhisperModel } from '../shared/types'

const SAMPLE_RATE = 16000
const BYTES_PER_SEC = SAMPLE_RATE * 2 // 16-bit mono
const CUT_TARGET_SEC = 45
const CUT_SEARCH_SEC = 15
const MIN_TAIL_SEC = 1

function wavHeader(dataBytes: number): Buffer {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + dataBytes, 4)
  h.write('WAVE', 8)
  h.write('fmt ', 12)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(SAMPLE_RATE, 24)
  h.writeUInt32LE(BYTES_PER_SEC, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(dataBytes, 40)
  return h
}

/** RMS of a 16-bit PCM span */
function rms(buf: Buffer, start: number, end: number): number {
  let sum = 0
  let n = 0
  for (let i = start; i + 1 < end; i += 2) {
    const v = buf.readInt16LE(i)
    sum += v * v
    n++
  }
  return n ? Math.sqrt(sum / n) : 0
}

/**
 * Transcribes a recording incrementally while it is still being captured.
 * PCM is accumulated and cut into ~45s chunks at the quietest moment in the
 * last 15s of each chunk, so words are not split mid-utterance. Each chunk is
 * transcribed with the previous chunk's tail as decoding context.
 */
export class LiveTranscriber {
  private buffers: Buffer[] = []
  private bytesBuffered = 0
  private offsetMs = 0
  private chunkIndex = 0
  private prevText = ''
  private queue: Promise<void> = Promise.resolve()
  private failed = false
  private finished = false
  readonly segments: TranscriptSegment[] = []

  constructor(
    private dir: string,
    private model: WhisperModel,
    private onUpdate: (segments: TranscriptSegment[], transcribedMs: number) => void
  ) {}

  feed(chunk: Buffer): void {
    if (this.failed || this.finished) return
    this.buffers.push(chunk)
    this.bytesBuffered += chunk.length
    if (this.bytesBuffered >= CUT_TARGET_SEC * BYTES_PER_SEC) {
      this.cut(false)
    }
  }

  /** slice off a chunk at a good boundary and queue it for transcription */
  private cut(force: boolean): void {
    const whole = Buffer.concat(this.buffers)
    let cutAt = whole.length
    if (!force) {
      // look for the quietest 300ms window in the last CUT_SEARCH_SEC
      const searchStart = Math.max(0, whole.length - CUT_SEARCH_SEC * BYTES_PER_SEC)
      const win = Math.floor(0.3 * BYTES_PER_SEC) & ~1
      let best = Infinity
      let bestPos = whole.length
      for (let pos = searchStart; pos + win <= whole.length; pos += win) {
        const level = rms(whole, pos, pos + win)
        if (level < best) {
          best = level
          bestPos = pos + win / 2
        }
      }
      cutAt = Math.floor(bestPos) & ~1
    }
    const chunk = whole.subarray(0, cutAt)
    const rest = whole.subarray(cutAt)
    this.buffers = rest.length ? [Buffer.from(rest)] : []
    this.bytesBuffered = rest.length
    if (chunk.length < MIN_TAIL_SEC * BYTES_PER_SEC) return

    const chunkOffsetMs = this.offsetMs
    this.offsetMs += (chunk.length / BYTES_PER_SEC) * 1000
    const index = this.chunkIndex++
    this.queue = this.queue
      .then(() => this.runChunk(Buffer.from(chunk), chunkOffsetMs, index))
      .catch(() => {
        this.failed = true
      })
  }

  private async runChunk(pcm: Buffer, offsetMs: number, index: number): Promise<void> {
    if (this.failed) return
    const wav = join(this.dir, `live-${index}.wav`)
    try {
      writeFileSync(wav, Buffer.concat([wavHeader(pcm.length), pcm]))
      const threads = this.finished ? defaultThreads() : liveThreads()
      const segs = await transcribeFile(wav, this.model, {
        threads,
        prompt: this.prevText.slice(-200) || undefined
      })
      // whisper pads short chunks to its 30s window; clamp times to real audio
      const chunkMs = (pcm.length / BYTES_PER_SEC) * 1000
      for (const s of segs) {
        this.segments.push({
          from: Math.round(Math.min(s.from, chunkMs) + offsetMs),
          to: Math.round(Math.min(s.to, chunkMs) + offsetMs),
          text: s.text
        })
      }
      this.prevText = segs.map((s) => s.text).join(' ')
      this.onUpdate([...this.segments], Math.round(this.offsetMs))
    } finally {
      rmSync(wav, { force: true })
    }
  }

  /**
   * Flush the remaining audio and wait for the queue to drain.
   * Returns the full transcript, or null if any chunk failed (caller should
   * fall back to whole-file transcription).
   */
  async finish(): Promise<TranscriptSegment[] | null> {
    this.finished = true
    if (this.bytesBuffered > 0) this.cut(true)
    await this.queue
    if (this.failed) return null
    return this.segments
  }

  abort(): void {
    this.failed = true
    this.finished = true
    this.buffers = []
  }
}
