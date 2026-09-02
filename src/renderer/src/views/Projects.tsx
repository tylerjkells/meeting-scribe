import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ClickupActivityEvent,
  ClickupComment,
  ClickupMember,
  ClickupStatus,
  ClickupStatusOption,
  ClickupTask
} from '../../../shared/types'
import { ClickupCompleteDialog } from '../ClickupComplete'
import { ClickupPushDialog } from '../ClickupPush'

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

function todayIso(): string {
  return isoOf(new Date())
}

function weekFromNowIso(): string {
  return isoOf(new Date(Date.now() + 7 * 86_400_000))
}

/** "Sep 2", or "Sep 2, 2027" once the year differs from this one */
function formatDue(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  const thisYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(thisYear ? {} : { year: 'numeric' })
  })
}

type Group = { label: string; tasks: ClickupTask[]; overdue?: boolean; isToday?: boolean }

function byDue(tasks: ClickupTask[]): Group[] {
  const today = todayIso()
  const week = weekFromNowIso()
  const groups: Group[] = [
    { label: 'Overdue', tasks: [], overdue: true },
    { label: 'Today', tasks: [], isToday: true },
    { label: 'This week', tasks: [] },
    { label: 'Later', tasks: [] },
    { label: 'No due date', tasks: [] }
  ]
  for (const t of tasks) {
    if (!t.dueDate) groups[4].tasks.push(t)
    else if (t.dueDate < today) groups[0].tasks.push(t)
    else if (t.dueDate === today) groups[1].tasks.push(t)
    else if (t.dueDate <= week) groups[2].tasks.push(t)
    else groups[3].tasks.push(t)
  }
  return groups.filter((g) => g.tasks.length > 0)
}

function byProject(tasks: ClickupTask[]): Group[] {
  const today = todayIso()
  const map = new Map<string, ClickupTask[]>()
  for (const t of tasks) {
    const key = t.folderName ? `${t.folderName} / ${t.listName}` : t.listName
    const arr = map.get(key) ?? []
    arr.push(t)
    map.set(key, arr)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, ts]) => ({
      label,
      tasks: [...ts].sort((a, b) => ((a.dueDate ?? '9999') < (b.dueDate ?? '9999') ? -1 : 1)),
      overdue: ts.some((t) => t.dueDate && t.dueDate < today)
    }))
}

type ProjectsMode = 'due' | 'project' | 'activity'

const KIND_LABEL: Record<ClickupActivityEvent['kind'], string> = {
  new: 'New',
  done: 'Done',
  status: 'Status',
  due: 'Due',
  comment: 'Comment',
  removed: 'Removed',
  you: 'You'
}

function formatWhenIso(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const thisYear = d.getFullYear() === today.getFullYear()
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(thisYear ? {} : { year: 'numeric' })
  })
}

/** the priorities ClickUp knows, in the order its own picker lists them */
const PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const

/** only the priorities worth a flag in the row: "normal" is the default and just noise */
function priorityFlag(p: string | null): 'urgent' | 'high' | null {
  const v = (p ?? '').toLowerCase()
  return v === 'urgent' || v === 'high' ? v : null
}

const SEEN_KEY = 'clickupActivitySeen'
const AUTO_REFRESH_MS = 5 * 60_000

export function ProjectsView({ onSettings }: { onSettings: () => void }): React.JSX.Element {
  const [status, setStatus] = useState<ClickupStatus | null>(null)
  const [tasks, setTasks] = useState<ClickupTask[] | null>(null)
  const [events, setEvents] = useState<ClickupActivityEvent[]>([])
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [mode, setMode] = useState<ProjectsMode>(
    () => (localStorage.getItem('projectsView') as ProjectsMode) || 'due'
  )
  const [scope, setScope] = useState<'mine' | 'all'>(
    () => (localStorage.getItem('projectsScope') as 'mine' | 'all') || 'mine'
  )
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string> | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [completing, setCompleting] = useState<ClickupTask | null>(null)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [commentSent, setCommentSent] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)
  const [listStatuses, setListStatuses] = useState<Record<string, ClickupStatusOption[]>>({})
  const [comments, setComments] = useState<Record<string, ClickupComment[] | 'loading'>>({})
  const [members, setMembers] = useState<ClickupMember[] | null>(null)
  const [assigneeDraft, setAssigneeDraft] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  // activity events newer than this are "unread" for the badge
  const [seenAt, setSeenAt] = useState(() => localStorage.getItem(SEEN_KEY) ?? '')
  // guards against an older refresh landing after a newer one
  const loadSeq = useRef(0)
  const searchRef = useRef<HTMLInputElement>(null)

  function loadStatuses(listId: string): void {
    if (listStatuses[listId]) return
    window.scribe.clickup
      .listStatuses(listId)
      .then((s) => setListStatuses((prev) => ({ ...prev, [listId]: s })))
  }

  function loadComments(taskId: string): void {
    setComments((prev) => ({ ...prev, [taskId]: 'loading' }))
    window.scribe.clickup
      .comments(taskId)
      .then((c) => setComments((prev) => ({ ...prev, [taskId]: c })))
      .catch(() => setComments((prev) => ({ ...prev, [taskId]: [] })))
  }

  function loadMembers(): void {
    if (members) return
    window.scribe.clickup
      .members()
      .then(setMembers)
      .catch(() => setMembers([]))
  }

  const patchTask = (id: string, patch: Partial<ClickupTask>): void =>
    setTasks((prev) => prev?.map((x) => (x.id === id ? { ...x, ...patch } : x)) ?? null)

  async function changeStatus(t: ClickupTask, status: string): Promise<void> {
    setRowError(null)
    const r = await window.scribe.clickup.setStatus(t.id, t.listId, status, t.name, t.url)
    if (!r.ok) {
      setRowError(r.error ?? 'Could not change the status')
      return
    }
    if (r.finished) {
      setTasks((prev) => prev?.filter((x) => x.id !== t.id) ?? null)
      setExpandedId(null)
    } else {
      const color = listStatuses[t.listId]?.find((s) => s.status === status)?.color ?? null
      patchTask(t.id, { status, statusColor: color })
    }
  }

  /** quiet refreshes (auto, after a create) don't flip the button to "Refreshing…" */
  const load = useCallback(
    async (quiet = false): Promise<void> => {
      const seq = ++loadSeq.current
      if (!quiet) setRefreshing(true)
      setError(null)
      try {
        const st = await window.scribe.clickup.status()
        if (seq !== loadSeq.current) return
        setStatus(st)
        if (st.connected) {
          const r = await window.scribe.clickup.refresh(scope)
          if (seq !== loadSeq.current) return
          setTasks(r.tasks)
          setEvents(r.events)
          setTruncated(r.truncated)
        }
      } catch (err) {
        if (seq !== loadSeq.current) return
        setError(err instanceof Error ? err.message : 'Could not reach ClickUp')
      } finally {
        if (seq === loadSeq.current) setRefreshing(false)
      }
    },
    [scope]
  )

  useEffect(() => {
    load()
    const t = setInterval(() => load(true), AUTO_REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  // opening Activity marks everything currently in it as seen
  useEffect(() => {
    if (mode !== 'activity' || events.length === 0) return
    const newest = events[0].at
    if (newest > seenAt) {
      setSeenAt(newest)
      localStorage.setItem(SEEN_KEY, newest)
    }
  }, [mode, events, seenAt])

  const unread = useMemo(
    () => events.filter((e) => e.kind !== 'you' && e.at > seenAt).length,
    [events, seenAt]
  )

  function switchScope(s: 'mine' | 'all'): void {
    setScope(s)
    setCollapsed(null)
    localStorage.setItem('projectsScope', s)
    // load() reruns via its scope dependency
  }

  function switchMode(m: ProjectsMode): void {
    setMode(m)
    setCollapsed(null)
    localStorage.setItem('projectsView', m)
  }

  const needle = query.trim().toLowerCase()
  const visible = useMemo(() => {
    if (!tasks) return null
    if (!needle) return tasks
    return tasks.filter((t) =>
      [
        t.name,
        t.description ?? '',
        t.listName,
        t.folderName ?? '',
        t.parentName ?? '',
        t.requestor ?? '',
        t.status,
        ...t.assignees
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    )
  }, [tasks, needle])

  const groups = useMemo(
    () => (visible ? (mode === 'due' ? byDue(visible) : byProject(visible)) : []),
    [visible, mode]
  )

  if (!status) {
    return (
      <>
        <div className="page-head">
          <h1>ClickUp</h1>
        </div>
        <p className="today-quiet">Loading your tasks…</p>
      </>
    )
  }

  if (!status.connected) {
    return (
      <div className="empty-state">
        <h2>ClickUp</h2>
        <p>
          Connect your ClickUp workspace to see everything assigned to you, check tasks off, and
          push meeting action items into real tasks. ClickUp stays the source of truth.
          {status.error && <> ({status.error})</>}
        </p>
        <button className="btn btn-primary" onClick={onSettings}>
          Connect in Settings
        </button>
      </div>
    )
  }

  // big walls of overdue/backlog start folded; everything else starts open.
  // A search opens everything so the matches are actually visible.
  const isCollapsed = (g: Group): boolean =>
    needle ? false : collapsed ? collapsed.has(g.label) : g.tasks.length > 12

  function toggleSection(g: Group): void {
    const next = new Set(collapsed ?? groups.filter(isCollapsed).map((x) => x.label))
    if (next.has(g.label)) next.delete(g.label)
    else next.add(g.label)
    setCollapsed(next)
  }

  async function changeDue(t: ClickupTask, iso: string | null): Promise<void> {
    setRowError(null)
    const r = await window.scribe.clickup.setTaskDue(t.id, iso, t.name, t.url)
    if (r.ok) patchTask(t.id, { dueDate: iso })
    else setRowError(r.error ?? 'Could not change the due date')
  }

  async function changePriority(t: ClickupTask, priority: string): Promise<void> {
    setRowError(null)
    const r = await window.scribe.clickup.setPriority(t.id, priority || null, t.name, t.url)
    if (r.ok) patchTask(t.id, { priority: priority || null })
    else setRowError(r.error ?? 'Could not change the priority')
  }

  async function assign(t: ClickupTask): Promise<void> {
    const who = assigneeDraft.trim()
    setRowError(null)
    setBusyId(t.id)
    const r = await window.scribe.clickup.setAssignee(t.id, who, t.name, t.url)
    setBusyId(null)
    if (!r.ok) {
      setRowError(r.error ?? 'Could not reassign the task')
      return
    }
    patchTask(t.id, { assignees: r.assignedTo ? [r.assignedTo] : [] })
    setAssigneeDraft('')
    // handing it to someone else takes it off your list
    if (scope === 'mine' && r.assignedTo !== status?.userName) {
      setTasks((prev) => prev?.filter((x) => x.id !== t.id) ?? null)
      setExpandedId(null)
    }
  }

  async function saveName(t: ClickupTask): Promise<void> {
    const name = nameDraft.trim()
    if (!name || name === t.name) {
      setRenaming(null)
      return
    }
    setRowError(null)
    setBusyId(t.id)
    const r = await window.scribe.clickup.rename(t.id, name, t.url)
    setBusyId(null)
    if (r.ok) {
      patchTask(t.id, { name })
      setRenaming(null)
    } else {
      setRowError(r.error ?? 'Could not rename the task')
    }
  }

  async function sendComment(t: ClickupTask): Promise<void> {
    if (!comment.trim()) return
    setBusyId(t.id)
    setRowError(null)
    const r = await window.scribe.clickup.comment(t.id, comment.trim(), t.name, t.url)
    setBusyId(null)
    if (r.ok) {
      const posted: ClickupComment = {
        id: `local-${Date.now()}`,
        author: status?.userName ?? 'You',
        text: comment.trim(),
        at: new Date().toISOString()
      }
      setComments((prev) => {
        const cur = prev[t.id]
        return { ...prev, [t.id]: [...(Array.isArray(cur) ? cur : []), posted] }
      })
      setComment('')
      setCommentSent(true)
      setTimeout(() => setCommentSent(false), 1500)
    } else {
      setRowError(r.error ?? 'Could not post the comment')
    }
  }

  function toggleRow(t: ClickupTask): void {
    const expanded = expandedId === t.id
    setExpandedId(expanded ? null : t.id)
    setComment('')
    setRowError(null)
    setRenaming(null)
    setAssigneeDraft('')
    if (!expanded) {
      loadStatuses(t.listId)
      loadComments(t.id)
      loadMembers()
    }
  }

  // collaborators worth naming on a row: everyone assigned except yourself
  const otherAssignees = (t: ClickupTask): string[] =>
    t.assignees.filter((a) => a !== status?.userName)

  const row = (t: ClickupTask, g: Group): React.JSX.Element => {
    const expanded = expandedId === t.id
    const overdue = !!t.dueDate && t.dueDate < todayIso()
    const flag = priorityFlag(t.priority)
    const where = [
      mode === 'due' ? (t.folderName ? `${t.folderName} / ${t.listName}` : t.listName) : '',
      t.parentName ? `↳ ${t.parentName}` : '',
      otherAssignees(t).join(', '),
      scope === 'all' && t.assignees.length === 0 ? 'Unassigned' : ''
    ]
      .filter(Boolean)
      .join(' · ')
    const taskComments = comments[t.id]
    const currentPriority = (t.priority ?? '').toLowerCase()
    return (
      <div key={t.id} className={`cu-item ${expanded ? 'expanded' : ''}`}>
        <div className="cu-row">
          <input
            type="checkbox"
            className="rollup-check"
            checked={completing?.id === t.id}
            onChange={() => setCompleting(t)}
            aria-label={`Mark "${t.name}" done in ClickUp`}
            title="Mark done in ClickUp"
          />
          <button className="cu-main" onClick={() => toggleRow(t)}>
            <span className="cu-name">{t.name}</span>
            {where && <span className="cu-where">{where}</span>}
          </button>
          <span className="cu-meta">
            {t.requestor && (
              <span className="cu-req" title="Requestor">
                {t.requestor}
              </span>
            )}
            {flag && (
              <span className={`cu-flag cu-flag-${flag}`} title={`${flag} priority`}>
                ⚑ {flag}
              </span>
            )}
            <span className="cu-status">
              <span
                className="cu-status-dot"
                style={{ background: t.statusColor ?? 'var(--ink-faint)' }}
              />
              <span className="cu-status-name">{t.status}</span>
            </span>
            {t.dueDate && !(mode === 'due' && g.isToday) && (
              <span className={`cu-due ${overdue ? 'overdue' : ''}`}>{formatDue(t.dueDate)}</span>
            )}
            <a
              className="cu-open"
              href={t.url}
              target="_blank"
              rel="noreferrer"
              title="Open in ClickUp"
              aria-label="Open in ClickUp"
            >
              ↗
            </a>
          </span>
        </div>
        {expanded && (
          <div className="cu-detail">
            {renaming === t.id ? (
              <form
                className="cu-rename"
                onSubmit={(e) => {
                  e.preventDefault()
                  saveName(t)
                }}
              >
                <input
                  className="text-input"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)}
                  autoFocus
                />
                <button type="submit" className="btn btn-primary" disabled={busyId === t.id}>
                  Save
                </button>
                <button type="button" className="btn" onClick={() => setRenaming(null)}>
                  Cancel
                </button>
              </form>
            ) : null}
            {t.description && <p className="cu-desc">{t.description}</p>}
            <div className="cu-controls">
              <label className="cu-control">
                Due
                <input
                  type="date"
                  className="text-input cu-date"
                  value={t.dueDate ?? ''}
                  onChange={(e) => changeDue(t, e.target.value || null)}
                />
              </label>
              <label className="cu-control">
                Status
                <select
                  className="text-input cu-status-select"
                  value={t.status}
                  onChange={(e) => changeStatus(t, e.target.value)}
                >
                  {!listStatuses[t.listId]?.some((s) => s.status === t.status) && (
                    <option value={t.status}>{t.status}</option>
                  )}
                  {(listStatuses[t.listId] ?? []).map((s) => (
                    <option key={s.status} value={s.status}>
                      {s.status}
                    </option>
                  ))}
                </select>
              </label>
              <label className="cu-control">
                Priority
                <select
                  className="text-input cu-status-select"
                  value={PRIORITIES.includes(currentPriority as (typeof PRIORITIES)[number]) ? currentPriority : ''}
                  onChange={(e) => changePriority(t, e.target.value)}
                >
                  <option value="">None</option>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="cu-control">
                Assign to
                <input
                  className="text-input cu-assign"
                  list={`cu-members-${t.id}`}
                  value={assigneeDraft}
                  placeholder={t.assignees.join(', ') || 'Unassigned'}
                  onChange={(e) => setAssigneeDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      assign(t)
                    }
                  }}
                  disabled={busyId === t.id}
                  title="Type a name and press Enter; leave blank and press Enter to unassign"
                />
                <datalist id={`cu-members-${t.id}`}>
                  {(members ?? []).map((m) => (
                    <option key={m.id} value={m.name} />
                  ))}
                </datalist>
              </label>
              {renaming !== t.id && (
                <button
                  className="link-btn cu-rename-btn"
                  onClick={() => {
                    setRenaming(t.id)
                    setNameDraft(t.name)
                  }}
                >
                  Rename
                </button>
              )}
              <a className="cu-pushed" href={t.url} target="_blank" rel="noreferrer">
                Open in ClickUp ↗
              </a>
            </div>
            <div className="cu-comments">
              {taskComments === 'loading' && (
                <span className="cu-comments-note">Loading comments…</span>
              )}
              {Array.isArray(taskComments) && taskComments.length === 0 && (
                <span className="cu-comments-note">No comments yet.</span>
              )}
              {Array.isArray(taskComments) &&
                taskComments.map((c) => (
                  <div className="cu-comment-item" key={c.id}>
                    <span className="cu-comment-head">
                      <strong>{c.author}</strong>
                      <span>{formatWhenIso(c.at)}</span>
                    </span>
                    <span className="cu-comment-text">{c.text}</span>
                  </div>
                ))}
            </div>
            <div className="cu-comment">
              <input
                className="text-input"
                placeholder="Add a comment in ClickUp…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendComment(t)}
              />
              <button
                className="btn"
                onClick={() => sendComment(t)}
                disabled={busyId === t.id || !comment.trim()}
              >
                {commentSent ? 'Sent ✓' : busyId === t.id ? 'Sending…' : 'Comment'}
              </button>
            </div>
            {rowError && <p className="field-note error">{rowError}</p>}
          </div>
        )}
      </div>
    )
  }

  const shown = visible?.length ?? 0

  return (
    <>
      <div className="page-head">
        <h1>ClickUp</h1>
        <div className="page-head-tools cu-tools">
          <span className="count-note">
            {status.teamName}
            {tasks && (
              <>
                {' · '}
                {needle && shown !== tasks.length ? `${shown} of ${tasks.length}` : tasks.length}{' '}
                open {tasks.length === 1 ? 'task' : 'tasks'}
              </>
            )}
          </span>
          {mode !== 'activity' && (
            <>
              <span className="cu-search-wrap">
                <input
                  ref={searchRef}
                  className="text-input cu-search"
                  placeholder="Search tasks…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
                  aria-label="Search tasks"
                />
                {query && (
                  <button
                    className="cu-search-clear"
                    onClick={() => {
                      setQuery('')
                      searchRef.current?.focus()
                    }}
                    aria-label="Clear search"
                    title="Clear"
                  >
                    ×
                  </button>
                )}
              </span>
              <div className="mode-toggle view-toggle" role="radiogroup" aria-label="Whose tasks">
                <button
                  className={scope === 'mine' ? 'active' : ''}
                  role="radio"
                  aria-checked={scope === 'mine'}
                  onClick={() => switchScope('mine')}
                >
                  Mine
                </button>
                <button
                  className={scope === 'all' ? 'active' : ''}
                  role="radio"
                  aria-checked={scope === 'all'}
                  onClick={() => switchScope('all')}
                >
                  Everyone
                </button>
              </div>
              <div className="mode-toggle view-toggle" role="radiogroup" aria-label="Group by">
                <button
                  className={mode === 'due' ? 'active' : ''}
                  role="radio"
                  aria-checked={mode === 'due'}
                  onClick={() => switchMode('due')}
                >
                  By due
                </button>
                <button
                  className={mode === 'project' ? 'active' : ''}
                  role="radio"
                  aria-checked={mode === 'project'}
                  onClick={() => switchMode('project')}
                >
                  By project
                </button>
              </div>
            </>
          )}
          <button
            className={`btn ${mode === 'activity' ? 'btn-primary' : 'btn-ghost'} cu-activity-btn`}
            onClick={() => switchMode(mode === 'activity' ? 'due' : 'activity')}
            aria-pressed={mode === 'activity'}
            title={unread ? `${unread} new since you last looked` : 'What changed in ClickUp'}
          >
            {mode === 'activity' ? 'Back to tasks' : 'Activity'}
            {unread > 0 && mode !== 'activity' && <span className="cu-badge">{unread}</span>}
          </button>
          <button className="btn btn-ghost" onClick={() => load()} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            New task
          </button>
        </div>
      </div>
      {error && <p className="field-note error">{error}</p>}
      {mode === 'activity' ? (
        events.length === 0 ? (
          <p className="today-quiet">
            No changes noticed yet. The changelog builds as refreshes spot differences — new
            assignments, status changes, completions, due-date moves, and fresh comments.
          </p>
        ) : (
          <div className="cu-act-list">
            {events.map((e) => (
              <div className="cu-act" key={e.id}>
                <span className={`cu-act-kind kind-${e.kind}`}>{KIND_LABEL[e.kind]}</span>
                <span className="cu-act-body">
                  {e.url ? (
                    <a href={e.url} target="_blank" rel="noreferrer" className="cu-act-task">
                      {e.taskName}
                    </a>
                  ) : (
                    <span className="cu-act-task">{e.taskName}</span>
                  )}
                  {e.detail && <span className="cu-act-detail">{e.detail}</span>}
                </span>
                <span className="cu-act-when">{formatWhenIso(e.at)}</span>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          {!tasks && !error && <p className="today-quiet">Loading your tasks…</p>}
          {tasks && tasks.length === 0 && !error && (
            <p className="today-quiet">
              {scope === 'mine'
                ? 'Nothing assigned to you is open. Enjoy it while it lasts.'
                : 'No open tasks anywhere in the workspace.'}
            </p>
          )}
          {tasks && tasks.length > 0 && shown === 0 && (
            <p className="today-quiet">Nothing matches “{query.trim()}”.</p>
          )}
          {truncated && (
            <p className="today-quiet">
              Showing the first {tasks?.length ?? 0} open tasks; ClickUp has more. Search to narrow
              it down, or switch to Mine.
            </p>
          )}
          {groups.map((g) => (
            <section className="section" key={g.label}>
              <button className="cu-section-head" onClick={() => toggleSection(g)}>
                <span className={`cu-section-chevron ${isCollapsed(g) ? '' : 'open'}`}>›</span>
                <span className="card-subhead">
                  {g.label} · {g.tasks.length}
                </span>
              </button>
              {!isCollapsed(g) && <div className="cu-list">{g.tasks.map((t) => row(t, g))}</div>}
            </section>
          ))}
        </>
      )}
      {creating && (
        <ClickupPushDialog
          owner={status.userName ?? null}
          onDone={() => {
            setCreating(false)
            load(true)
          }}
          onClose={() => setCreating(false)}
        />
      )}
      {completing && (
        <ClickupCompleteDialog
          task={completing}
          onDone={() => {
            setTasks((prev) => prev?.filter((x) => x.id !== completing.id) ?? null)
            if (expandedId === completing.id) setExpandedId(null)
            setCompleting(null)
          }}
          onClose={() => setCompleting(null)}
        />
      )}
    </>
  )
}
