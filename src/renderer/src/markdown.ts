import type { Meeting } from '../../shared/types'
import { formatDuration, formatWhen } from './ui'

export function summaryToMarkdown(meeting: Meeting): string {
  const s = meeting.summary
  const lines: string[] = [`# ${meeting.title}`, '', `${formatWhen(meeting.createdAt)} · ${formatDuration(meeting.durationMs)} · ${meeting.mode === 'virtual' ? 'virtual' : 'in person'}`, '']
  if (s) {
    lines.push('## TL;DR', '', s.tldr, '')
    for (const topic of s.topics ?? []) {
      lines.push(`## ${topic.heading}`, '', ...topic.notes.map((n) => `- ${n}`), '')
    }
    if (!s.topics && s.keyPoints?.length) {
      lines.push('## Key points', '', ...s.keyPoints.map((p) => `- ${p}`), '')
    }
    if (s.decisions.length) {
      lines.push('## Decisions', '', ...s.decisions.map((d) => `- ${d}`), '')
    }
    if (s.actionItems.length) {
      lines.push(
        '## Action items',
        '',
        ...s.actionItems.map((a) => {
          const who = a.owner ? ` (${a.owner}${a.due ? `, due ${a.due}` : ''})` : a.due ? ` (due ${a.due})` : ''
          return `- [ ] ${a.task}${who}`
        }),
        ''
      )
    }
    if (s.openQuestions.length) {
      lines.push('## Open questions', '', ...s.openQuestions.map((q) => `- ${q}`), '')
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
