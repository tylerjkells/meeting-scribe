import { useEffect, useState } from 'react'
import type { WeeklyDigest } from '../../shared/types'
import { formatDuration, formatWhen, isOverdue } from './ui'

/** yyyy-mm-dd of this week's Monday: the "seen it this week" key */
function mondayKey(d = new Date()): string {
  const back = (d.getDay() + 6) % 7
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back)
  return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`
}

/**
 * Monday prompt + digest dialog. The prompt appears on Mondays until opened
 * or dismissed (then not again until next week). The dialog itself can also
 * be opened any day from the Today page.
 */
export function Digest({
  openRequested,
  onOpenHandled,
  onOpenMeeting,
  onOpenPerson
}: {
  /** external request to show the digest now (Today page button) */
  openRequested: boolean
  onOpenHandled: () => void
  onOpenMeeting: (id: string) => void
  onOpenPerson: (name: string) => void
}): React.JSX.Element {
  const [prompt, setPrompt] = useState(false)
  const [digest, setDigest] = useState<WeeklyDigest | null>(null)

  useEffect(() => {
    const isMonday = new Date().getDay() === 1
    if (isMonday && localStorage.getItem('digestSeen') !== mondayKey()) setPrompt(true)
  }, [])

  function markSeen(): void {
    localStorage.setItem('digestSeen', mondayKey())
    setPrompt(false)
  }

  async function openDigest(): Promise<void> {
    markSeen()
    setDigest(await window.scribe.digest.build())
  }

  useEffect(() => {
    if (openRequested) {
      onOpenHandled()
      openDigest()
    }
  }, [openRequested]) // eslint-disable-line react-hooks/exhaustive-deps

  function close(): void {
    setDigest(null)
  }

  function go(fn: () => void): void {
    close()
    fn()
  }

  return (
    <>
      {prompt && (
        <div className="digest-prompt" role="status">
          <span className="digest-prompt-text">
            <strong>Monday.</strong> Your weekly digest is ready.
          </span>
          <button className="btn btn-primary" onClick={openDigest}>
            Open
          </button>
          <button className="btn btn-ghost" onClick={markSeen}>
            Dismiss
          </button>
        </div>
      )}

      {digest && (
        <div className="digest-overlay" onClick={close}>
          <div
            className="digest-box"
            role="dialog"
            aria-modal="true"
            aria-label="Weekly digest"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="digest-head">
              <h2>Weekly digest · {digest.weekLabel}</h2>
              <button className="btn btn-ghost askw-close" onClick={close} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="digest-body">
              <section>
                <div className="card-subhead">Last week</div>
                {digest.lastWeekMeetings.length === 0 ? (
                  <p className="today-quiet">No meetings recorded.</p>
                ) : (
                  <>
                    <p className="digest-stat">
                      {digest.lastWeekMeetings.length}{' '}
                      {digest.lastWeekMeetings.length === 1 ? 'meeting' : 'meetings'} ·{' '}
                      {formatDuration(
                        digest.lastWeekMeetings.reduce((sum, m) => sum + m.durationMs, 0)
                      )}{' '}
                      total
                    </p>
                    <ul className="digest-list">
                      {digest.lastWeekMeetings.map((m) => (
                        <li key={m.id}>
                          <button className="link-btn" onClick={() => go(() => onOpenMeeting(m.id))}>
                            {m.title}
                          </button>{' '}
                          <span className="digest-when">{formatWhen(m.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>

              <section>
                <div className="card-subhead">On your plate</div>
                {digest.myOpen.length === 0 ? (
                  <p className="today-quiet">Nothing open with your name on it.</p>
                ) : (
                  <ul className="digest-list">
                    {digest.myOpen.map((item) => (
                      <li key={`${item.meetingId}-${item.index}`}>
                        {item.task}
                        {item.due && (
                          <span className={`action-due digest-due ${isOverdue(item) ? 'overdue' : ''}`}>
                            {item.due}
                          </span>
                        )}{' '}
                        <button
                          className="link-btn digest-src"
                          onClick={() => go(() => onOpenMeeting(item.meetingId))}
                        >
                          {item.meetingTitle}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {digest.aging.length > 0 && (
                <section>
                  <div className="card-subhead">Open for 2+ weeks</div>
                  <ul className="digest-list">
                    {digest.aging.map((item) => (
                      <li key={`${item.meetingId}-${item.index}`}>
                        {item.task}
                        {item.owner && <span className="digest-when"> — {item.owner}</span>}{' '}
                        <button
                          className="link-btn digest-src"
                          onClick={() => go(() => onOpenMeeting(item.meetingId))}
                        >
                          {item.meetingTitle}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {digest.byPerson.length > 0 && (
                <section>
                  <div className="card-subhead">Waiting on others</div>
                  <div className="who-filter digest-people">
                    {digest.byPerson.map((p) => (
                      <button
                        className="who-chip"
                        key={p.name}
                        onClick={() => go(() => onOpenPerson(p.name))}
                      >
                        {p.name} · {p.count}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
