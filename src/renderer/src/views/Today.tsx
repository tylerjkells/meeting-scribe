import { useEffect, useMemo, useState } from 'react'
import type {
  ActionRollupItem,
  AppSettings,
  CalendarEvent,
  MeetingListItem
} from '../../../shared/types'
import { formatDuration, formatWhen, MicIcon, StageBadge } from '../ui'

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'meeting', 'call', 'sync', 'weekly', 'monthly', 'daily', 'check'
])

/**
 * The location field on virtual/hybrid events often carries platform
 * boilerplate ("Microsoft Teams Meeting") or the join URL itself; keep only
 * the parts that name a real place.
 */
function cleanLocation(location: string | null): string | null {
  if (!location) return null
  const parts = location
    .split(';')
    .map((p) => p.trim())
    .filter(
      (p) =>
        p.length > 0 &&
        !/^https?:\/\//i.test(p) &&
        !/^(microsoft teams|zoom|webex|google) meeting$/i.test(p) &&
        !/^microsoft teams$/i.test(p)
    )
  return parts.length > 0 ? parts.join('; ') : null
}

function attendeeLabel(attendees: string[]): string {
  const shown = attendees.slice(0, 4)
  const extra = attendees.length - shown.length
  return `with ${shown.join(', ')}${extra > 0 ? ` +${extra}` : ''}`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function isToday(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

export function TodayView({
  meetings,
  onOpen,
  onRecord,
  onSettings,
  onActions
}: {
  meetings: MeetingListItem[]
  onOpen: (id: string) => void
  onRecord: () => void
  onSettings: () => void
  onActions: () => void
}): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [calError, setCalError] = useState<string | null>(null)
  const [calLoaded, setCalLoaded] = useState(false)
  const [actions, setActions] = useState<ActionRollupItem[]>([])
  const [related, setRelated] = useState<Map<string, string>>(new Map())
  // re-render every minute so the "Now" marker tracks the clock
  const [, tick] = useState(0)

  useEffect(() => {
    window.scribe.settings.get().then(setSettings)
    window.scribe.actions.list().then(setActions)
    window.scribe.calendar.today().then((r) => {
      setEvents(r.events)
      setCalError(r.error ?? null)
      setCalLoaded(true)
    })
    const t = setInterval(() => tick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  // link each event to the most recent related meeting in the library
  useEffect(() => {
    let alive = true
    ;(async () => {
      const map = new Map<string, string>()
      for (const ev of events.filter((e) => !e.allDay)) {
        const words = ev.title
          .toLowerCase()
          .replace(/[^a-z0-9 ]+/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
          .slice(0, 3)
        if (words.length === 0) continue
        const hits = await window.scribe.meetings.search(words.join(' '))
        const hit = hits.find((h) => {
          const m = meetings.find((x) => x.id === h.id)
          return m && !isToday(m.createdAt)
        })
        if (hit) map.set(ev.id, hit.id)
      }
      if (alive) setRelated(map)
    })()
    return () => {
      alive = false
    }
  }, [events, meetings])

  const todayMeetings = useMemo(() => meetings.filter((m) => isToday(m.createdAt)), [meetings])
  const myOpenActions = useMemo(
    () => actions.filter((a) => !a.done && a.owner?.toLowerCase() === 'me'),
    [actions]
  )
  const timedEvents = events.filter((e) => !e.allDay)
  const allDayEvents = events.filter((e) => e.allDay)
  const now = Date.now()

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })

  async function toggleAction(item: ActionRollupItem): Promise<void> {
    const newDone = await window.scribe.actions.toggle(item.meetingId, item.index)
    setActions((prev) =>
      prev.map((a) =>
        a.meetingId === item.meetingId && a.index === item.index ? { ...a, done: newDone } : a
      )
    )
  }

  return (
    <>
      <div className="page-head">
        <h1>Today</h1>
        <div className="page-head-tools">
          <span className="count-note">{dateLabel}</span>
        </div>
      </div>

      <div className="today-col">
        <section className="today-section">
          <div className="card-subhead">Schedule</div>

          {settings && !settings.hasCalendar && (
            <div className="today-connect">
              <p>
                Connect your calendar to see today&apos;s meetings here, get recordings titled
                after their events, and jump into related notes before you join.
              </p>
              <button className="btn" onClick={onSettings}>
                Connect calendar in Settings
              </button>
            </div>
          )}

          {calError && (
            <p className="field-note error" role="alert">
              {calError}
            </p>
          )}

          {settings?.hasCalendar && calLoaded && !calError && events.length === 0 && (
            <p className="today-quiet">Nothing on the calendar today.</p>
          )}

          {allDayEvents.length > 0 && (
            <p className="today-allday">
              All day: {allDayEvents.map((e) => e.title).join(' · ')}
            </p>
          )}

          {timedEvents.length > 0 && (
            <div className="sched-list">
              {timedEvents.map((ev) => {
                const start = new Date(ev.start).getTime()
                const end = new Date(ev.end).getTime()
                const live = now >= start && now < end
                const past = now >= end
                const relatedId = related.get(ev.id)
                const relatedMeeting = relatedId
                  ? meetings.find((m) => m.id === relatedId)
                  : undefined
                const room = cleanLocation(ev.location)
                return (
                  <div className={`sched-row ${live ? 'live' : ''} ${past ? 'past' : ''}`} key={ev.id}>
                    <span className="sched-time">
                      {formatTime(ev.start)}
                      <span className="sched-time-end">{formatTime(ev.end)}</span>
                    </span>
                    <span className="sched-body">
                      <span className="sched-title">
                        {live && <span className="sched-now">Now</span>}
                        {ev.title}
                      </span>
                      {(room || ev.joinUrl || ev.attendees.length > 0 || relatedMeeting) && (
                        <span className="sched-meta">
                          {ev.joinUrl && (
                            <a className="sched-join" href={ev.joinUrl} target="_blank" rel="noreferrer">
                              Join link
                            </a>
                          )}
                          {room && <span>{room}</span>}
                          {ev.attendees.length > 0 && (
                            <span title={ev.attendees.join(', ')}>{attendeeLabel(ev.attendees)}</span>
                          )}
                          {relatedMeeting && (
                            <button
                              className="sched-related"
                              onClick={() => onOpen(relatedMeeting.id)}
                              title="Open the most recent related meeting"
                            >
                              Last time: {relatedMeeting.title} · {formatWhen(relatedMeeting.createdAt)}
                            </button>
                          )}
                        </span>
                      )}
                    </span>
                    {live && (
                      <button className="btn btn-primary sched-record" onClick={onRecord}>
                        <MicIcon /> Record
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="today-section">
          <div className="card-subhead">Today in the library</div>
          {todayMeetings.length === 0 ? (
            <p className="today-quiet">
              No recordings yet today.{' '}
              <button className="link-btn" onClick={onRecord}>
                Start one
              </button>
            </p>
          ) : (
            <div className="meeting-list">
              {todayMeetings.map((m) => (
                <button key={m.id} className="meeting-row" onClick={() => onOpen(m.id)}>
                  <span className="meeting-row-title">{m.title}</span>
                  <span className="meeting-row-meta">
                    <StageBadge stage={m.stage} progress={m.progress} />
                    <span>{formatDuration(m.durationMs)}</span>
                    <span>{formatTime(m.createdAt)}</span>
                  </span>
                  <span className="meeting-row-sub">{m.tldr ?? ''}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="today-section">
          <div className="card-subhead">Your open action items</div>
          {myOpenActions.length === 0 ? (
            <p className="today-quiet">Nothing open with your name on it.</p>
          ) : (
            <>
              <div className="rollup-list">
                {myOpenActions.slice(0, 6).map((item) => (
                  <div className="rollup-item" key={`${item.meetingId}-${item.index}`}>
                    <input
                      type="checkbox"
                      className="rollup-check"
                      checked={item.done}
                      onChange={() => toggleAction(item)}
                      aria-label={`Mark "${item.task}" done`}
                    />
                    <div className="rollup-body">
                      <span className="rollup-task">{item.task}</span>
                      <span className="rollup-meta">
                        {item.due && <span className="action-due">{item.due}</span>}
                        <button className="rollup-source" onClick={() => onOpen(item.meetingId)}>
                          {item.meetingTitle}
                        </button>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {myOpenActions.length > 6 && (
                <button className="link-btn today-more" onClick={onActions}>
                  All {myOpenActions.length} open items
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </>
  )
}
