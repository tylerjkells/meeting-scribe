# Roadmap

The goal: turn MeetingScribe from a meeting recorder into a day-to-day companion — the app
that briefs you before a meeting, remembers what was promised months ago, and chases the
follow-ups. Useful *before* the meeting, *between* meetings, and *across* all of them.

Guiding constraint throughout: **transcripts and audio stay local**. Only what you explicitly
send (a summary, a task, an email draft) ever leaves the machine. That's what makes the app
usable in meetings that touch student data.

## 1. Cross-meeting memory

- [x] **Library-wide Ask** — ask questions across every meeting, answered with citations that
      link back to the source meetings (v0.3.0). Uses two-stage retrieval: a cheap pass over a
      compact catalog picks the relevant meetings, a second pass answers from their transcripts.
- [ ] **Person pages** — one page per colleague: meetings they appeared in, action items they
      own, commitments made to them. (The `people` directory and action-item owners already
      exist as the data backbone.)
- [ ] **Threads / series** — tag meetings to a recurring series ("Enrollment Ops weekly") and
      get a running narrative: decisions to date, open items, what changed since last time.

## 2. Calendar awareness

- [ ] **Calendar connection** (read-only) — Google/Outlook.
- [ ] **Pre-meeting briefs** — before a recurring meeting: what was decided last time, which
      action items are still open, what you said you'd bring.
- [ ] **Auto-context on record** — recording during a calendar event inherits its title,
      attendees (pre-filling speaker names), and series.
- [ ] **Today view** — a launch screen with today's meetings + briefs, recordings processing,
      and action items due soon.
- [ ] **Record nudge** — tray notification when a meeting with a call link starts and nothing
      is recording.

## 3. Action items that leave the app

- [ ] **Follow-up email draft** — one click turns a summary into a recap email addressed to
      the attendees.
- [ ] **Task push** — send an action item (owner, due date) to ClickUp / Microsoft To Do.
- [ ] **Weekly digest** — what's open, what's overdue, what you committed to this week.

## 4. Capture fidelity

- [ ] **Real speaker diarization** — per-speaker labels beyond the current mic/system-audio
      split, with name assignment; in-person meetings gain speakers for the first time.
- [ ] **Vocabulary hints** — a user glossary (names, acronyms, program names) fed to Whisper
      as an initial prompt and to Claude for correction of domain terms.

## 5. Trust

- [ ] **Privacy statement in-app** — a plain-language page stating exactly what leaves the
      machine and when, so the app is easy to advocate for internally.
