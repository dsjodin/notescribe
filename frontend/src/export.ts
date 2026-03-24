import { Meeting, TranscriptLine, TranscriptEdit } from "./types";

export function exportMeetingMarkdown(
  meeting: Meeting,
  lines: TranscriptLine[],
  edits: Map<number, TranscriptEdit>,
): string {
  const date = new Date(meeting.created_at).toLocaleDateString("sv-SE");
  const parts: string[] = [];

  parts.push(`# ${meeting.title}`);
  parts.push("");
  parts.push(`**Datum:** ${date}`);
  parts.push("");

  parts.push("## Sammanfattning");
  parts.push("");
  parts.push(meeting.summary || "Ingen sammanfattning.");
  parts.push("");

  parts.push("## Transkription");
  parts.push("");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const edit = edits.get(i);
    const text = edit ? edit.edited_text : line.text;
    const marker = edit ? " *(redigerad)*" : "";
    parts.push(`${line.timestamp} **${line.speaker}**: ${text}${marker}`);
  }

  parts.push("");
  return parts.join("\n");
}
