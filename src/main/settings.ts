import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { AppSettings, WhisperModel } from '../shared/types'

interface StoredSettings {
  whisperModel: WhisperModel
  claudeModel: string
  autoSummarize: boolean
  people: string[]
  /** base64 of safeStorage-encrypted API key */
  apiKeyEncrypted: string | null
  /** base64 of safeStorage-encrypted iCal feed URL (the URL is a secret) */
  calendarUrlEncrypted: string | null
}

const DEFAULTS: StoredSettings = {
  whisperModel: 'small.en',
  claudeModel: 'claude-haiku-4-5',
  autoSummarize: true,
  people: [],
  apiKeyEncrypted: null,
  calendarUrlEncrypted: null
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

let cache: StoredSettings | null = null

function load(): StoredSettings {
  if (cache) return cache
  try {
    if (existsSync(settingsPath())) {
      cache = { ...DEFAULTS, ...JSON.parse(readFileSync(settingsPath(), 'utf-8')) }
      return cache!
    }
  } catch {
    // corrupted settings fall back to defaults
  }
  cache = { ...DEFAULTS }
  return cache
}

function persist(): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(settingsPath(), JSON.stringify(cache, null, 2))
}

export function getSettings(): AppSettings {
  const s = load()
  return {
    whisperModel: s.whisperModel,
    claudeModel: s.claudeModel,
    autoSummarize: s.autoSummarize,
    people: s.people ?? [],
    hasApiKey: !!s.apiKeyEncrypted,
    hasCalendar: !!s.calendarUrlEncrypted
  }
}

export function updateSettings(
  patch: Partial<Pick<AppSettings, 'whisperModel' | 'claudeModel' | 'autoSummarize' | 'people'>>
): AppSettings {
  const s = load()
  if (patch.whisperModel) s.whisperModel = patch.whisperModel
  if (patch.claudeModel) s.claudeModel = patch.claudeModel
  if (typeof patch.autoSummarize === 'boolean') s.autoSummarize = patch.autoSummarize
  if (Array.isArray(patch.people)) {
    s.people = dedupeNames(patch.people)
  }
  persist()
  return getSettings()
}

function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of names) {
    const name = String(raw).trim()
    const key = name.toLowerCase()
    if (!name || key === 'me' || seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out.sort((a, b) => a.localeCompare(b))
}

/** Add someone to the team directory (used when assigning a new name). */
export function addPerson(name: string): void {
  const trimmed = name.trim()
  if (!trimmed || trimmed.toLowerCase() === 'me') return
  const s = load()
  if ((s.people ?? []).some((p) => p.toLowerCase() === trimmed.toLowerCase())) return
  s.people = dedupeNames([...(s.people ?? []), trimmed])
  persist()
}

export function setApiKey(key: string | null): AppSettings {
  const s = load()
  if (!key) {
    s.apiKeyEncrypted = null
  } else if (safeStorage.isEncryptionAvailable()) {
    s.apiKeyEncrypted = safeStorage.encryptString(key.trim()).toString('base64')
  } else {
    // last-resort fallback: obfuscated, not secure — safeStorage is available on
    // any normal Windows login session so this path should not be hit in practice
    s.apiKeyEncrypted = 'plain:' + Buffer.from(key.trim()).toString('base64')
  }
  persist()
  return getSettings()
}

export function getApiKey(): string | null {
  const s = load()
  return decryptStored(s.apiKeyEncrypted)
}

export function setCalendarUrl(url: string | null): AppSettings {
  const s = load()
  if (!url) {
    s.calendarUrlEncrypted = null
  } else if (safeStorage.isEncryptionAvailable()) {
    s.calendarUrlEncrypted = safeStorage.encryptString(url.trim()).toString('base64')
  } else {
    s.calendarUrlEncrypted = 'plain:' + Buffer.from(url.trim()).toString('base64')
  }
  persist()
  return getSettings()
}

export function getCalendarUrl(): string | null {
  const s = load()
  return decryptStored(s.calendarUrlEncrypted)
}

function decryptStored(value: string | null): string | null {
  if (!value) return null
  try {
    if (value.startsWith('plain:')) {
      return Buffer.from(value.slice(6), 'base64').toString('utf-8')
    }
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch {
    return null
  }
}
