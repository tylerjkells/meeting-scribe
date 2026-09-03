import { useCallback, useEffect, useState } from 'react'
import type { DailyRecap } from '../../shared/types'

/**
 * The day's brief on Today: morning at the workday's start, a midday check-in
 * at noon, an end-of-day wrap half an hour before close. Each replaces the
 * previous — anything still relevant is re-said by the newer one. The counts
 * are assembled locally and cost nothing; each written brief is one model
 * call, generated when its slot starts and cached, so this component only
 * ever displays what the main process already decided to make.
 */
export function MorningBrief({ onMail }: { onMail: () => void }): React.JSX.Element {
  const [recap, setRecap] = useState<DailyRecap | null>(null)
  const [writing, setWriting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      setRecap(await window.scribe.recap.build())
    } catch {
      // a brief that won't assemble shouldn't take Today down with it
    }
  }, [])

  useEffect(() => {
    load()
    // the background watch writes the brief once the day starts
    return window.scribe.recap.onUpdated(load)
  }, [load])

  async function write(): Promise<void> {
    if (!recap) return
    setWriting(true)
    setError(null)
    const result = await window.scribe.recap.narrate(recap)
    setWriting(false)
    if (result.ok && result.text) setRecap({ ...recap, narrative: result.text })
    else setError(result.error ?? 'Could not write the brief')
  }

  if (!recap) return <></>

  const needsReply = recap.mail.filter((m) => m.needsReply)
  const overdue = recap.clickupDue.length
  const nothing =
    recap.events.length === 0 &&
    recap.mail.length === 0 &&
    recap.myOpen.length === 0 &&
    overdue === 0

  if (nothing && !recap.narrative) return <></>

  return (
    <section className="today-section brief">
      <div className="brief-head">
        <div className="card-subhead">{recap.slotLabel ?? 'Morning brief'}</div>
        <button className="btn btn-ghost brief-refresh" onClick={write} disabled={writing}>
          {writing ? 'Writing…' : recap.narrative ? 'Rewrite' : 'Write the brief'}
        </button>
      </div>

      <div className="brief-counts">
        {recap.events.length > 0 && (
          <span>
            <strong>{recap.events.length}</strong>{' '}
            {recap.events.length === 1 ? 'meeting' : 'meetings'} today
          </span>
        )}
        {recap.mail.length > 0 && (
          <button className="brief-count-link" onClick={onMail}>
            <strong>{recap.mail.length}</strong> in the inbox
            {needsReply.length > 0 && <> · {needsReply.length} want a reply</>}
          </button>
        )}
        {recap.myOpen.length > 0 && (
          <span>
            <strong>{recap.myOpen.length}</strong> open action{' '}
            {recap.myOpen.length === 1 ? 'item' : 'items'}
          </span>
        )}
        {overdue > 0 && (
          <span className="brief-overdue">
            <strong>{overdue}</strong> due or overdue in ClickUp
          </span>
        )}
      </div>

      {recap.narrative ? (
        <p className="brief-body">{recap.narrative}</p>
      ) : (
        <p className="opt-desc">
          {recap.slot === 'close'
            ? 'The end-of-day brief arrives on its own near the end of your workday.'
            : recap.slot === 'midday'
              ? 'The midday check-in arrives on its own around noon.'
              : 'The written brief arrives on its own when your workday starts.'}{' '}
          Write it now if you want it early.
        </p>
      )}
      {error && <p className="field-note error">{error}</p>}
    </section>
  )
}
