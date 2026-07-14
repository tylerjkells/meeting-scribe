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
  /** participant names inherited from the matching calendar event */
  attendees?: string[]
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

/** one event from the connected calendar feed */
export interface CalendarEvent {
  id: string
  title: string
  /** ISO start/end */
  start: string
  end: string
  allDay: boolean
  location: string | null
  /** join link when a known meeting platform was found in the event */
  joinUrl: string | null
  /** display names of invitees + organizer, when the feed includes them */
  attendees: string[]
}

/** pre-meeting brief: where a meeting series left off last time */
export interface EventBrief {
  meetingId: string
  meetingTitle: string
  createdAt: string
  tldr: string | null
  decisions: string[]
  openActions: { task: string; owner: string | null; due: string | null }[]
  openQuestions: string[]
}

/** the Monday-morning rollup */
export interface WeeklyDigest {
  /** e.g. "July 14" (the day the digest was generated) */
  weekLabel: string
  lastWeekMeetings: { id: string; title: string; createdAt: string; durationMs: number }[]
  /** open items assigned to Me, all meetings */
  myOpen: ActionRollupItem[]
  /** open items (any owner) from meetings more than two weeks old */
  aging: ActionRollupItem[]
  /** open-item counts per colleague */
  byPerson: { name: string; count: number }[]
}

/** one row on the People page */
export interface PersonSummary {
  name: string
  meetingCount: number
  openItems: number
}

export interface PersonMeetingRef {
  id: string
  title: string
  createdAt: string
  tldr?: string
}

/** everything the app knows about one colleague */
export interface PersonProfile {
  name: string
  /** meetings they appeared in (attendee, named speaker, or item owner) */
  meetings: PersonMeetingRef[]
  /** action items they own, open and done */
  items: ActionRollupItem[]
  /** your own open items from meetings you shared with them */
  myCommitments: ActionRollupItem[]
}

export type WhisperModel = 'base.en' | 'small.en' | 'medium.en'

export type AppTheme = 'studio' | 'rowan' | 'slate' | 'paper'

export interface AppSettings {
  whisperModel: WhisperModel
  claudeModel: string
  autoSummarize: boolean
  hasApiKey: boolean
  /** a calendar feed URL is connected */
  hasCalendar: boolean
  /** notify when a calendared meeting starts and nothing is recording */
  recordNudge: boolean
  theme: AppTheme
  /** names, acronyms, and jargon fed to transcription and summaries */
  vocabulary: string
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
