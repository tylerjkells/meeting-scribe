import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MailMessage, MailStatus, MailTriage } from '../../../shared/types'
import { ClickupPushDialog } from '../ClickupPush'
import { MailReplyDialog } from '../MailReply'
import { MailGuideDialog } from '../MailGuide'

/** time today, "Sep 2" this year, "Sep 2, 2025" otherwise */
function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const today = new Date()
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  const thisYear = d.getFullYear() === today.getFullYear()
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(thisYear ? {} : { year: 'numeric' })
  })
}

/** "2h ago", "yesterday", "3 days ago" — for the flow-health line */
function formatAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (isNaN(ms)) return ''
  const mins = Math.round(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

/** a thread: every message sharing a conversation, newest first */
type Thread = { key: string; latest: MailMessage; messages: MailMessage[]; unread: number }

function toThreads(messages: MailMessage[]): Thread[] {
  const map = new Map<string, Thread>()
  for (const m of messages) {
    const key = m.conversationId || m.id
    const t = map.get(key)
    if (t) {
      t.messages.push(m)
      if (!m.isRead) t.unread++
    } else {
      map.set(key, { key, latest: m, messages: [m], unread: m.isRead ? 0 : 1 })
    }
  }
  return [...map.values()]
}

type Group = { label: string; threads: Thread[] }

/** today / yesterday / this week / older, so a busy inbox still reads at a glance */
function byDay(threads: Thread[]): Group[] {
  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86_400_000).toDateString()
  const weekAgo = Date.now() - 7 * 86_400_000
  const groups: Group[] = [
    { label: 'Today', threads: [] },
    { label: 'Yesterday', threads: [] },
    { label: 'This week', threads: [] },
    { label: 'Older', threads: [] }
  ]
  for (const t of threads) {
    const d = new Date(t.latest.receivedAt)
    const day = d.toDateString()
    if (day === today) groups[0].threads.push(t)
    else if (day === yesterday) groups[1].threads.push(t)
    else if (d.getTime() > weekAgo) groups[2].threads.push(t)
    else groups[3].threads.push(t)
  }
  return groups.filter((g) => g.threads.length > 0)
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g

/** plain text with the links made clickable */
function linkify(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0
    if (start > last) out.push(text.slice(last, start))
    // a trailing period or comma belongs to the sentence, not the URL
    const url = m[0].replace(/[.,;:]+$/, '')
    out.push(
      <a key={`${start}-${url}`} href={url} target="_blank" rel="noreferrer">
        {url}
      </a>
    )
    last = start + url.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** where the quoted history starts: Outlook's header block, "On … wrote:", or "> " lines */
const QUOTE_RE =
  /^(?:-{2,}\s*Original Message\s*-{2,}.*|From:\s.+\r?\n(?:Sent|Date|To):\s.+|On .{3,200}? wrote:.*|>\s?.*)$/m

function splitQuoted(body: string): { main: string; quoted: string | null } {
  const m = QUOTE_RE.exec(body)
  if (!m || m.index < 40) return { main: body, quoted: null }
  return { main: body.slice(0, m.index).trimEnd(), quoted: body.slice(m.index).trim() }
}

function MailBody({ text }: { text: string }): React.JSX.Element {
  const { main, quoted } = useMemo(() => splitQuoted(text), [text])
  return (
    <div className="mail-body">
      {linkify(main)}
      {quoted && (
        <details className="mail-quoted">
          <summary>Show earlier messages</summary>
          <div className="mail-quoted-text">{linkify(quoted)}</div>
        </details>
      )}
    </div>
  )
}

/** the flow has gone quiet when nothing has landed in this long (work-hours aside) */
const STALE_AFTER_MS = 24 * 3_600_000

export function MailView({
  onSettings,
  onOpenPerson
}: {
  onSettings: () => void
  /** open a colleague's page; senders in the directory become links */
  onOpenPerson?: (person: string) => void
}): React.JSX.Element {
  const [status, setStatus] = useState<MailStatus | null>(null)
  const [messages, setMessages] = useState<MailMessage[]>([])
  const [triage, setTriage] = useState<MailTriage>({ handled: {} })
  const [people, setPeople] = useState<Set<string>>(() => new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [taskFrom, setTaskFrom] = useState<MailMessage | null>(null)
  const [replyTo, setReplyTo] = useState<MailMessage | null>(null)
  const [summaries, setSummaries] = useState<Record<string, string>>({})
  const [summarizing, setSummarizing] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [showAutomated, setShowAutomated] = useState(
    () => localStorage.getItem('mailShowAutomated') === '1'
  )
  const [showHandled, setShowHandled] = useState(
    () => localStorage.getItem('mailShowHandled') === '1'
  )
  const searchRef = useRef<HTMLInputElement>(null)

  /** quiet loads (the folder watcher) don't flip the Refresh button */
  const load = useCallback(async (quiet = false): Promise<void> => {
    if (!quiet) setRefreshing(true)
    try {
      const st = await window.scribe.mail.status()
      setStatus(st)
      setMessages(st.connected ? await window.scribe.mail.list() : [])
    } finally {
      if (!quiet) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    window.scribe.mail.triage().then(setTriage).catch(() => {})
    window.scribe.people
      .list()
      .then((ps) => setPeople(new Set(ps.map((p) => p.name))))
      .catch(() => {})
    // the main process watches the synced folder and pings when it changes
    return window.scribe.mail.onChanged(() => load(true))
  }, [load])

  async function summarize(m: MailMessage): Promise<void> {
    setSummarizing(m.id)
    setRowError(null)
    const result = await window.scribe.mail.summarize(m.id)
    setSummarizing(null)
    if (result.ok && result.body) setSummaries((prev) => ({ ...prev, [m.id]: result.body! }))
    else setRowError(result.error ?? 'Could not summarize that message')
  }

  async function setHandled(m: MailMessage, handled: boolean): Promise<void> {
    // optimistic: the file write is local and quick
    setTriage((prev) => {
      const next = { handled: { ...prev.handled } }
      if (handled) next.handled[m.id] = new Date().toISOString()
      else delete next.handled[m.id]
      return next
    })
    if (handled && expandedId === m.id && !showHandled) setExpandedId(null)
    try {
      setTriage(await window.scribe.mail.setHandled(m.id, handled))
    } catch {
      setRowError('Could not save that')
    }
  }

  function toggleToggle(key: 'mailShowAutomated' | 'mailShowHandled', on: boolean): void {
    localStorage.setItem(key, on ? '1' : '0')
    if (key === 'mailShowAutomated') setShowAutomated(on)
    else setShowHandled(on)
  }

  const needle = query.trim().toLowerCase()
  const isHandled = (m: MailMessage): boolean => !!triage.handled[m.id]

  const { threads, hiddenAutomated, hiddenHandled, unread } = useMemo(() => {
    let hiddenAutomated = 0
    let hiddenHandled = 0
    let unread = 0
    const kept: MailMessage[] = []
    for (const m of messages) {
      if (!m.isRead && !isHandled(m)) unread++
      if (needle) {
        const hay = [m.subject, m.fromName ?? '', m.from, m.preview, m.body, ...m.to, ...m.cc]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(needle)) continue
      }
      if (!showAutomated && m.automated) {
        hiddenAutomated++
        continue
      }
      if (!showHandled && isHandled(m)) {
        hiddenHandled++
        continue
      }
      kept.push(m)
    }
    return { threads: toThreads(kept), hiddenAutomated, hiddenHandled, unread }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, needle, showAutomated, showHandled, triage])

  if (!status) {
    return (
      <>
        <div className="page-head">
          <h1>Mail</h1>
        </div>
        <p className="today-quiet">Reading the mail folder…</p>
      </>
    )
  }

  if (!status.connected) {
    return (
      <div className="empty-state">
        <h2>Mail</h2>
        <p>
          Rowan reads your inbox from a OneDrive folder that a Power Automate flow files
          messages into — no mailbox password, no tokens, nothing to approve. Point it at
          the synced folder to get started.
          {status.error && <> ({status.error})</>}
        </p>
        <div className="empty-actions">
          <button className="btn btn-primary" onClick={onSettings}>
            Set it up in Settings
          </button>
          <button className="btn" onClick={() => setGuideOpen(true)}>
            Read the setup guide
          </button>
        </div>
        {guideOpen && <MailGuideDialog onClose={() => setGuideOpen(false)} />}
      </div>
    )
  }

  const newestAt = messages[0]?.receivedAt ?? null
  const stale = !!newestAt && Date.now() - new Date(newestAt).getTime() > STALE_AFTER_MS

  const senderName = (m: MailMessage): React.ReactNode => {
    const name = m.fromName
    if (name && onOpenPerson && people.has(name)) {
      return (
        <button className="mail-person" onClick={() => onOpenPerson(name)} title="Open in People">
          {name}
        </button>
      )
    }
    return name ?? m.from
  }

  const detail = (m: MailMessage, thread: Thread): React.JSX.Element => {
    const handled = isHandled(m)
    const older = thread.messages.filter((x) => x.id !== m.id)
    return (
      <div className="mail-detail">
        <div className="mail-addr">
          <span>
            <strong>From</strong> {senderName(m)}
            {m.fromName && <span className="mail-addr-raw"> &lt;{m.from}&gt;</span>}
          </span>
          {m.to.length > 0 && (
            <span>
              <strong>To</strong> {m.to.join(', ')}
            </span>
          )}
          {m.cc.length > 0 && (
            <span>
              <strong>Cc</strong> {m.cc.join(', ')}
            </span>
          )}
        </div>
        {summaries[m.id] && (
          <div className="mail-summary">
            <span className="card-subhead">Summary</span>
            <p>{summaries[m.id]}</p>
          </div>
        )}
        <MailBody text={m.body} />
        {older.length > 0 && (
          <div className="mail-thread">
            <span className="card-subhead">
              Earlier in this thread · {older.length}
            </span>
            {older.map((x) => (
              <details className="mail-thread-msg" key={x.id}>
                <summary>
                  <span className="mail-thread-from">{x.fromName ?? x.from}</span>
                  <span className="mail-thread-when">{formatWhen(x.receivedAt)}</span>
                  <span className="mail-thread-preview">{x.preview}</span>
                </summary>
                <MailBody text={x.body} />
              </details>
            ))}
          </div>
        )}
        <div className="mail-actions">
          {!m.automated && (
            <button className="btn btn-primary" onClick={() => setReplyTo(m)}>
              Draft a reply
            </button>
          )}
          <button
            className="btn"
            onClick={() => summarize(m)}
            disabled={summarizing === m.id}
          >
            {summarizing === m.id
              ? 'Summarizing…'
              : summaries[m.id]
                ? 'Re-summarize'
                : 'Summarize'}
          </button>
          <button className="btn" onClick={() => setTaskFrom(m)}>
            Make a ClickUp task
          </button>
          <button
            className={`btn ${handled ? '' : 'btn-ghost'}`}
            onClick={() => setHandled(m, !handled)}
            title={
              handled ? 'Put it back in the list' : 'Hide it from the list; nothing changes in Outlook'
            }
          >
            {handled ? 'Handled ✓ · Undo' : 'Mark handled'}
          </button>
          {m.webLink && (
            <a className="cu-pushed" href={m.webLink} target="_blank" rel="noreferrer">
              Open in Outlook ↗
            </a>
          )}
        </div>
        {rowError && <p className="field-note error">{rowError}</p>}
      </div>
    )
  }

  const row = (thread: Thread): React.JSX.Element => {
    const m = thread.latest
    const expanded = expandedId === m.id
    const handled = isHandled(m)
    const classes = [
      'mail-item',
      expanded ? 'expanded' : '',
      thread.unread > 0 && !handled ? 'unread' : '',
      m.automated ? 'automated' : '',
      handled ? 'handled' : ''
    ]
      .filter(Boolean)
      .join(' ')
    return (
      <div key={thread.key} className={classes}>
        <div className="mail-row">
          <button className="mail-main" onClick={() => setExpandedId(expanded ? null : m.id)}>
            <span className="mail-from">{m.fromName ?? m.from}</span>
            <span className="mail-subject">
              {m.external && (
                <span className="mail-ext" title="From outside Rowan">
                  EXT
                </span>
              )}
              {m.automated && (
                <span className="mail-ext" title="Sent by a system, not a person">
                  AUTO
                </span>
              )}
              {m.subject}
              {thread.messages.length > 1 && (
                <span className="mail-thread-count" title="Messages in this thread">
                  {thread.messages.length}
                </span>
              )}
            </span>
            <span className="mail-preview">{m.preview}</span>
          </button>
          <span className="mail-meta">
            {m.hasAttachments && (
              <span className="mail-clip" title="Has attachments">
                📎
              </span>
            )}
            {m.importance === 'high' && <span className="mail-important">!</span>}
            <span className="mail-when">{formatWhen(m.receivedAt)}</span>
            <button
              className={`mail-done ${handled ? 'on' : ''}`}
              onClick={() => setHandled(m, !handled)}
              title={handled ? 'Handled · click to undo' : 'Mark handled'}
              aria-label={handled ? 'Unmark handled' : 'Mark handled'}
            >
              ✓
            </button>
          </span>
        </div>
        {expanded && detail(m, thread)}
      </div>
    )
  }

  const groups = byDay(threads)

  return (
    <>
      <div className="page-head">
        <h1>Mail</h1>
        <div className="page-head-tools cu-tools">
          <span className={`count-note ${stale ? 'mail-stale' : ''}`}>
            {unread > 0 && <>{unread} unread · </>}
            {messages.length} {messages.length === 1 ? 'message' : 'messages'}
            {newestAt && (
              <span title={new Date(newestAt).toLocaleString()}>
                {' · '}
                {stale ? `nothing new since ${formatAgo(newestAt)}` : `latest ${formatAgo(newestAt)}`}
              </span>
            )}
          </span>
          <span className="cu-search-wrap">
            <input
              ref={searchRef}
              className="text-input mail-search"
              placeholder="Search mail…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
              aria-label="Search mail"
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
          <button
            className={`btn ${showAutomated ? '' : 'btn-ghost'} mail-filter`}
            aria-pressed={showAutomated}
            onClick={() => toggleToggle('mailShowAutomated', !showAutomated)}
            title="Newsletters, notifications, and no-reply senders"
          >
            Automated{!showAutomated && hiddenAutomated > 0 ? ` · ${hiddenAutomated}` : ''}
          </button>
          <button
            className={`btn ${showHandled ? '' : 'btn-ghost'} mail-filter`}
            aria-pressed={showHandled}
            onClick={() => toggleToggle('mailShowHandled', !showHandled)}
            title="Messages you marked handled"
          >
            Handled{!showHandled && hiddenHandled > 0 ? ` · ${hiddenHandled}` : ''}
          </button>
          <button className="btn btn-ghost" onClick={() => load()} disabled={refreshing}>
            {refreshing ? 'Reading…' : 'Refresh'}
          </button>
        </div>
      </div>
      {stale && (
        <p className="field-note mail-stale-note">
          Nothing has arrived since {new Date(newestAt!).toLocaleString()}. If that seems wrong,
          check that the Power Automate flow is still running and OneDrive is syncing.
        </p>
      )}
      {messages.length === 0 && (
        <p className="today-quiet">
          The folder is connected but empty. Nothing arrives until the Power Automate flow
          files its first message — send yourself a test email.
        </p>
      )}
      {messages.length > 0 && threads.length === 0 && (
        <p className="today-quiet">
          {needle
            ? `Nothing matches “${query.trim()}”.`
            : hiddenHandled > 0 || hiddenAutomated > 0
              ? 'All caught up. Everything here is handled or automated.'
              : 'Nothing to show.'}
        </p>
      )}
      {groups.map((g) => (
        <section className="section" key={g.label}>
          <span className="card-subhead">
            {g.label} · {g.threads.length}
          </span>
          <div className="mail-list">{g.threads.map(row)}</div>
        </section>
      ))}
      {replyTo && <MailReplyDialog message={replyTo} onClose={() => setReplyTo(null)} />}
      {taskFrom && (
        <ClickupPushDialog
          task={taskFrom.subject}
          description={[
            `From email: ${taskFrom.subject}`,
            `Sender: ${taskFrom.fromName ? `${taskFrom.fromName} <${taskFrom.from}>` : taskFrom.from}`,
            taskFrom.webLink ?? ''
          ]
            .filter(Boolean)
            .join('\n')}
          onDone={() => setTaskFrom(null)}
          onClose={() => setTaskFrom(null)}
        />
      )}
    </>
  )
}
