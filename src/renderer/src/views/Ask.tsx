import { useEffect, useRef, useState } from 'react'
import type { LibraryQA } from '../../../shared/types'
import { formatDuration, formatWhen, useConfirm } from '../ui'

const EXAMPLES = [
  'What did we decide about…',
  'What is still open from my meetings this month?',
  'When did we last discuss…',
  'What has everyone committed to this week?'
]

export function AskView({
  onOpen
}: {
  onOpen: (id: string, at?: number) => void
}): React.JSX.Element {
  const [history, setHistory] = useState<LibraryQA[]>([])
  const [loaded, setLoaded] = useState(false)
  const [question, setQuestion] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [confirmEl, confirm] = useConfirm()

  useEffect(() => {
    window.scribe.ask.history().then((h) => {
      setHistory(h)
      setLoaded(true)
    })
  }, [])

  async function ask(): Promise<void> {
    const q = question.trim()
    if (!q || pending) return
    setPending(q)
    setError(null)
    setQuestion('')
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'nearest' }))
    try {
      const record = await window.scribe.ask.ask(q)
      setHistory((prev) => [...prev, record])
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'nearest' }))
    } catch (err) {
      setQuestion(q) // let the user retry without retyping
      setError(err instanceof Error ? err.message : 'The question could not be answered.')
    } finally {
      setPending(null)
    }
  }

  async function clear(): Promise<void> {
    const sure = await confirm({
      title: 'Clear the Ask history?',
      body: 'Your meetings are not affected.',
      confirmLabel: 'Clear history',
      danger: true
    })
    if (!sure) return
    await window.scribe.ask.clear()
    setHistory([])
  }

  const visible = showAll ? history : history.slice(-8)

  return (
    <>
      <div className="page-head">
        <h1>Ask</h1>
        <div className="page-head-tools">
          {history.length > 0 && (
            <button className="btn btn-ghost" onClick={clear}>
              Clear history
            </button>
          )}
        </div>
      </div>

      <p className="ask-hint">
        Answers come from every transcript and summary in your library, with links to the meetings
        they came from.
      </p>

      {loaded && history.length === 0 && !pending && (
        <div className="ask-examples">
          {EXAMPLES.map((ex) => (
            <button
              className="who-chip"
              key={ex}
              onClick={() => {
                setQuestion(ex.endsWith('…') ? ex.slice(0, -1) : ex)
                inputRef.current?.focus()
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      <div className="ask-thread">
        {history.length > 8 && !showAll && (
          <button className="btn btn-ghost qa-earlier" onClick={() => setShowAll(true)}>
            Show {history.length - 8} earlier {history.length - 8 === 1 ? 'question' : 'questions'}
          </button>
        )}
        {visible.map((x, i) => (
          <div className="qa-pair" key={`${x.askedAt}-${i}`}>
            <p className="qa-q">{x.q}</p>
            <p className="qa-a">{x.a}</p>
            {x.sources.length > 0 && (
              <div className="ask-sources">
                {x.sources.map((s) => (
                  <button
                    className="source-chip"
                    key={s.ref}
                    onClick={() => onOpen(s.meetingId, s.timestampMs ?? undefined)}
                    title={
                      s.timestampMs !== null
                        ? 'Open this meeting at the cited moment'
                        : 'Open this meeting'
                    }
                  >
                    <span className="source-ref">[{s.ref}]</span>
                    {s.meetingTitle} · {formatWhen(s.createdAt)}
                    {s.timestampMs !== null && ` · ${formatDuration(s.timestampMs)}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {pending && (
          <div className="qa-pair">
            <p className="qa-q">{pending}</p>
            <p className="qa-a ask-thinking">
              <span className="spinner" aria-hidden="true" /> Reading your meetings…
            </p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="field-row qa-input-row">
        <input
          ref={inputRef}
          className="text-input"
          type="text"
          placeholder="Ask across all your meetings…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask()}
          disabled={!!pending}
          aria-label="Ask a question across all meetings"
        />
        <button
          className="btn btn-primary"
          onClick={ask}
          disabled={!!pending || !question.trim()}
        >
          {pending ? 'Thinking…' : 'Ask'}
        </button>
      </div>
      {error && (
        <p className="field-note error" role="alert">
          {error}
        </p>
      )}
      {confirmEl}
    </>
  )
}
