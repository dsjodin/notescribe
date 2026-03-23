import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { getMeeting, getAudioUrl, getToken } from "../api";
import { parseTranscript } from "../transcript";
import { Meeting, TranscriptLine } from "../types";

export default function ViewerPage() {
  const { id } = useParams<{ id: string }>();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [activeLine, setActiveLine] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [speakerFilter, setSpeakerFilter] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Build a map of speaker -> color index
  const speakerMap = useRef(new Map<string, number>());

  function getSpeakerClass(speaker: string): string {
    if (!speakerMap.current.has(speaker)) {
      speakerMap.current.set(speaker, speakerMap.current.size % 6);
    }
    return `speaker-${speakerMap.current.get(speaker)}`;
  }

  // Unique speakers in order of appearance
  const speakers = useMemo(() => {
    const seen = new Set<string>();
    return lines.reduce<string[]>((acc, line) => {
      if (!seen.has(line.speaker)) {
        seen.add(line.speaker);
        acc.push(line.speaker);
      }
      return acc;
    }, []);
  }, [lines]);

  // Filtered line indices (indices into the full `lines` array)
  const visibleIndices = useMemo(() => {
    if (!speakerFilter) return lines.map((_, i) => i);
    return lines
      .map((line, i) => (line.speaker === speakerFilter ? i : -1))
      .filter((i) => i >= 0);
  }, [lines, speakerFilter]);

  useEffect(() => {
    if (!id) return;
    getMeeting(parseInt(id)).then((m: Meeting) => {
      setMeeting(m);
      setLines(parseTranscript(m.transcript));
    });
  }, [id]);

  // Fetch audio as blob with auth header
  useEffect(() => {
    if (!id) return;
    const url = getAudioUrl(parseInt(id));
    fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((res) => res.blob())
      .then((blob) => setAudioSrc(URL.createObjectURL(blob)));

    return () => {
      if (audioSrc) URL.revokeObjectURL(audioSrc);
    };
  }, [id]);

  // Track current line and auto-skip past filtered-out lines
  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || lines.length === 0) return;

    const currentTime = audio.currentTime;

    // Find which line we're currently on (in the full list)
    let current = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (currentTime >= lines[i].seconds) {
        current = i;
        break;
      }
    }

    // If filtering and the current line belongs to a different speaker,
    // skip ahead to the next visible line
    if (speakerFilter && current >= 0 && lines[current].speaker !== speakerFilter) {
      const nextVisible = visibleIndices.find((idx) => idx > current);
      if (nextVisible !== undefined) {
        audio.currentTime = lines[nextVisible].seconds;
        current = nextVisible;
      } else {
        // No more lines for this speaker — pause at end
        audio.pause();
        return;
      }
    }

    if (current !== activeLine) {
      setActiveLine(current);
      if (current >= 0 && lineRefs.current[current]) {
        lineRefs.current[current]!.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }
  }, [lines, activeLine, speakerFilter, visibleIndices]);

  function playFromLine(index: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = lines[index].seconds;
    audio.play();
    setIsPlaying(true);
    setActiveLine(index);
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }

  function toggleSpeakerFilter(speaker: string) {
    setSpeakerFilter((prev) => (prev === speaker ? null : speaker));
  }

  if (!meeting) return null;

  return (
    <>
      <nav className="navbar">
        <Link to="/" className="navbar-brand">NoteScribe</Link>
        <div className="navbar-links">
          <Link to="/">Meetings</Link>
          <Link to="/upload">Upload</Link>
        </div>
      </nav>
      <div className="container">
        <div className="viewer-header">
          <h1>{meeting.title}</h1>
          <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            {new Date(meeting.created_at).toLocaleDateString()}
          </span>
        </div>

        {speakers.length > 1 && (
          <div className="speaker-filter-bar">
            <span className="speaker-filter-label">Filter:</span>
            {speakers.map((speaker) => (
              <button
                key={speaker}
                className={`speaker-chip ${getSpeakerClass(speaker)} ${speakerFilter === speaker ? "speaker-chip-active" : ""}`}
                onClick={() => toggleSpeakerFilter(speaker)}
              >
                {speaker}
              </button>
            ))}
            {speakerFilter && (
              <button
                className="speaker-chip speaker-chip-clear"
                onClick={() => setSpeakerFilter(null)}
              >
                Show all
              </button>
            )}
          </div>
        )}

        <div className="transcript-container">
          {visibleIndices.map((i) => {
            const line = lines[i];
            return (
              <div
                key={i}
                ref={(el) => { lineRefs.current[i] = el; }}
                className={`transcript-line ${i === activeLine ? "active" : ""}`}
                onClick={() => playFromLine(i)}
              >
                <button
                  className="btn-icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    playFromLine(i);
                  }}
                  title={`Play from ${line.timestamp}`}
                >
                  &#9654;
                </button>
                <span className="transcript-timestamp">{line.timestamp}</span>
                <span className={`transcript-speaker ${getSpeakerClass(line.speaker)}`}>
                  {line.speaker}
                </span>
                <span className="transcript-text">{line.text}</span>
              </div>
            );
          })}
        </div>

        <div className="audio-spacer" />
      </div>

      <div className="audio-bar">
        <button className="btn-icon" onClick={togglePlay}>
          {isPlaying ? "\u23F8" : "\u25B6"}
        </button>
        {audioSrc && (
          <audio
            ref={audioRef}
            src={audioSrc}
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            controls
          />
        )}
      </div>
    </>
  );
}
