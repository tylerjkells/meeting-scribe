export type RecordingMode = 'in-person' | 'virtual' | 'imported'

export type MeetingStage =
  | 'recorded'
  | 'transcribing'
  | 'summarizing'
  | 'ready'
  | 'transcript-only'
  | 'error'

export interface TranscriptSegment {
  /** start time in ms */
  from: number
  /** end time in ms */
  to: number
  text: string
  /** which audio source dominated this segment (virtual meetings only) */
  speaker?: 'me' | 'them'
}

/** periodic per-source loudness sample captured while recording */
export interface EnergySample {
  /** active-recording time in ms (pauses excluded) */
  t: number
  mic: number
  sys: number
}

export interface ActionItem {
  task: string
  owner: string | null
  due: string | null
  /** user-toggled completion state (not set by the model) */
  done?: boolean
}

/** one Q&A exchange in "ask about this meeting" */
export interface MeetingQA {
  q: string
  a: string
}

/** one cited meeting under a library-wide answer */
export interface AskSource {
  /** marker used inline in the answer text, e.g. 1 for [1] */
  ref: number
  meetingId: string
  /** resolved at answer time so history renders even if the meeting is later deleted */
  meetingTitle: string
  createdAt: string
  /** moment in the meeting that best supports the answer, if the model tied it to one */
  timestampMs: number | null
}

/** one Q&A exchange in the library-wide Ask page */
export interface LibraryQA {
  q: string
  a: string
  sources: AskSource[]
  askedAt: string
}

/** a single action item in the cross-meeting rollup */
export interface ActionRollupItem {
  meetingId: string
  meetingTitle: string
  createdAt: string
  /** index into that meeting's summary.actionItems */
  index: number
  task: string
  owner: string | null
  due: string | null
  done: boolean
}

export interface SummaryTopic {
  heading: string
  notes: string[]
}

export interface MeetingSummary {
  title: string
  tldr: string
  /** discussion grouped into topical sections, meeting-minutes style */
  topics?: SummaryTopic[]
  /** legacy flat list from summaries generated before topics existed */
  keyPoints?: string[]
  decisions: string[]
  actionItems: ActionItem[]
  openQuestions: string[]
}

export interface Meeting {
  id: string
  title: string
  createdAt: string
  durationMs: number
  mode: RecordingMode
  stage: MeetingStage
  /** progress 0-100 while transcribing */
  progress?: number
  error?: string
  hasAudio: boolean
  transcript?: TranscriptSegment[]
  summary?: MeetingSummary
  qa?: MeetingQA[]
  /** display names for the two audio sources, e.g. { me: 'Tyler', them: 'David' } */
  speakerNames?: { me: string; them: string }
}

/** Lightweight listing shape (no transcript body) */
export interface MeetingListItem {
  id: string
  title: string
  createdAt: string
  durationMs: number
  mode: RecordingMode
  stage: MeetingStage
  progress?: number
  error?: string
  tldr?: string
}

export type WhisperModel = 'base.en' | 'small.en' | 'medium.en'

export interface AppSettings {
  whisperModel: WhisperModel
  claudeModel: string
  autoSummarize: boolean
  hasApiKey: boolean
  /** team directory: names offered when assigning action items */
  people: string[]
}

export interface EngineStatus {
  binaryReady: boolean
  modelReady: boolean
  /** which model file is present, if any */
  models: WhisperModel[]
}

export interface EngineProgress {
  phase: 'binary' | 'model'
  /** 0-100, or -1 for indeterminate */
  percent: number
  detail: string
  done?: boolean
  error?: string
}
