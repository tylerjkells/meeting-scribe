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

- [x] **Calendar connection** (read-only) — any Outlook/Google calendar via its published iCal
      address; the URL is stored encrypted, polled from the main process (v0.4.0).
- [x] **Today view** — the launch screen: today's schedule with live-now marker and join links,
      today's recordings, open action items assigned to Me (v0.4.0).
- [x] **Auto-context on record** — a recording started during a calendar event inherits the
      event's title (v0.4.0). Still to come: attendee names pre-filling speakers.
- [x] **Pre-meeting briefs** — each Today event with a matching past meeting gets an expandable
      "Last met" brief: decisions, still-open action items with owners/dues, and open questions,
      built straight from the stored summary (no model call). The live/next meeting's brief
      auto-expands (v0.5.0). Later: LLM synthesis across multiple past occurrences.
- [x] **Record nudge** — system notification when a meeting with a call link or room starts and
      nothing is recording; clicking it opens the Record page. Toggle in Settings (v0.5.0).

## 3. Action items that leave the app

- [x] **Follow-up email draft** — a "Follow-up email" button on the meeting page opens the
      default mail client with a recap prefilled: TL;DR, decisions, action items with owners and
      dues, open questions (v0.6.0). Recipients are added by hand — published calendar feeds
      don't carry attendee emails.
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
