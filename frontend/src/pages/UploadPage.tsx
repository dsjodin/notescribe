import { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createMeeting } from "../api";

export default function UploadPage() {
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [audio, setAudio] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!audio) {
      setError("Please select an audio file");
      return;
    }
    if (!title.trim()) {
      setError("Please enter a title");
      return;
    }
    if (!transcript.trim()) {
      setError("Please paste the transcript");
      return;
    }

    setUploading(true);
    setError("");
    try {
      const result = await createMeeting(title, transcript, audio);
      navigate(`/meeting/${result.id}`);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <nav className="navbar">
        <Link to="/" className="navbar-brand">NoteScribe</Link>
        <div className="navbar-links">
          <Link to="/">Meetings</Link>
        </div>
      </nav>
      <div className="container">
        <h1>Upload Meeting</h1>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Title</label>
            <input
              type="text"
              placeholder="e.g. Sprint Planning - March 23"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Audio Recording</label>
            <div className="file-input-wrapper">
              <input
                type="file"
                accept=".wav,.mp3,.ogg,.m4a,.webm,.aac,.flac,.opus"
                onChange={(e) => setAudio(e.target.files?.[0] || null)}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Transcript (paste Gemini output)</label>
            <textarea
              placeholder={"[00:00] **Speaker**: Hello everyone..."}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
            />
          </div>

          {error && <div className="error-msg" style={{ marginBottom: "1rem" }}>{error}</div>}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={uploading}
          >
            {uploading ? "Uploading..." : "Upload Meeting"}
          </button>
        </form>
      </div>
    </>
  );
}
