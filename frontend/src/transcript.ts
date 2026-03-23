import { TranscriptLine } from "./types";

/**
 * Parse Gemini transcript format:
 * [MM:SS] **Speaker**: Text here
 */
export function parseTranscript(raw: string): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  const regex = /^\[(\d{1,2}:\d{2})\]\s+\*\*(.+?)\*\*:\s*(.+)$/;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(regex);
    if (match) {
      const [, timestamp, speaker, text] = match;
      const parts = timestamp.split(":");
      const seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      lines.push({ timestamp, seconds, speaker, text });
    }
  }

  return lines;
}
