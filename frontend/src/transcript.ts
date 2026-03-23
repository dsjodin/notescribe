import { TranscriptLine } from "./types";

/**
 * Parse transcript formats:
 * [MM:SS] **Speaker**: Text here   (markdown bold)
 * [MM:SS] Speaker: Text here        (plain)
 * Also handles entries concatenated on a single line.
 */
export function parseTranscript(raw: string): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  const regex = /^\[(\d{1,2}:\d{2})\]\s+(?:\*\*)?(.+?)(?:\*\*)?:\s*(.+)$/;

  // Insert newlines before each [MM:SS] so concatenated entries are split
  const normalized = raw.replace(/(?<!\n)\[(\d{1,2}:\d{2})\]/g, "\n[$1]");

  for (const line of normalized.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(regex);
    if (match) {
      const [, timestamp, speaker, text] = match;
      const parts = timestamp.split(":");
      const seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      lines.push({ timestamp, seconds, speaker: speaker.trim(), text });
    }
  }

  return lines;
}
