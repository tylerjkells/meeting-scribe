import { useCallback, useEffect, useRef, useState } from 'react'
import type { MeetingStage } from '../../shared/types'

export interface ConfirmOptions {
  title: string
  body?: string
  /** label for the confirming button, e.g. "Delete" */
  confirmLabel?: string
  /** destructive actions get the accent-solid treatment */
  danger?: boolean
}

/**
 * In-app replacement for window.confirm. Returns the dialog element (render
 * it anywhere in the view) and an async confirm(opts) that resolves true on
 * confirm, false on cancel/Escape/backdrop click.
 */
export function useConfirm(): [React.JSX.Element, (opts: ConfirmOptions) => Promise<boolean>] {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  const confirm = useCallback((o: ConfirmOptions): Promise<boolean> => {
    setOpts(o)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  useEffect(() => {
    if (opts) dialogRef.current?.showModal()
  }, [opts])

  function settle(value: boolean): void {
    resolver.current?.(value)
    resolver.current = null
    dialogRef.current?.close()
    setOpts(null)
  }

  const element = opts ? (
    <dialog
      ref={dialogRef}
      className="confirm"
      onClose={() => settle(false)}
      onClick={(e) => {
        // click on the backdrop (the dialog element itself) cancels
        if (e.target === dialogRef.current) settle(false)
      }}
    >
      <h3>{opts.title}</h3>
      {opts.body && <p>{opts.body}</p>}
      <div className="confirm-actions">
        <button className="btn" onClick={() => settle(false)}>
          Cancel
        </button>
        <button
          className={`btn ${opts.danger ? 'btn-solid-danger' : 'btn-primary'}`}
          autoFocus
          onClick={() => settle(true)}
        >
          {opts.confirmLabel ?? 'OK'}
        </button>
      </div>
    </dialog>
  ) : (
    <></>
  )

  return [element, confirm]
}

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

export function formatWhen(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  const date = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric'
  })
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${date} · ${time}`
}

export function StageBadge({
  stage,
  progress
}: {
  stage: MeetingStage
  progress?: number
}): React.JSX.Element | null {
  switch (stage) {
    case 'transcribing':
      return (
        <span className="badge badge-working">
          <span className="spinner" aria-hidden="true" />
          Transcribing{typeof progress === 'number' && progress > 0 ? ` ${progress}%` : '…'}
        </span>
      )
    case 'summarizing':
      return (
        <span className="badge badge-working">
          <span className="spinner" aria-hidden="true" />
          Summarizing…
        </span>
      )
    case 'recorded':
      return <span className="badge badge-quiet">Queued</span>
    case 'transcript-only':
      return <span className="badge badge-quiet">Transcript only</span>
    case 'error':
      return <span className="badge badge-error">Needs attention</span>
    default:
      return null
  }
}

/** Click-to-edit owner chip for action items, with known-owner suggestions. */
export function OwnerEditor({
  owner,
  suggestions,
  onSave
}: {
  owner: string | null
  suggestions: string[]
  onSave: (owner: string | null) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  if (!editing) {
    return (
      <button
        className={`owner-btn ${owner ? '' : 'unassigned'}`}
        title={owner ? `Assigned to ${owner} (click to change)` : 'Assign to someone'}
        onClick={() => {
          setDraft(owner ?? '')
          setEditing(true)
        }}
      >
        {owner ?? '+ Assign'}
      </button>
    )
  }

  function commit(): void {
    setEditing(false)
    const next = draft.trim() || null
    if (next !== owner) onSave(next)
  }

  return (
    <>
      <input
        autoFocus
        className="text-input owner-input"
        list="owner-suggestions"
        placeholder="Name"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setDraft(owner ?? '')
            setEditing(false)
          }
        }}
        aria-label="Action item owner"
      />
      <datalist id="owner-suggestions">
        {suggestions.map((s) => (
          <option value={s} key={s} />
        ))}
      </datalist>
    </>
  )
}

/* 16px stroke icons, consistent weight */

export function MicIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
      <path d="M12 18v4" />
    </svg>
  )
}

export function ListIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function GearIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
    </svg>
  )
}

export function TodayIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="2.5" />
      <path d="M3 9h18M8 2v4M16 2v4" />
      <circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function SparkIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z" />
      <path d="M19 15.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9Z" />
    </svg>
  )
}

export function CheckIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  )
}

export function StopIcon(): React.JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

export function ChevronIcon(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

export function BackIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}
