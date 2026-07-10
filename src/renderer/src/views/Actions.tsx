import { useEffect, useMemo, useState } from 'react'
import type { ActionRollupItem } from '../../../shared/types'
import { formatWhen, OwnerEditor } from '../ui'

export function ActionsView({ onOpen }: { onOpen: (id: string) => void }): React.JSX.Element {
  const [items, setItems] = useState<ActionRollupItem[]>([])
  const [showDone, setShowDone] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [who, setWho] = useState<string>('me')

  useEffect(() => {
    window.scribe.actions.list().then((list) => {
      setItems(list)
      setLoaded(true)
      // default to "assigned to me", but not to an empty view
      if (!list.some((i) => i.owner?.toLowerCase() === 'me' && !i.done)) setWho('all')
    })
  }, [])

  const people = useMemo(() => {
    const names = new Set<string>()
    for (const i of items) {
      if (i.owner && i.owner.toLowerCase() !== 'me') names.add(i.owner)
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [items])

  const matchesWho = (i: ActionRollupItem): boolean => {
    if (who === 'all') return true
    if (who === 'me') return i.owner?.toLowerCase() === 'me'
    if (who === 'unassigned') return !i.owner
    return i.owner === who
  }

  const scoped = useMemo(() => items.filter(matchesWho), [items, who])
  const open = useMemo(() => scoped.filter((i) => !i.done), [scoped])
  const done = useMemo(() => scoped.filter((i) => i.done), [scoped])
  const visible = showDone ? [...open, ...done] : open

  const openCount = (name: string): number =>
    items.filter((i) => !i.done && (name === 'me' ? i.owner?.toLowerCase() === 'me' : i.owner === name))
      .length

  async function toggle(item: ActionRollupItem): Promise<void> {
    const newDone = await window.scribe.actions.toggle(item.meetingId, item.index)
    setItems((prev) =>
      prev.map((i) =>
        i.meetingId === item.meetingId && i.index === item.index ? { ...i, done: newDone } : i
      )
    )
  }

  const knownOwners = useMemo(
    () => [...new Set(items.map((i) => i.owner).filter((o): o is string => !!o))],
    [items]
  )

  async function setOwner(item: ActionRollupItem, owner: string | null): Promise<void> {
    await window.scribe.actions.setOwner(item.meetingId, item.index, owner)
    setItems((prev) =>
      prev.map((i) =>
        i.meetingId === item.meetingId && i.index === item.index ? { ...i, owner } : i
      )
    )
  }

  if (loaded && items.length === 0) {
    return (
      <div className="empty-state">
        <h2>No action items yet</h2>
        <p>
          When a meeting summary includes follow-ups, they collect here across all your meetings.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="page-head">
        <h1>Action items</h1>
        <div className="page-head-tools">
          <span className="count-note">
            {open.length} open{done.length > 0 ? ` · ${done.length} done` : ''}
          </span>
          {done.length > 0 && (
            <button className="btn btn-ghost" onClick={() => setShowDone(!showDone)}>
              {showDone ? 'Hide done' : 'Show done'}
            </button>
          )}
        </div>
      </div>

      <div className="who-filter" role="radiogroup" aria-label="Filter by person">
        <button
          className={`who-chip ${who === 'me' ? 'active' : ''}`}
          role="radio"
          aria-checked={who === 'me'}
          onClick={() => setWho('me')}
        >
          Me{openCount('me') > 0 ? ` · ${openCount('me')}` : ''}
        </button>
        {people.map((p) => (
          <button
            className={`who-chip ${who === p ? 'active' : ''}`}
            role="radio"
            aria-checked={who === p}
            onClick={() => setWho(p)}
            key={p}
          >
            {p}
            {openCount(p) > 0 ? ` · ${openCount(p)}` : ''}
          </button>
        ))}
        {items.some((i) => !i.owner) && (
          <button
            className={`who-chip ${who === 'unassigned' ? 'active' : ''}`}
            role="radio"
            aria-checked={who === 'unassigned'}
            onClick={() => setWho('unassigned')}
          >
            Unassigned
          </button>
        )}
        <button
          className={`who-chip ${who === 'all' ? 'active' : ''}`}
          role="radio"
          aria-checked={who === 'all'}
          onClick={() => setWho('all')}
        >
          Everyone
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">
          <h2>All caught up</h2>
          <p>
            {who === 'all'
              ? 'Every action item is checked off.'
              : 'Nothing open here. Switch person or show done items.'}
          </p>
        </div>
      ) : (
        <div className="rollup-list">
          {visible.map((item) => (
            <div className={`rollup-item ${item.done ? 'done' : ''}`} key={`${item.meetingId}-${item.index}`}>
              <input
                type="checkbox"
                className="rollup-check"
                checked={item.done}
                onChange={() => toggle(item)}
                aria-label={`Mark "${item.task}" ${item.done ? 'open' : 'done'}`}
              />
              <div className="rollup-body">
                <span className="rollup-task">{item.task}</span>
                <span className="rollup-meta">
                  <OwnerEditor
                    owner={item.owner}
                    suggestions={knownOwners}
                    onSave={(owner) => setOwner(item, owner)}
                  />
                  {item.due && <span className="action-due">{item.due}</span>}
                  <button className="rollup-source" onClick={() => onOpen(item.meetingId)}>
                    {item.meetingTitle} · {formatWhen(item.createdAt)}
                  </button>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
