import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { getMeeting, getAudioUrl, getToken, updateSummary, getTranscriptEdits, saveTranscriptEdit, deleteTranscriptEdit } from "../api";
import { parseTranscript } from "../transcript";
import { exportMeetingMarkdown } from "../export";
import { Meeting, TranscriptLine, TranscriptEdit } from "../types";

export default function ViewerPage() {
  const { id } = useParams<{ id: string }>();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [activeLine, setActiveLine] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [speakerFilter, setSpeakerFilter] = useState<string | null>(null);
  const [summaryText, setSummaryText] = useState("");
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [savingSummary, setSavingSummary] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Transcript editing state
  const [edits, setEdits] = useState<Map<number, TranscriptEdit>>(new Map());
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [showDiffForLine, setShowDiffForLine] = useState<number | null>(null);

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
    const meetingId = parseInt(id);
    getMeeting(meetingId).then((m: Meeting) => {
      setMeeting(m);
      setLines(parseTranscript(m.transcript));
      setSummaryText(m.summary || "");
    });
    getTranscriptEdits(meetingId).then((editsArray: TranscriptEdit[]) => {
      const map = new Map<number, TranscriptEdit>();
      for (const edit of editsArray) {
        map.set(edit.line_index, edit);
      }
      setEdits(map);
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

  function toggleLinePlayback(index: number) {
    const audio = audioRef.current;
    if (!audio) return;

    if (index === activeLine && isPlaying) {
      // Clicking the active playing line → pause
      audio.pause();
      setIsPlaying(false);
    } else if (index === activeLine && !isPlaying) {
      // Clicking the active paused line → resume
      audio.play();
      setIsPlaying(true);
    } else {
      // Different line → seek and play
      audio.currentTime = lines[index].seconds;
      audio.play();
      setIsPlaying(true);
      setActiveLine(index);
    }
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

  // Global spacebar → toggle play/pause
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        togglePlay();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  async function saveSummary() {
    if (!meeting) return;
    setSavingSummary(true);
    try {
      await updateSummary(meeting.id, summaryText);
      setIsEditingSummary(false);
    } catch {
      // stay in edit mode on error
    } finally {
      setSavingSummary(false);
    }
  }

  function toggleSpeakerFilter(speaker: string) {
    setSpeakerFilter((prev) => (prev === speaker ? null : speaker));
  }

  // --- Transcript editing ---

  function startEditing(lineIndex: number) {
    const edit = edits.get(lineIndex);
    const currentText = edit ? edit.edited_text : lines[lineIndex].text;
    setEditingLineIndex(lineIndex);
    setEditingText(currentText);
    setShowDiffForLine(null);
  }

  function cancelEditing() {
    setEditingLineIndex(null);
    setEditingText("");
  }

  async function saveEdit(lineIndex: number) {
    if (!meeting) return;
    const originalText = lines[lineIndex].text;
    const trimmed = editingText.trim();
    if (trimmed === originalText) {
      // If reverted to original, delete the edit instead
      if (edits.has(lineIndex)) {
        await revertEdit(lineIndex);
      } else {
        cancelEditing();
      }
      return;
    }
    setSavingEdit(true);
    try {
      await saveTranscriptEdit(meeting.id, lineIndex, originalText, trimmed);
      setEdits((prev) => {
        const next = new Map(prev);
        next.set(lineIndex, {
          line_index: lineIndex,
          original_text: originalText,
          edited_text: trimmed,
          edited_at: new Date().toISOString(),
        });
        return next;
      });
      setEditingLineIndex(null);
      setEditingText("");
    } catch {
      // stay in edit mode on error
    } finally {
      setSavingEdit(false);
    }
  }

  async function revertEdit(lineIndex: number) {
    if (!meeting) return;
    try {
      await deleteTranscriptEdit(meeting.id, lineIndex);
      setEdits((prev) => {
        const next = new Map(prev);
        next.delete(lineIndex);
        return next;
      });
      setShowDiffForLine(null);
    } catch {
      // ignore
    }
  }

  function handleEditKeyDown(e: React.KeyboardEvent, lineIndex: number) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit(lineIndex);
    } else if (e.key === "Escape") {
      cancelEditing();
    }
  }

  // --- Export ---

  function handleExport() {
    if (!meeting) return;
    const md = exportMeetingMarkdown(meeting, lines, edits);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date(meeting.created_at).toISOString().slice(0, 10);
    const safeTitle = meeting.title.replace(/[^a-zA-Z0-9åäöÅÄÖ _-]/g, "_");
    a.href = url;
    a.download = `${safeTitle}-${dateStr}.md`;
    a.click();
    URL.revokeObjectURL(url);
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
          <div className="viewer-header-meta">
            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              {new Date(meeting.created_at).toLocaleDateString()}
            </span>
            <button className="btn btn-small" onClick={handleExport}>
              Exportera
            </button>
          </div>
        </div>

        <div className="summary-section">
          <div className="summary-header">
            <h2>Sammanfattning</h2>
            {!isEditingSummary && (
              <button
                className="btn btn-small"
                onClick={() => setIsEditingSummary(true)}
              >
                {summaryText ? "Redigera" : "Lägg till"}
              </button>
            )}
          </div>
          {isEditingSummary ? (
            <div className="summary-edit">
              <textarea
                className="summary-textarea"
                value={summaryText}
                onChange={(e) => setSummaryText(e.target.value)}
                placeholder="Skriv en kort sammanfattning av mötet..."
                rows={4}
                autoFocus
              />
              <div className="summary-actions">
                <button
                  className="btn btn-primary btn-small"
                  onClick={saveSummary}
                  disabled={savingSummary}
                >
                  {savingSummary ? "Sparar..." : "Spara"}
                </button>
                <button
                  className="btn btn-small"
                  onClick={() => {
                    setSummaryText(meeting?.summary || "");
                    setIsEditingSummary(false);
                  }}
                >
                  Avbryt
                </button>
              </div>
            </div>
          ) : summaryText ? (
            <p className="summary-text">{summaryText}</p>
          ) : (
            <p className="summary-empty">Ingen sammanfattning ännu.</p>
          )}
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
            const edit = edits.get(i);
            const displayText = edit ? edit.edited_text : line.text;
            const isEditing = editingLineIndex === i;

            return (
              <div key={i}>
                <div
                  ref={(el) => { lineRefs.current[i] = el; }}
                  className={`transcript-line ${i === activeLine ? "active" : ""} ${edit ? "transcript-line-edited" : ""}`}
                  onClick={() => { if (!isEditing) toggleLinePlayback(i); }}
                >
                  <button
                    className="btn-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLinePlayback(i);
                    }}
                    title={isPlaying && i === activeLine ? "Pause" : `Play from ${line.timestamp}`}
                  >
                    {isPlaying && i === activeLine ? "\u23F8" : "\u25B6"}
                  </button>
                  <span className="transcript-timestamp">{line.timestamp}</span>
                  <span className={`transcript-speaker ${getSpeakerClass(line.speaker)}`}>
                    {line.speaker}
                  </span>

                  {isEditing ? (
                    <span className="transcript-edit-inline" onClick={(e) => e.stopPropagation()}>
                      <input
                        className="transcript-edit-input"
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => handleEditKeyDown(e, i)}
                        autoFocus
                        disabled={savingEdit}
                      />
                      <button
                        className="btn btn-primary btn-small"
                        onClick={() => saveEdit(i)}
                        disabled={savingEdit}
                      >
                        {savingEdit ? "..." : "Spara"}
                      </button>
                      <button
                        className="btn btn-small"
                        onClick={cancelEditing}
                        disabled={savingEdit}
                      >
                        Avbryt
                      </button>
                    </span>
                  ) : (
                    <>
                      <span className="transcript-text">{displayText}</span>
                      {edit && (
                        <button
                          className="transcript-edited-badge"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDiffForLine(showDiffForLine === i ? null : i);
                          }}
                          title="Visa ändringar"
                        >
                          (redigerad)
                        </button>
                      )}
                      <button
                        className="transcript-edit-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(i);
                        }}
                        title="Redigera"
                      >
                        &#9998;
                      </button>
                    </>
                  )}
                </div>

                {showDiffForLine === i && edit && (
                  <div className="transcript-diff">
                    <div className="transcript-diff-original">
                      <span className="transcript-diff-label">Original:</span> {edit.original_text}
                    </div>
                    <div className="transcript-diff-edited">
                      <span className="transcript-diff-label">Redigerad:</span> {edit.edited_text}
                    </div>
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => revertEdit(i)}
                    >
                      Återställ original
                    </button>
                  </div>
                )}
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
