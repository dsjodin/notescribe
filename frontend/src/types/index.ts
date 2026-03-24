export interface MeetingSummary {
  id: number;
  title: string;
  created_at: string;
}

export interface Meeting {
  id: number;
  title: string;
  transcript: string;
  audio_filename: string;
  summary: string;
  created_at: string;
}

export interface TranscriptLine {
  timestamp: string;
  seconds: number;
  speaker: string;
  text: string;
}

export interface TranscriptEdit {
  line_index: number;
  original_text: string;
  edited_text: string;
  edited_at: string;
}
