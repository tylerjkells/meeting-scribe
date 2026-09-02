/**
 * Re-transcribe a meeting from its saved audio. The main process keeps only
 * the playback file (webm, or wav for recovered recordings) and has no
 * decoder, so the renderer decodes it with Web Audio straight to 16kHz mono,
 * streams the PCM over IPC, and the normal pipeline takes it from there.
 */

const RATE = 16000

export async function retranscribeMeeting(
  id: string,
  onPhase: (phase: string) => void
): Promise<void> {
  onPhase('Loading the recording…')
  const res = await fetch(`scribe-media://${id}`)
  if (!res.ok) throw new Error('The audio file for this meeting is missing.')
  const encoded = await res.arrayBuffer()

  onPhase('Decoding audio…')
  // a 1-frame offline context still decodes; decodeAudioData resamples to its rate
  const ctx = new OfflineAudioContext(1, 1, RATE)
  const decoded = await ctx.decodeAudioData(encoded)

  const ok = await window.scribe.meetings.retranscribeBegin(id)
  if (!ok) throw new Error('This meeting is busy; try again in a moment.')

  try {
    onPhase('Preparing audio for the engine…')
    const n = decoded.length
    const channels = decoded.numberOfChannels
    const chunkFrames = RATE * 10
    const mono = new Float32Array(chunkFrames)
    const other = new Float32Array(chunkFrames)
    for (let start = 0; start < n; start += chunkFrames) {
      const len = Math.min(chunkFrames, n - start)
      decoded.copyFromChannel(mono, 0, start)
      for (let c = 1; c < channels; c++) {
        decoded.copyFromChannel(other, c, start)
        for (let i = 0; i < len; i++) mono[i] += other[i]
      }
      const out = new Int16Array(len)
      for (let i = 0; i < len; i++) {
        const v = Math.max(-1, Math.min(1, mono[i] / channels))
        out[i] = Math.round(v * 32767)
      }
      window.scribe.meetings.retranscribePcm(id, out.buffer)
      // let the IPC queue drain so a long meeting doesn't pile up in memory
      if (start % (chunkFrames * 6) === 0) await new Promise((r) => setTimeout(r, 0))
    }
    onPhase('Handing off to the transcription engine…')
    await window.scribe.meetings.retranscribeFinish(id)
  } catch (err) {
    await window.scribe.meetings.retranscribeCancel(id).catch(() => {})
    throw err
  }
}
