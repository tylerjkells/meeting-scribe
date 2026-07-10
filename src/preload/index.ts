import { contextBridge, ipcRenderer } from 'electron'
import type {
  ActionRollupItem,
  AppSettings,
  EnergySample,
  EngineProgress,
  EngineStatus,
  Meeting,
  MeetingListItem,
  RecordingMode,
  WhisperModel
} from '../shared/types'

const api = {
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    update: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke('settings:update', patch),
    setApiKey: (key: string | null): Promise<AppSettings> =>
      ipcRenderer.invoke('settings:setApiKey', key),
    testApiKey: (key: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('settings:testApiKey', key)
  },
  engine: {
    status: (): Promise<EngineStatus> => ipcRenderer.invoke('engine:status'),
    setup: (model?: WhisperModel): Promise<EngineStatus> =>
      ipcRenderer.invoke('engine:setup', model),
    onProgress: (cb: (p: EngineProgress) => void): (() => void) => {
      const handler = (_e: unknown, p: EngineProgress): void => cb(p)
      ipcRenderer.on('engine:progress', handler)
      return () => ipcRenderer.removeListener('engine:progress', handler)
    }
  },
  rec: {
    begin: (mode: RecordingMode): Promise<string> => ipcRenderer.invoke('rec:begin', mode),
    pcm: (id: string, chunk: ArrayBuffer): void => ipcRenderer.send('rec:pcm', id, chunk),
    finish: (
      id: string,
      webm: ArrayBuffer,
      durationMs: number,
      energy: EnergySample[] | null
    ): Promise<Meeting> => ipcRenderer.invoke('rec:finish', id, webm, durationMs, energy),
    cancel: (id: string): Promise<void> => ipcRenderer.invoke('rec:cancel', id)
  },
  meetings: {
    list: (): Promise<MeetingListItem[]> => ipcRenderer.invoke('meetings:list'),
    get: (id: string): Promise<Meeting | null> => ipcRenderer.invoke('meetings:get', id),
    rename: (id: string, title: string): Promise<Meeting | null> =>
      ipcRenderer.invoke('meetings:rename', id, title),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('meetings:delete', id),
    retry: (id: string): Promise<void> => ipcRenderer.invoke('meetings:retry', id),
    resummarize: (id: string): Promise<void> => ipcRenderer.invoke('meetings:resummarize', id),
    exportMarkdown: (defaultName: string, content: string): Promise<string | null> =>
      ipcRenderer.invoke('meetings:exportMarkdown', defaultName, content),
    ask: (id: string, question: string): Promise<string> =>
      ipcRenderer.invoke('meetings:ask', id, question),
    setSpeakers: (id: string, names: { me: string; them: string }): Promise<Meeting | null> =>
      ipcRenderer.invoke('meetings:setSpeakers', id, names),
    onUpdated: (cb: (m: Meeting) => void): (() => void) => {
      const handler = (_e: unknown, m: Meeting): void => cb(m)
      ipcRenderer.on('meeting:updated', handler)
      return () => ipcRenderer.removeListener('meeting:updated', handler)
    }
  },
  actions: {
    list: (): Promise<ActionRollupItem[]> => ipcRenderer.invoke('actions:list'),
    toggle: (meetingId: string, index: number): Promise<boolean> =>
      ipcRenderer.invoke('actions:toggle', meetingId, index),
    setOwner: (meetingId: string, index: number, owner: string | null): Promise<Meeting | null> =>
      ipcRenderer.invoke('actions:setOwner', meetingId, index, owner)
  }
}

export type ScribeApi = typeof api

contextBridge.exposeInMainWorld('scribe', api)
