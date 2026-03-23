import { useEffect, useRef, useState, useCallback } from "react";
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

  // Track current line based on audio time
  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || lines.length === 0) return;

    const currentTime = audio.currentTime;
    let current = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (currentTime >= lines[i].seconds) {
        current = i;
        break;
      }
    }

    if (current !== activeLine) {
      setActiveLine(current);
      // Scroll active line into view
      if (current >= 0 && lineRefs.current[current]) {
        lineRefs.current[current]!.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }
  }, [lines, activeLine]);

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

        <div className="transcript-container">
          {lines.map((line, i) => (
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
          ))}
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
