import { useEffect, useRef, useState } from 'react'
import type { Meeting } from '../../../shared/types'
import { BackIcon, ChevronIcon, formatDuration, formatWhen, OwnerEditor, StageBadge } from '../ui'
import { exportFilename, meetingToMarkdown, summaryToMarkdown } from '../markdown'

function Collapse({
  label,
  meta,
  topic = false,
  defaultOpen = true,
  children
}: {
  label: string
  meta?: string
  topic?: boolean
  defaultOpen?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="section">
      <button
        className={`collapse-head ${topic ? 'topic' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className={`chevron ${open ? 'open' : ''}`} aria-hidden="true">
          <ChevronIcon />
        </span>
        {label}
        {meta && <span className="collapse-count">{meta}</span>}
      </button>
      {open && <div className="collapse-body">{children}</div>}
    </section>
  )
}

function AudioPlayer({ src, fallbackMs }: { src: string; fallbackMs: number }): React.JSX.Element {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(fallbackMs / 1000)
  const [rate, setRate] = useState(1)

  // MediaRecorder webm files report Infinity duration until forced to scan;
  // this nudge makes Chromium compute the real value.
  function onLoadedMetadata(): void {
    const a = audioRef.current
    if (!a) return
    if (!isFinite(a.duration)) {
      a.currentTime = 1e10
      a.addEventListener(
        'durationchange',
        () => {
          if (isFinite(a.duration)) {
            setDuration(a.duration)
            a.currentTime = 0
          }
        },
        { once: true }
      )
    } else {
      setDuration(a.duration)
    }
  }

  function toggle(): void {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      a.play()
    } else {
      a.pause()
    }
  }

  function cycleRate(): void {
    const next = rate === 1 ? 1.25 : rate === 1.25 ? 1.5 : rate === 1.5 ? 2 : 1
    setRate(next)
    if (audioRef.current) audioRef.current.playbackRate = next
  }

  return (
    <div className="player">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={() => setTime(audioRef.current?.currentTime ?? 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <button className="player-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="5" y="4" width="5" height="16" rx="1.5" />
            <rect x="14" y="4" width="5" height="16" rx="1.5" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7 4.5v15a1 1 0 0 0 1.5.87l13-7.5a1 1 0 0 0 0-1.74l-13-7.5A1 1 0 0 0 7 4.5Z" />
          </svg>
        )}
      </button>
      <span className="player-time">
        {formatDuration(time * 1000)} / {formatDuration(duration * 1000)}
      </span>
      <input
        className="player-seek"
        type="range"
        min={0}
        max={duration || 1}
        step={0.1}
        value={Math.min(time, duration)}
        onChange={(e) => {
          const t = Number(e.target.value)
          if (audioRef.current) audioRef.current.currentTime = t
          setTime(t)
        }}
        aria-label="Seek"
      />
      <button className="player-btn player-rate" onClick={cycleRate} aria-label="Playback speed">
        {rate}×
      </button>
    </div>
  )
}

export function MeetingView({
  id,
  onBack,
  onDeleted
}: {
  id: string
  onBack: () => void
  onDeleted: () => void
}): React.JSX.Element {
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [transcriptToggled, setTranscriptToggled] = useState<boolean | null>(null)
  const [copied, setCopied] = useState(false)
  const [exportedTo, setExportedTo] = useState<string | null>(null)
  const [knownOwners, setKnownOwners] = useState<string[]>([])
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([window.scribe.settings.get(), window.scribe.actions.list()]).then(
      ([settings, items]) => {
        const seen = items.map((i) => i.owner).filter((o): o is string => !!o)
        setKnownOwners([...new Set(['Me', ...settings.people, ...seen])])
      }
    )
  }, [id])

  useEffect(() => {
    window.scribe.meetings.get(id).then(setMeeting)
    return window.scribe.meetings.onUpdated((m) => {
      if (m.id === id) setMeeting(m)
    })
  }, [id])

  // Escape returns to the library (unless typing in a field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      if (e.key === 'Escape' && target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        onBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  if (!meeting) return <></>

  const working =
    meeting.stage === 'transcribing' || meeting.stage === 'summarizing' || meeting.stage === 'recorded'

  async function rename(): Promise<void> {
    const next = titleRef.current?.value ?? ''
    if (meeting && next.trim() && next !== meeting.title) {
      const updated = await window.scribe.meetings.rename(meeting.id, next)
      if (updated) setMeeting(updated)
    }
  }

  async function copySummary(): Promise<void> {
    if (!meeting) return
    await navigator.clipboard.writeText(summaryToMarkdown(meeting))
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  async function exportMd(): Promise<void> {
    if (!meeting) return
    const path = await window.scribe.meetings.exportMarkdown(
      exportFilename(meeting),
      meetingToMarkdown(meeting)
    )
    if (path) {
      setExportedTo(path)
      setTimeout(() => setExportedTo(null), 4000)
    }
  }

  async function remove(): Promise<void> {
    const sure = window.confirm(
      `Delete "${meeting?.title}"? Audio, transcript, and summary will be removed.`
    )
    if (!sure || !meeting) return
    await window.scribe.meetings.delete(meeting.id)
    onDeleted()
  }

  const transcriptOpen = transcriptToggled ?? !meeting.summary

  return (
    <div className="main-narrow">
      <div className="detail-head">
        <button className="back-link" onClick={onBack}>
          <BackIcon /> All meetings
        </button>
        <div className="title-row">
          <input
            ref={titleRef}
            className="detail-title"
            key={meeting.title}
            defaultValue={meeting.title}
            onBlur={rename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            aria-label="Meeting title"
            title="Click to rename"
          />
          <button
            className="btn btn-ghost icon-btn"
            title="Rename meeting"
            aria-label="Rename meeting"
            onClick={() => {
              titleRef.current?.focus()
              titleRef.current?.select()
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
          </button>
        </div>
        <div className="detail-meta">
          <span>{formatWhen(meeting.createdAt)}</span>
          <span>{formatDuration(meeting.durationMs)}</span>
          <span>
            {meeting.mode === 'virtual'
              ? 'virtual'
              : meeting.mode === 'imported'
                ? 'imported'
                : 'in person'}
          </span>
          <StageBadge stage={meeting.stage} progress={meeting.progress} />
        </div>
        {(meeting.summary || (meeting.transcript && meeting.transcript.length > 0)) && (
          <div className="toolbar-row">
            {meeting.summary && (
              <button className="btn" onClick={copySummary}>
                {copied ? 'Copied ✓' : 'Copy summary'}
              </button>
            )}
            <button className="btn" onClick={exportMd}>
              Export Markdown
            </button>
            {exportedTo && (
              <span className="field-note ok" role="status">
                Saved to {exportedTo}
              </span>
            )}
          </div>
        )}
      </div>

      {meeting.hasAudio && (
        <AudioPlayer src={`scribe-media://${meeting.id}`} fallbackMs={meeting.durationMs} />
      )}

      {working && (
        <div className="stage-banner" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          {meeting.stage === 'summarizing'
            ? 'Writing the summary with Claude…'
            : 'Transcribing on this machine. You can leave this page.'}
          {meeting.stage === 'transcribing' && typeof meeting.progress === 'number' && (
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${meeting.progress}%` }} />
            </div>
          )}
        </div>
      )}

      {meeting.stage === 'error' && (
        <div className="stage-banner error" role="alert">
          {meeting.error ?? 'Processing failed.'}
          <button className="btn" onClick={() => window.scribe.meetings.retry(meeting.id)}>
            Try again
          </button>
        </div>
      )}

      {meeting.stage === 'transcript-only' && meeting.transcript && (
        <div className="stage-banner">
          {meeting.error
            ? `Summary failed: ${meeting.error}`
            : 'Transcript is ready. Add a Claude API key in Settings to generate summaries.'}
          <button className="btn" onClick={() => window.scribe.meetings.resummarize(meeting.id)}>
            Summarize now
          </button>
        </div>
      )}

      {meeting.summary && (
        <Collapse label="TL;DR">
          <p className="tldr">{meeting.summary.tldr}</p>
        </Collapse>
      )}

      {meeting.transcript && meeting.transcript.length > 0 && (
        <AskSection meeting={meeting} onAnswer={(m) => setMeeting(m)} />
      )}

      {meeting.summary && (
        <>
          {meeting.summary.actionItems.length > 0 && (
            <Collapse label="Action items" meta={`${meeting.summary.actionItems.length}`}>
              <div>
                {meeting.summary.actionItems.map((a, i) => (
                  <div className="action-item" key={i}>
                    <span className="action-task">{a.task}</span>
                    <OwnerEditor
                      owner={a.owner}
                      suggestions={knownOwners}
                      onSave={async (owner) => {
                        const updated = await window.scribe.actions.setOwner(meeting.id, i, owner)
                        if (updated) setMeeting(updated)
                        if (owner && !knownOwners.includes(owner)) {
                          setKnownOwners([...knownOwners, owner])
                        }
                      }}
                    />
                    {a.due && <span className="action-due">{a.due}</span>}
                  </div>
                ))}
              </div>
            </Collapse>
          )}

          {meeting.summary.decisions.length > 0 && (
            <Collapse label="Decisions">
              <ul className="point-list">
                {meeting.summary.decisions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </Collapse>
          )}

          {meeting.summary.openQuestions.length > 0 && (
            <Collapse label="Open questions">
              <ul className="point-list">
                {meeting.summary.openQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </Collapse>
          )}

          {meeting.summary.topics?.map((topic, ti) => (
            <Collapse label={topic.heading} topic key={ti}>
              <ul className="point-list">
                {topic.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </Collapse>
          ))}

          {!meeting.summary.topics && (meeting.summary.keyPoints?.length ?? 0) > 0 && (
            <Collapse label="Key points">
              <ul className="point-list">
                {meeting.summary.keyPoints!.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </Collapse>
          )}
        </>
      )}

      {meeting.transcript && meeting.transcript.length > 0 && (
        <section className="section">
          <button
            className="collapse-head"
            onClick={() => setTranscriptToggled(!transcriptOpen)}
            aria-expanded={transcriptOpen}
          >
            <span className={`chevron ${transcriptOpen ? 'open' : ''}`} aria-hidden="true">
              <ChevronIcon />
            </span>
            Transcript
            <span className="collapse-count">{meeting.transcript.length} segments</span>
          </button>
          {transcriptOpen && (
            <div className="collapse-body">
              {meeting.transcript.some((s) => s.speaker) && (
                <SpeakerNames meeting={meeting} onSaved={setMeeting} />
              )}
              <div className="transcript">
                {meeting.transcript.map((seg, i) => {
                  const prev = meeting.transcript![i - 1]
                  const showChip = seg.speaker && seg.speaker !== prev?.speaker
                  const names = {
                    me: meeting.speakerNames?.me ?? 'Me',
                    them: meeting.speakerNames?.them ?? 'Them'
                  }
                  return (
                    <div className="transcript-seg" key={i}>
                      <span className="transcript-time">{formatDuration(seg.from)}</span>
                      <span className="transcript-text">
                        {showChip && (
                          <span className={`speaker-chip ${seg.speaker}`}>{names[seg.speaker!]}</span>
                        )}
                        {seg.text}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {!meeting.summary && meeting.transcript && meeting.transcript.length > 0 && (
        <AskSection meeting={meeting} onAnswer={(m) => setMeeting(m)} />
      )}

      <section className="section">
        <button className="btn btn-ghost btn-danger" onClick={remove}>
          Delete meeting
        </button>
      </section>
    </div>
  )
}

function SpeakerNames({
  meeting,
  onSaved
}: {
  meeting: Meeting
  onSaved: (m: Meeting) => void
}): React.JSX.Element {
  const [me, setMe] = useState(meeting.speakerNames?.me ?? 'Me')
  const [them, setThem] = useState(meeting.speakerNames?.them ?? 'Them')

  async function save(): Promise<void> {
    const updated = await window.scribe.meetings.setSpeakers(meeting.id, { me, them })
    if (updated) onSaved(updated)
  }

  return (
    <div className="speaker-names">
      <span className="speaker-chip me">Mic</span>
      <input
        className="text-input speaker-input"
        value={me}
        onChange={(e) => setMe(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        aria-label="Name for your own lines"
      />
      <span className="speaker-chip them">Call audio</span>
      <input
        className="text-input speaker-input"
        value={them}
        onChange={(e) => setThem(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        aria-label="Name for the other participants' lines"
      />
    </div>
  )
}

function AskSection({
  meeting,
  onAnswer
}: {
  meeting: Meeting
  onAnswer: (m: Meeting) => void
}): React.JSX.Element {
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  async function ask(): Promise<void> {
    const q = question.trim()
    if (!q || asking) return
    setAsking(true)
    setError(null)
    try {
      const answer = await window.scribe.meetings.ask(meeting.id, q)
      onAnswer({ ...meeting, qa: [...(meeting.qa ?? []), { q, a: answer }] })
      setQuestion('')
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'nearest' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The question could not be answered.')
    } finally {
      setAsking(false)
    }
  }

  const qa = meeting.qa ?? []
  const visibleQa = showAll ? qa : qa.slice(-3)

  return (
    <Collapse label="Ask about this meeting">
      {qa.length > 3 && !showAll && (
        <button className="btn btn-ghost qa-earlier" onClick={() => setShowAll(true)}>
          Show {qa.length - 3} earlier {qa.length - 3 === 1 ? 'question' : 'questions'}
        </button>
      )}
      {visibleQa.map((x, i) => (
        <div className="qa-pair" key={i}>
          <p className="qa-q">{x.q}</p>
          <p className="qa-a">{x.a}</p>
        </div>
      ))}
      <div ref={endRef} />
      <div className="field-row qa-input-row">
        <input
          className="text-input"
          type="text"
          placeholder="What did we decide about…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask()}
          disabled={asking}
          aria-label="Ask a question about this meeting"
        />
        <button className="btn btn-primary" onClick={ask} disabled={asking || !question.trim()}>
          {asking ? 'Thinking…' : 'Ask'}
        </button>
      </div>
      {error && (
        <p className="field-note error" role="alert">
          {error}
        </p>
      )}
    </Collapse>
  )
}
