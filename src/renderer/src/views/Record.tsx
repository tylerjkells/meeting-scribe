import { useEffect, useRef, useState } from 'react'
import type { EngineProgress, EngineStatus, Meeting, RecordingMode } from '../../../shared/types'
import { startRecording, readLevel, type RecorderHandles } from '../recorder'
import { formatDuration, MicIcon, StopIcon } from '../ui'

export function RecordView({
  engine,
  onEngineReady,
  rec,
  setRec,
  paused,
  setPaused,
  onDone,
  onCancel
}: {
  engine: EngineStatus | null
  onEngineReady: (s: EngineStatus) => void
  rec: RecorderHandles | null
  setRec: (r: RecorderHandles | null) => void
  paused: boolean
  setPaused: (p: boolean) => void
  onDone: (m: Meeting) => void
  onCancel: () => void
}): React.JSX.Element {
  const [mode, setMode] = useState<RecordingMode>('virtual')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [liveText, setLiveText] = useState<string>('')

  useEffect(() => {
    if (!rec) return
    setLiveText('')
    return window.scribe.rec.onLive((u) => {
      if (u.id !== rec.id) return
      setLiveText(u.segments.map((s) => s.text).join(' '))
    })
  }, [rec])

  const engineReady = engine?.binaryReady && engine?.modelReady

  // timer (excludes paused time)
  useEffect(() => {
    if (!rec) return
    setElapsed(rec.elapsedMs())
    const t = setInterval(() => setElapsed(rec.elapsedMs()), 250)
    return () => clearInterval(t)
  }, [rec])

  async function begin(): Promise<void> {
    setError(null)
    try {
      const handles = await startRecording(mode)
      setRec(handles)
      setPaused(false)
      setElapsed(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start recording')
    }
  }

  async function stop(): Promise<void> {
    if (!rec || finishing) return
    setFinishing(true)
    try {
      const meeting = await rec.stop()
      setRec(null)
      setPaused(false)
      onDone(meeting)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save recording')
    } finally {
      setFinishing(false)
    }
  }

  async function discard(): Promise<void> {
    if (!rec) return
    const sure = window.confirm('Discard this recording? The audio will be deleted.')
    if (!sure) return
    await rec.cancel()
    setRec(null)
    setPaused(false)
    onCancel()
  }

  if (!engineReady) {
    return <EngineSetup engine={engine} onReady={onEngineReady} />
  }

  if (!rec) {
    return (
      <div className="record-stage">
        <div className="mode-toggle" role="radiogroup" aria-label="Recording mode">
          <button
            className={mode === 'virtual' ? 'active' : ''}
            role="radio"
            aria-checked={mode === 'virtual'}
            onClick={() => setMode('virtual')}
          >
            Virtual meeting
          </button>
          <button
            className={mode === 'in-person' ? 'active' : ''}
            role="radio"
            aria-checked={mode === 'in-person'}
            onClick={() => setMode('in-person')}
          >
            In person
          </button>
        </div>
        <p className="mode-hint">
          {mode === 'virtual'
            ? 'Captures your microphone and everything you hear: Webex, Teams, or any other call audio.'
            : 'Captures your microphone only. Place your laptop where it can hear the room.'}
        </p>
        <button className="big-record" onClick={begin} aria-label="Start recording">
          <MicIcon />
        </button>
        {error && (
          <div className="stage-banner error" role="alert">
            {error}
          </div>
        )}
        <button className="btn btn-ghost" onClick={onCancel}>
          Back to meetings
        </button>
      </div>
    )
  }

  return (
    <div className="record-stage">
      <span className={`rec-live ${paused ? 'paused' : ''}`}>
        <span className="dot" aria-hidden="true" />
        {paused ? 'PAUSED' : `RECORDING ${rec.mode === 'virtual' ? '· MIC + SYSTEM AUDIO' : '· MIC'}`}
      </span>
      <div className="rec-timer" aria-live="off">
        {formatDuration(elapsed)}
      </div>
      <Meters rec={rec} />
      {liveText && (
        <p className="live-captions" aria-live="polite">
          {liveText}
        </p>
      )}
      <p className="mode-hint">
        You can browse other meetings while this records; the sidebar shows a live indicator that
        brings you back here.
      </p>
      <div className="rec-actions">
        <button
          className="btn"
          onClick={() => {
            if (paused) rec.resume()
            else rec.pause()
            setPaused(!paused)
          }}
          disabled={finishing}
        >
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button className="btn btn-primary" onClick={stop} disabled={finishing}>
          <StopIcon /> {finishing ? 'Finishing transcript…' : 'Stop and transcribe'}
        </button>
        <button className="btn btn-ghost btn-danger" onClick={discard} disabled={finishing}>
          Discard
        </button>
      </div>
      {error && (
        <div className="stage-banner error" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}

function Meters({ rec }: { rec: RecorderHandles }): React.JSX.Element {
  const micRef = useRef<HTMLDivElement>(null)
  const sysRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const micBuf = new Uint8Array(rec.micAnalyser.fftSize)
    const sysBuf = rec.sysAnalyser ? new Uint8Array(rec.sysAnalyser.fftSize) : null
    let raf = 0
    const tick = (): void => {
      if (micRef.current) {
        micRef.current.style.transform = `scaleX(${readLevel(rec.micAnalyser, micBuf)})`
      }
      if (rec.sysAnalyser && sysBuf && sysRef.current) {
        sysRef.current.style.transform = `scaleX(${readLevel(rec.sysAnalyser, sysBuf)})`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [rec])

  return (
    <div className="meters">
      <div className="meter-row">
        <span>Your mic</span>
        <div className="meter-track">
          <div className="meter-fill" ref={micRef} style={{ transform: 'scaleX(0)' }} />
        </div>
      </div>
      {rec.sysAnalyser && (
        <div className="meter-row">
          <span>Meeting audio</span>
          <div className="meter-track">
            <div className="meter-fill" ref={sysRef} style={{ transform: 'scaleX(0)' }} />
          </div>
        </div>
      )}
    </div>
  )
}

function EngineSetup({
  engine,
  onReady
}: {
  engine: EngineStatus | null
  onReady: (s: EngineStatus) => void
}): React.JSX.Element {
  const [progress, setProgress] = useState<EngineProgress | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => window.scribe.engine.onProgress(setProgress), [])

  async function setup(): Promise<void> {
    setRunning(true)
    setError(null)
    try {
      const status = await window.scribe.engine.setup()
      onReady(status)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
      setRunning(false)
    }
  }

  return (
    <div className="setup-card">
      <h2>One-time setup</h2>
      <p>
        MeetingScribe transcribes on your own machine. Nothing is uploaded, and there is no
        subscription. It first needs to download the speech engine and a language model (about 550
        MB total).
      </p>
      <button className="btn btn-primary" onClick={setup} disabled={running}>
        {running ? 'Downloading…' : engine?.binaryReady ? 'Download speech model' : 'Download engine'}
      </button>
      {running && progress && (
        <div className="setup-progress" aria-live="polite">
          {progress.detail}
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{
                width: progress.percent >= 0 ? `${progress.percent}%` : '100%',
                opacity: progress.percent >= 0 ? 1 : 0.35
              }}
            />
          </div>
        </div>
      )}
      {error && (
        <div className="stage-banner error" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
