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
- [x] **Person pages** — a People tab with one page per colleague: meetings together, action
      items they own (with done-tracking), and your own open commitments from shared meetings.
      Built from action-item owners, calendar attendees, named speakers, and the team
      directory (v0.7.0).
- [x] **Threads / series** — meetings sharing a title form a series automatically (recordings
      inherit calendar event titles, so recurring meetings self-assemble; rename to join
      manually). A chip on the meeting page opens the series: decisions over time, everything
      still open across the series, and the occurrence timeline (v0.7.0).

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

- [x] **Follow-up email draft** — a "Follow-up email" button on the meeting page opens an
      in-app, editable recap draft (TL;DR, decisions, action items with owners and dues, open
      questions) with copy buttons for subject and body — paste into any mail client (v0.6.0).
- [ ] **Task push** — send an action item (owner, due date) to ClickUp / Microsoft To Do.
      *(Tabled for now: the team's ClickUp workspace is complex enough that tying in needs a
      deliberate mapping exercise first.)*
- [x] **Weekly digest** — a Monday prompt (open or dismiss, once per week) presenting last
      week's meetings, your open items, anything open 2+ weeks, and who owes what; also
      openable any day from the Today page (v0.7.0).

## 4. Capture fidelity

- [ ] **Real speaker diarization** — per-speaker labels beyond the current mic/system-audio
      split, with name assignment; in-person meetings gain speakers for the first time.
- [x] **Vocabulary hints** — a user glossary in Settings (names, acronyms, program names) fed
      to Whisper as a decoding prompt (whole-file and live chunks) and to the summarizer as a
      spelling glossary (v0.7.0).

## 5. Multi-device (future)

- [ ] **Data folder location setting** — point the app at a user-chosen folder so two PCs can
      share one library via Syncthing (peer-to-peer, keeps the privacy story intact) or
      OneDrive. Secrets stay per-machine (DPAPI is machine-bound by design). Avoid running
      both machines simultaneously.
- [ ] **Markdown auto-export** — write each summary to a synced folder of the user's choosing
      as the read-only phone story (OneDrive/Obsidian on mobile). User chooses what syncs;
      transcripts and audio stay home.
- [ ] **Mobile companion app** — someday-maybe; reading and in-person capture only.

## 6. Trust

- [x] **Privacy statement in-app** — a plain-language Privacy section in Settings stating
      exactly what leaves the machine and when (v0.7.0).
