# MeetingScribe

Record, transcribe, and AI-summarize your meetings — locally, privately, and without a subscription.

- **Record** in-person meetings (your mic) or virtual meetings (your mic **plus** system audio — whatever comes through your speakers/headset from Webex, Teams, Zoom, anything).
- **Transcribe** on your own machine with [whisper.cpp](https://github.com/ggml-org/whisper.cpp). Audio never leaves your PC. $0, forever.
- **Summarize** with the Claude API (pay-per-use — typically 1–5 cents per meeting with Haiku): TL;DR, key points, decisions, action items with owners/due dates, and open questions. Meetings are auto-titled from their content.
- **Ask about a meeting** — a Q&A box on each meeting page, grounded in that meeting's transcript.
- **Ask across everything** — a library-wide Ask page that answers from all your meetings at once ("What did we decide about X?", "What has David committed to?"), with citations linking back to the source meetings.
- **Action items rollup** — every follow-up across all meetings in one checklist, with done-tracking.
- **Today view** — the home screen shows today's calendar (connect any Outlook/Google calendar via its secret iCal address, read-only), today's recordings, and your open action items. Recordings started during a calendar event are titled after it, and each event carries a pre-meeting brief — what was decided last time, which follow-ups are still open, and unresolved questions — pulled from the most recent related meeting in your library.
- **Record nudge** — a system notification when a calendared meeting starts and nothing is recording, so you never lose a meeting to a forgotten record button. One click lands you on the Record page.
- Pause/resume while recording, search the library (press `/`), copy summaries as Markdown, export full meetings to `.md`.

## Running in development

```powershell
npm install
npm run dev
```

## Building the installer

```powershell
npm run dist
```

Produces a Windows installer and a portable `.exe` under `release/`.

## First run

1. The app downloads its speech engine (whisper.cpp) and a language model (~550 MB total) on first use. One time only.
2. To enable AI summaries, paste a Claude API key in **Settings** (get one at [console.anthropic.com](https://console.anthropic.com)). The key is stored encrypted with Windows DPAPI. Without a key you still get full transcripts.

## Where your data lives

Everything is stored locally under `%APPDATA%\meeting-scribe\`:

- `meetings\<id>\meeting.json` — metadata, transcript, summary
- `meetings\<id>\audio.webm` — compressed audio for playback
- `engine\` — whisper.cpp binary and models

Delete a meeting in the app (or delete its folder) and it's gone. There is no cloud copy.

## Architecture

| Piece | Tech |
| --- | --- |
| Shell | Electron + electron-vite, React 19, TypeScript |
| Mic capture | `getUserMedia` |
| System audio | Electron display-media handler with `audio: 'loopback'` (WASAPI loopback) |
| Recording | Web Audio graph → webm/opus (playback) + 16 kHz WAV via AudioWorklet (transcription) |
| Transcription | whisper.cpp `whisper-cli.exe`, models from Hugging Face |
| Summaries | `@anthropic-ai/sdk`, structured outputs (JSON schema), default `claude-haiku-4-5` |
