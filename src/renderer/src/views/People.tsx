import { useEffect, useState } from 'react'
import type { PersonProfile, PersonSummary } from '../../../shared/types'
import { BackIcon, formatWhen } from '../ui'

export function PeopleView({
  onOpenPerson
}: {
  onOpenPerson: (name: string) => void
}): React.JSX.Element {
  const [people, setPeople] = useState<PersonSummary[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    window.scribe.people.list().then((list) => {
      setPeople(list)
      setLoaded(true)
    })
  }, [])

  if (loaded && people.length === 0) {
    return (
      <div className="empty-state">
        <h2>Nobody yet</h2>
        <p>
          People collect here from your meetings: action-item owners, named speakers, calendar
          attendees, and the team directory in Settings.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="page-head">
        <h1>People</h1>
        <div className="page-head-tools">
          <span className="count-note">
            {people.length} {people.length === 1 ? 'person' : 'people'}
          </span>
        </div>
      </div>
      <div className="meeting-list">
        {people.map((p) => (
          <button key={p.name} className="meeting-row compact" onClick={() => onOpenPerson(p.name)}>
            <span className="meeting-row-title">{p.name}</span>
            <span className="meeting-row-meta">
              {p.openItems > 0 && (
                <span className="person-open">
                  {p.openItems} open {p.openItems === 1 ? 'item' : 'items'}
                </span>
              )}
              <span>
                {p.meetingCount} {p.meetingCount === 1 ? 'meeting' : 'meetings'}
              </span>
            </span>
          </button>
        ))}
      </div>
    </>
  )
}

export function PersonView({
  name,
  onBack,
  onOpenMeeting
}: {
  name: string
  onBack: () => void
  onOpenMeeting: (id: string) => void
}): React.JSX.Element {
  const [profile, setProfile] = useState<PersonProfile | null>(null)
  const [showDone, setShowDone] = useState(false)

  function load(): void {
    window.scribe.people.profile(name).then(setProfile)
  }
  useEffect(load, [name]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      if (document.querySelector('dialog[open]') || document.querySelector('.askw-panel')) return
      if (e.key === 'Escape' && target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        onBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  if (!profile) return <></>

  const open = profile.items.filter((i) => !i.done)
  const done = profile.items.filter((i) => i.done)
  const visibleItems = showDone ? [...open, ...done] : open

  async function toggle(meetingId: string, index: number): Promise<void> {
    await window.scribe.actions.toggle(meetingId, index)
    load()
  }

  return (
    <div className="main-narrow">
      <div className="detail-head">
        <button className="back-link" onClick={onBack}>
          <BackIcon /> All people
        </button>
        <h1 className="person-name">{profile.name}</h1>
        <div className="detail-meta">
          <span>
            {profile.meetings.length} {profile.meetings.length === 1 ? 'meeting' : 'meetings'}{' '}
            together
          </span>
          {open.length > 0 && (
            <span>
              {open.length} open {open.length === 1 ? 'item' : 'items'}
            </span>
          )}
        </div>
      </div>

      <section className="section">
        <div className="person-section-head">
          <div className="card-subhead">They own</div>
          {done.length > 0 && (
            <button className="btn btn-ghost person-showdone" onClick={() => setShowDone(!showDone)}>
              {showDone ? 'Hide done' : `Show ${done.length} done`}
            </button>
          )}
        </div>
        {visibleItems.length === 0 ? (
          <p className="today-quiet">Nothing on their plate from your meetings.</p>
        ) : (
          <div className="rollup-list">
            {visibleItems.map((item) => (
              <div
                className={`rollup-item ${item.done ? 'done' : ''}`}
                key={`${item.meetingId}-${item.index}`}
              >
                <input
                  type="checkbox"
                  className="rollup-check"
                  checked={item.done}
                  onChange={() => toggle(item.meetingId, item.index)}
                  aria-label={`Mark "${item.task}" ${item.done ? 'open' : 'done'}`}
                />
                <div className="rollup-body">
                  <span className="rollup-task">{item.task}</span>
                  <span className="rollup-meta">
                    {item.due && <span className="action-due">{item.due}</span>}
                    <button className="rollup-source" onClick={() => onOpenMeeting(item.meetingId)}>
                      {item.meetingTitle} · {formatWhen(item.createdAt)}
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {profile.myCommitments.length > 0 && (
        <section className="section">
          <div className="card-subhead">You owe, from meetings together</div>
          <div className="rollup-list">
            {profile.myCommitments.map((item) => (
              <div className="rollup-item" key={`${item.meetingId}-${item.index}`}>
                <input
                  type="checkbox"
                  className="rollup-check"
                  checked={false}
                  onChange={() => toggle(item.meetingId, item.index)}
                  aria-label={`Mark "${item.task}" done`}
                />
                <div className="rollup-body">
                  <span className="rollup-task">{item.task}</span>
                  <span className="rollup-meta">
                    {item.due && <span className="action-due">{item.due}</span>}
                    <button className="rollup-source" onClick={() => onOpenMeeting(item.meetingId)}>
                      {item.meetingTitle} · {formatWhen(item.createdAt)}
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="card-subhead">Meetings together</div>
        <div className="meeting-list">
          {profile.meetings.map((m) => (
            <button
              key={m.id}
              className="meeting-row compact"
              onClick={() => onOpenMeeting(m.id)}
              title={m.tldr}
            >
              <span className="meeting-row-title">{m.title}</span>
              <span className="meeting-row-meta">
                <span>{formatWhen(m.createdAt)}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
