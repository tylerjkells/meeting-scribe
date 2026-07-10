import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { AppSettings, WhisperModel } from '../shared/types'

interface StoredSettings {
  whisperModel: WhisperModel
  claudeModel: string
  autoSummarize: boolean
  /** base64 of safeStorage-encrypted API key */
  apiKeyEncrypted: string | null
}

const DEFAULTS: StoredSettings = {
  whisperModel: 'small.en',
  claudeModel: 'claude-haiku-4-5',
  autoSummarize: true,
  apiKeyEncrypted: null
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
    hasApiKey: !!s.apiKeyEncrypted
  }
}

export function updateSettings(patch: Partial<Pick<AppSettings, 'whisperModel' | 'claudeModel' | 'autoSummarize'>>): AppSettings {
  const s = load()
  if (patch.whisperModel) s.whisperModel = patch.whisperModel
  if (patch.claudeModel) s.claudeModel = patch.claudeModel
  if (typeof patch.autoSummarize === 'boolean') s.autoSummarize = patch.autoSummarize
  persist()
  return getSettings()
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
  if (!s.apiKeyEncrypted) return null
  try {
    if (s.apiKeyEncrypted.startsWith('plain:')) {
      return Buffer.from(s.apiKeyEncrypted.slice(6), 'base64').toString('utf-8')
    }
    return safeStorage.decryptString(Buffer.from(s.apiKeyEncrypted, 'base64'))
  } catch {
    return null
  }
}
