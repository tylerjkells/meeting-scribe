import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  session,
  desktopCapturer,
  net,
  protocol,
  dialog
} from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { existsSync, readFileSync } from 'fs'
import {
  listMeetings,
  readMeeting,
  writeMeeting,
  deleteMeeting,
  beginRecording,
  appendPcm,
  finishRecording,
  cancelRecording,
  audioPath
} from './store'
import { getSettings, updateSettings, setApiKey, addPerson } from './settings'
import { engineStatus, setupEngine } from './whisper'
import { processMeeting, summarizeMeeting } from './pipeline'
import { askAboutMeeting, testApiKey } from './summarize'
import { createImportedMeeting } from './importer'
import type {
  ActionRollupItem,
  AppSettings,
  EnergySample,
  RecordingMode,
  WhisperModel
} from '../shared/types'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 860,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#101013',
    title: 'MeetingScribe',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'scribe-media', privileges: { stream: true, supportFetchAPI: true } }
])

app.whenReady().then(() => {
  // System-audio (loopback) capture for virtual meetings: when the renderer
  // calls getDisplayMedia we hand it a screen source with loopback audio and
  // immediately discard the video track on the renderer side.
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
        callback({ video: sources[0], audio: 'loopback' })
      })
    },
    { useSystemPicker: false }
  )

  // Serve stored meeting audio to the renderer without exposing the filesystem
  session.defaultSession.protocol.handle('scribe-media', (request) => {
    const id = decodeURIComponent(new URL(request.url).hostname)
    if (!/^[\w-]+$/.test(id)) return new Response('bad id', { status: 400 })
    const file = audioPath(id)
    if (!existsSync(file)) return new Response('not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })

  registerIpc()
  createWindow()

  // Resume meetings whose processing was interrupted (app closed mid-transcribe, etc.)
  for (const m of listMeetings()) {
    if (m.stage === 'recorded' || m.stage === 'transcribing' || m.stage === 'summarizing') {
      processMeeting(m.id)
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

function registerIpc(): void {
  // --- settings ---
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:update', (_e, patch: Partial<AppSettings>) => updateSettings(patch))
  ipcMain.handle('settings:setApiKey', (_e, key: string | null) => setApiKey(key))
  ipcMain.handle('settings:testApiKey', (_e, key: string) => testApiKey(key))

  // --- transcription engine ---
  ipcMain.handle('engine:status', () => engineStatus(getSettings().whisperModel))
  ipcMain.handle('engine:setup', async (e, model?: WhisperModel) => {
    const target = model ?? getSettings().whisperModel
    try {
      return await setupEngine(target, (p) => e.sender.send('engine:progress', p))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Engine setup failed'
      e.sender.send('engine:progress', { phase: 'binary', percent: -1, detail: msg, error: msg })
      throw err
    }
  })

  // --- recording ---
  ipcMain.handle('rec:begin', (_e, mode: RecordingMode) => beginRecording(mode))
  ipcMain.on('rec:pcm', (_e, id: string, chunk: ArrayBuffer) => {
    appendPcm(id, Buffer.from(chunk))
  })
  ipcMain.handle(
    'rec:finish',
    async (
      _e,
      id: string,
      webm: ArrayBuffer,
      durationMs: number,
      energy: EnergySample[] | null
    ) => {
      const meeting = await finishRecording(id, Buffer.from(webm), durationMs, energy)
      // fire-and-forget: transcribe + summarize in the background
      processMeeting(id)
      return meeting
    }
  )
  ipcMain.handle('rec:cancel', (_e, id: string) => cancelRecording(id))

  // --- meetings ---
  ipcMain.handle('meetings:list', () => listMeetings())
  ipcMain.handle('meetings:get', (_e, id: string) => readMeeting(id))
  ipcMain.handle('meetings:rename', (_e, id: string, title: string) => {
    const m = readMeeting(id)
    if (!m) return null
    m.title = title.trim() || m.title
    writeMeeting(m)
    return m
  })
  ipcMain.handle('meetings:delete', (_e, id: string) => deleteMeeting(id))
  ipcMain.handle('meetings:retry', (_e, id: string) => {
    processMeeting(id)
  })
  ipcMain.handle('meetings:resummarize', (_e, id: string) => {
    summarizeMeeting(id)
  })
  ipcMain.handle('meetings:import', (_e, title: string, dateIso: string, text: string) => {
    const meeting = createImportedMeeting(title, dateIso, text)
    // transcript already exists, so this goes straight to summarization
    processMeeting(meeting.id)
    return meeting
  })

  ipcMain.handle(
    'meetings:setSpeakers',
    (_e, id: string, names: { me: string; them: string }) => {
      const m = readMeeting(id)
      if (!m) return null
      m.speakerNames = {
        me: names.me.trim() || 'Me',
        them: names.them.trim() || 'Them'
      }
      if (m.speakerNames.them !== 'Them') addPerson(m.speakerNames.them)
      writeMeeting(m)
      return m
    }
  )

  ipcMain.handle('meetings:ask', async (_e, id: string, question: string): Promise<string> => {
    const meeting = readMeeting(id)
    if (!meeting) throw new Error('Meeting not found')
    const answer = await askAboutMeeting(meeting, question, getSettings().claudeModel)
    meeting.qa = [...(meeting.qa ?? []), { q: question, a: answer }]
    writeMeeting(meeting)
    return answer
  })

  ipcMain.handle('actions:list', (): ActionRollupItem[] => {
    const items: ActionRollupItem[] = []
    for (const entry of listMeetings()) {
      const m = readMeeting(entry.id)
      if (!m?.summary) continue
      m.summary.actionItems.forEach((a, index) => {
        items.push({
          meetingId: m.id,
          meetingTitle: m.title,
          createdAt: m.createdAt,
          index,
          task: a.task,
          owner: a.owner,
          due: a.due,
          done: a.done ?? false
        })
      })
    }
    return items
  })

  ipcMain.handle('actions:toggle', (_e, meetingId: string, index: number): boolean => {
    const m = readMeeting(meetingId)
    const item = m?.summary?.actionItems[index]
    if (!m || !item) return false
    item.done = !item.done
    writeMeeting(m)
    return item.done
  })

  ipcMain.handle(
    'actions:setOwner',
    (_e, meetingId: string, index: number, owner: string | null) => {
      const m = readMeeting(meetingId)
      const item = m?.summary?.actionItems[index]
      if (!m || !item) return null
      item.owner = owner?.trim() || null
      if (item.owner) addPerson(item.owner)
      writeMeeting(m)
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('meeting:updated', m)
      }
      return m
    }
  )

  ipcMain.handle(
    'meetings:exportMarkdown',
    async (e, defaultName: string, content: string): Promise<string | null> => {
      const win = BrowserWindow.fromWebContents(e.sender)
      const result = await dialog.showSaveDialog(win!, {
        title: 'Export meeting',
        defaultPath: join(app.getPath('documents'), defaultName),
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      })
      if (result.canceled || !result.filePath) return null
      writeFileSync(result.filePath, content, 'utf-8')
      return result.filePath
    }
  )
}
