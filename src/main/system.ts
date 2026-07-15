import { app, BrowserWindow, Menu, Tray, globalShortcut, nativeImage } from 'electron'
import { join } from 'path'
import { getSettings } from './settings'

// ---------------------------------------------------------------------------
// Always-on plumbing: tray residency (close hides instead of quitting),
// launch at login (starting hidden), and a global Ctrl+Alt+R that brings the
// app forward on the Record page from anywhere.
// ---------------------------------------------------------------------------

let tray: Tray | null = null
let quitting = false

app.on('before-quit', () => {
  quitting = true
})

export function isQuitting(): boolean {
  return quitting
}

function iconPath(): string {
  // packaged: build/icon.ico ships inside the asar; dev: repo path
  return join(app.getAppPath(), 'build', 'icon.ico')
}

function mainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

export function showMainWindow(page?: 'record'): void {
  const win = mainWindow()
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (page === 'record') win.webContents.send('nudge:openRecord')
}

function ensureTray(): void {
  if (tray) return
  const image = nativeImage.createFromPath(iconPath())
  tray = new Tray(image)
  tray.setToolTip('MeetingScribe')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open MeetingScribe', click: () => showMainWindow() },
      { label: 'Start recording', click: () => showMainWindow('record') },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', () => showMainWindow())
}

function destroyTray(): void {
  tray?.destroy()
  tray = null
}

/** (Re)apply tray, login item, and hotkey to match settings. Safe to call often. */
export function applySystemSettings(): void {
  const s = getSettings()

  if (s.closeToTray) ensureTray()
  else destroyTray()

  if (app.isPackaged) {
    // dev builds must not register the dev electron.exe as a login item
    app.setLoginItemSettings({
      openAtLogin: s.launchAtLogin,
      args: ['--hidden']
    })
  }

  globalShortcut.unregister('Control+Alt+R')
  if (s.recordHotkey) {
    globalShortcut.register('Control+Alt+R', () => showMainWindow('record'))
  }
}

/** windows launched with --hidden (login start) stay in the tray */
export function startHidden(): boolean {
  return process.argv.includes('--hidden')
}
