import type { Meeting } from '../../shared/types'
import { formatDuration, formatWhen } from './ui'

export function summaryToMarkdown(meeting: Meeting): string {
  const s = meeting.summary
  const lines: string[] = [`# ${meeting.title}`, '', `${formatWhen(meeting.createdAt)} · ${formatDuration(meeting.durationMs)} · ${meeting.mode === 'virtual' ? 'virtual' : 'in person'}`, '']
  if (s) {
    lines.push('## TL;DR', '', s.tldr, '')
    if (s.actionItems.length) {
      lines.push(
        '## Action items',
        '',
        ...s.actionItems.map((a) => {
          const who = a.owner ? ` (${a.owner}${a.due ? `, due ${a.due}` : ''})` : a.due ? ` (due ${a.due})` : ''
          return `- [${a.done ? 'x' : ' '}] ${a.task}${who}`
        }),
        ''
      )
    }
    if (s.decisions.length) {
      lines.push('## Decisions', '', ...s.decisions.map((d) => `- ${d}`), '')
    }
    if (s.openQuestions.length) {
      lines.push('## Open questions', '', ...s.openQuestions.map((q) => `- ${q}`), '')
    }
    for (const topic of s.topics ?? []) {
      lines.push(`## ${topic.heading}`, '', ...topic.notes.map((n) => `- ${n}`), '')
    }
    if (!s.topics && s.keyPoints?.length) {
      lines.push('## Key points', '', ...s.keyPoints.map((p) => `- ${p}`), '')
    }
  }
  return lines.join('\n')
}

export function meetingToMarkdown(meeting: Meeting): string {
  const lines = [summaryToMarkdown(meeting)]
  if (meeting.transcript?.length) {
    const names = {
      me: meeting.speakerNames?.me ?? 'Me',
      them: meeting.speakerNames?.them ?? 'Them'
    }
    lines.push('## Transcript', '')
    for (const seg of meeting.transcript) {
      const who = seg.speaker ? `${names[seg.speaker]}: ` : ''
      lines.push(`**[${formatDuration(seg.from)}]** ${who}${seg.text}`)
      lines.push('')
    }
  }
  return lines.join('\n')
}

/**
 * Plain-text follow-up email drafted from the summary, shown in-app for the
 * user to edit and copy. "Me" as an owner becomes the user's speaker name
 * when they set one.
 */
export function followUpEmail(meeting: Meeting): { subject: string; body: string } {
  const s = meeting.summary
  const date = new Date(meeting.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
  const meName =
    meeting.speakerNames?.me && meeting.speakerNames.me.toLowerCase() !== 'me'
      ? meeting.speakerNames.me
      : null
  const owner = (o: string | null): string | null =>
    o && o.toLowerCase() === 'me' ? (meName ?? 'me') : o

  const lines: string[] = ['Hi all,', '', `Quick recap of ${meeting.title} (${date}):`, '']
  if (s) {
    lines.push(s.tldr, '')
    if (s.decisions.length) {
      lines.push('Decisions:', ...s.decisions.map((d) => `- ${d}`), '')
    }
    if (s.actionItems.length) {
      lines.push(
        'Action items:',
        ...s.actionItems.map((a) => {
          const who = owner(a.owner)
          const tail = [who, a.due ? `due ${a.due}` : null].filter(Boolean).join(', ')
          return `- ${a.task}${tail ? ` (${tail})` : ''}`
        }),
        ''
      )
    }
    if (s.openQuestions.length) {
      lines.push('Open questions:', ...s.openQuestions.map((q) => `- ${q}`), '')
    }
  }
  lines.push('Reply if I missed or misstated anything.')
  return { subject: `Recap: ${meeting.title} (${date})`, body: lines.join('\n') }
}

/** filesystem-safe filename from a meeting title */
export function exportFilename(meeting: Meeting): string {
  const date = meeting.createdAt.slice(0, 10)
  const slug = meeting.title
    .replace(/[<>:"/\\|?*]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 60)
  return `${date} ${slug}.md`
}
