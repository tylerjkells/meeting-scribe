import { useEffect, useState } from 'react'
import type { AppSettings, EngineProgress, EngineStatus, WhisperModel } from '../../../shared/types'

const WHISPER_MODELS: { id: WhisperModel; title: string; desc: string }[] = [
  { id: 'base.en', title: 'Base', desc: 'Fastest, ~140 MB. Fine for clear audio and short meetings.' },
  { id: 'small.en', title: 'Small', desc: 'Recommended: good accuracy, ~470 MB, still quick on a laptop.' },
  { id: 'medium.en', title: 'Medium', desc: 'Most accurate, ~1.5 GB. Noticeably slower to transcribe.' }
]

const CLAUDE_MODELS = [
  { id: 'claude-haiku-4-5', title: 'Claude Haiku 4.5', desc: 'Recommended: excellent summaries for pennies per meeting.' },
  { id: 'claude-sonnet-5', title: 'Claude Sonnet 5', desc: 'Stronger nuance on long or messy meetings; a few cents more.' },
  { id: 'claude-opus-4-8', title: 'Claude Opus 4.8', desc: 'Highest quality, highest cost.' }
]

export function SettingsView({
  settings,
  onChange,
  engine
}: {
  settings: AppSettings
  onChange: (s: AppSettings) => void
  engine: EngineStatus | null
}): React.JSX.Element {
  const [keyDraft, setKeyDraft] = useState('')
  const [keyStatus, setKeyStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [savingKey, setSavingKey] = useState(false)
  const [dlProgress, setDlProgress] = useState<EngineProgress | null>(null)
  const [downloading, setDownloading] = useState<WhisperModel | null>(null)
  const [personDraft, setPersonDraft] = useState('')
  const [storage, setStorage] = useState<{ count: number; totalBytes: number; audioBytes: number } | null>(null)

  useEffect(() => {
    window.scribe.meetings.storageStats().then(setStorage)
  }, [])

  function formatBytes(n: number): string {
    if (n >= 1073741824) return `${(n / 1073741824).toFixed(1)} GB`
    if (n >= 1048576) return `${(n / 1048576).toFixed(0)} MB`
    return `${Math.max(1, Math.round(n / 1024))} KB`
  }

  async function addPersonToDirectory(): Promise<void> {
    const name = personDraft.trim()
    if (!name) return
    onChange(await window.scribe.settings.update({ people: [...settings.people, name] }))
    setPersonDraft('')
  }

  useEffect(() => window.scribe.engine.onProgress(setDlProgress), [])

  async function saveKey(): Promise<void> {
    const key = keyDraft.trim()
    if (!key) return
    setSavingKey(true)
    setKeyStatus(null)
    const test = await window.scribe.settings.testApiKey(key)
    if (!test.ok) {
      setKeyStatus({ ok: false, msg: test.error ?? 'Key check failed' })
      setSavingKey(false)
      return
    }
    const next = await window.scribe.settings.setApiKey(key)
    onChange(next)
    setKeyDraft('')
    setKeyStatus({ ok: true, msg: 'Key verified and saved securely.' })
    setSavingKey(false)
  }

  async function removeKey(): Promise<void> {
    const next = await window.scribe.settings.setApiKey(null)
    onChange(next)
    setKeyStatus(null)
  }

  async function pickWhisper(model: WhisperModel): Promise<void> {
    const hasModel = engine?.models.includes(model)
    const next = await window.scribe.settings.update({ whisperModel: model })
    onChange(next)
    if (!hasModel) {
      setDownloading(model)
      try {
        await window.scribe.engine.setup(model)
      } finally {
        setDownloading(null)
        setDlProgress(null)
      }
    }
  }

  return (
    <div className="main-narrow">
      <div className="page-head">
        <h1>Settings</h1>
      </div>

      <div className="settings-group">
        <h2>Claude API key</h2>
        <p className="hint">
          Used only for meeting summaries, billed per use by Anthropic, typically 1–5 cents per
          meeting. Get a key at console.anthropic.com. Stored encrypted on this machine.
        </p>
        {settings.hasApiKey ? (
          <div className="field-row">
            <span className="badge badge-quiet">Key saved ✓</span>
            <button className="btn btn-ghost btn-danger" onClick={removeKey}>
              Remove key
            </button>
          </div>
        ) : (
          <>
            <div className="field-row">
              <input
                className="text-input"
                type="password"
                placeholder="sk-ant-…"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveKey()}
                aria-label="Claude API key"
              />
              <button className="btn btn-primary" onClick={saveKey} disabled={savingKey || !keyDraft.trim()}>
                {savingKey ? 'Checking…' : 'Save'}
              </button>
            </div>
          </>
        )}
        {keyStatus && (
          <p className={`field-note ${keyStatus.ok ? 'ok' : 'error'}`} role="status">
            {keyStatus.msg}
          </p>
        )}
      </div>

      <div className="settings-group">
        <h2>Summary model</h2>
        <p className="hint">Which Claude model writes your summaries.</p>
        <div className="seg-options">
          {CLAUDE_MODELS.map((m) => (
            <button
              key={m.id}
              className={`seg-option ${settings.claudeModel === m.id ? 'selected' : ''}`}
              onClick={async () => onChange(await window.scribe.settings.update({ claudeModel: m.id }))}
            >
              <span>
                <span className="opt-title">{m.title}</span>
                <br />
                <span className="opt-desc">{m.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <h2>Transcription model</h2>
        <p className="hint">
          Runs entirely on this machine. Switching to a model you haven&apos;t downloaded yet will
          download it first.
        </p>
        <div className="seg-options">
          {WHISPER_MODELS.map((m) => (
            <button
              key={m.id}
              className={`seg-option ${settings.whisperModel === m.id ? 'selected' : ''}`}
              onClick={() => pickWhisper(m.id)}
              disabled={downloading !== null}
            >
              <span>
                <span className="opt-title">
                  {m.title}
                  {engine?.models.includes(m.id) ? ' · downloaded' : ''}
                  {downloading === m.id ? ' · downloading…' : ''}
                </span>
                <br />
                <span className="opt-desc">{m.desc}</span>
              </span>
            </button>
          ))}
        </div>
        {downloading && dlProgress && (
          <div className="setup-progress" aria-live="polite">
            {dlProgress.detail}
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: dlProgress.percent >= 0 ? `${dlProgress.percent}%` : '100%',
                  opacity: dlProgress.percent >= 0 ? 1 : 0.35
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="settings-group">
        <h2>Team directory</h2>
        <p className="hint">
          Names offered in the assign dropdown on action items. Assigning someone new, or naming a
          speaker, adds them here automatically.
        </p>
        {settings.people.length > 0 && (
          <div className="person-list">
            {settings.people.map((p) => (
              <span className="person-chip" key={p}>
                {p}
                <button
                  className="person-remove"
                  aria-label={`Remove ${p} from directory`}
                  onClick={async () =>
                    onChange(
                      await window.scribe.settings.update({
                        people: settings.people.filter((x) => x !== p)
                      })
                    )
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="field-row">
          <input
            className="text-input"
            placeholder="Add a name"
            value={personDraft}
            onChange={(e) => setPersonDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPersonToDirectory()}
            aria-label="Add a person to the team directory"
          />
          <button className="btn" onClick={addPersonToDirectory} disabled={!personDraft.trim()}>
            Add
          </button>
        </div>
      </div>

      {storage && storage.count > 0 && (
        <div className="settings-group">
          <h2>Storage</h2>
          <p className="hint">
            {storage.count} {storage.count === 1 ? 'meeting' : 'meetings'} using{' '}
            {formatBytes(storage.totalBytes)}, of which {formatBytes(storage.audioBytes)} is audio.
            To reclaim space, open a meeting and use &ldquo;Delete audio, keep notes&rdquo;:
            transcripts and summaries are tiny and stay searchable forever.
          </p>
        </div>
      )}

      <div className="settings-group">
        <h2>Behavior</h2>
        <div className="seg-options">
          <button
            className={`seg-option ${settings.autoSummarize ? 'selected' : ''}`}
            onClick={async () =>
              onChange(await window.scribe.settings.update({ autoSummarize: !settings.autoSummarize }))
            }
          >
            <span>
              <span className="opt-title">Summarize automatically</span>
              <br />
              <span className="opt-desc">
                {settings.autoSummarize
                  ? 'On: every recording is summarized right after transcription.'
                  : 'Off: transcripts only; summarize individual meetings by hand.'}
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
