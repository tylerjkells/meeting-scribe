import { useCallback, useEffect, useState } from 'react'
import type { AppSettings, EngineStatus, Meeting, MeetingListItem } from '../../shared/types'
import { LibraryView } from './views/Library'
import { RecordView } from './views/Record'
import { MeetingView } from './views/MeetingDetail'
import { SettingsView } from './views/Settings'
import { ActionsView } from './views/Actions'
import { ImportView } from './views/Import'
import { MicIcon, ListIcon, GearIcon, CheckIcon } from './ui'

export type View =
  | { name: 'library' }
  | { name: 'record' }
  | { name: 'meeting'; id: string }
  | { name: 'actions' }
  | { name: 'import' }
  | { name: 'settings' }

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>({ name: 'library' })
  const [meetings, setMeetings] = useState<MeetingListItem[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [engine, setEngine] = useState<EngineStatus | null>(null)
  const [recording, setRecording] = useState(false)

  const refreshMeetings = useCallback(() => {
    window.scribe.meetings.list().then(setMeetings)
  }, [])

  useEffect(() => {
    refreshMeetings()
    window.scribe.settings.get().then(setSettings)
    window.scribe.engine.status().then(setEngine)
    const off = window.scribe.meetings.onUpdated(() => refreshMeetings())
    return off
  }, [refreshMeetings])

  const openMeeting = (id: string): void => setView({ name: 'meeting', id })

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">
          <span className="brand-dot" aria-hidden="true" />
          MeetingScribe
        </div>
        <button
          className={`nav-btn ${view.name === 'library' || view.name === 'meeting' ? 'active' : ''}`}
          onClick={() => !recording && setView({ name: 'library' })}
          disabled={recording}
        >
          <ListIcon /> Meetings
        </button>
        <button
          className={`nav-btn ${view.name === 'actions' ? 'active' : ''}`}
          onClick={() => !recording && setView({ name: 'actions' })}
          disabled={recording}
        >
          <CheckIcon /> Action items
        </button>
        <button
          className={`nav-btn ${view.name === 'settings' ? 'active' : ''}`}
          onClick={() => !recording && setView({ name: 'settings' })}
          disabled={recording}
        >
          <GearIcon /> Settings
        </button>
        <div className="sidebar-spacer" />
        {view.name !== 'record' && (
          <button className="record-cta" onClick={() => setView({ name: 'record' })}>
            <MicIcon /> New recording
          </button>
        )}
      </nav>

      <main className="main" key={view.name + ('id' in view ? view.id : '')}>
        <div className="view-enter" style={{ height: view.name === 'record' ? '100%' : undefined }}>
          {view.name === 'library' && (
            <LibraryView
              meetings={meetings}
              onOpen={openMeeting}
              onRecord={() => setView({ name: 'record' })}
              onImport={() => setView({ name: 'import' })}
            />
          )}
          {view.name === 'record' && (
            <RecordView
              engine={engine}
              onEngineReady={setEngine}
              onRecordingChange={setRecording}
              onDone={(m: Meeting) => {
                refreshMeetings()
                setView({ name: 'meeting', id: m.id })
              }}
              onCancel={() => setView({ name: 'library' })}
            />
          )}
          {view.name === 'meeting' && (
            <MeetingView
              id={view.id}
              onBack={() => setView({ name: 'library' })}
              onDeleted={() => {
                refreshMeetings()
                setView({ name: 'library' })
              }}
            />
          )}
          {view.name === 'actions' && <ActionsView onOpen={openMeeting} />}
          {view.name === 'import' && (
            <ImportView
              onDone={(m) => {
                refreshMeetings()
                setView({ name: 'meeting', id: m.id })
              }}
              onCancel={() => setView({ name: 'library' })}
            />
          )}
          {view.name === 'settings' && settings && (
            <SettingsView settings={settings} onChange={setSettings} engine={engine} />
          )}
        </div>
      </main>
    </div>
  )
}
