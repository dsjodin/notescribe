import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMeetings, deleteMeeting, clearToken } from "../api";
import { MeetingSummary } from "../types";

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);

  useEffect(() => {
    getMeetings().then(setMeetings);
  }, []);

  async function handleDelete(e: React.MouseEvent, id: number) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this meeting?")) return;
    await deleteMeeting(id);
    setMeetings((prev) => prev.filter((m) => m.id !== id));
  }

  function handleLogout() {
    clearToken();
    window.location.reload();
  }

  return (
    <>
      <nav className="navbar">
        <Link to="/" className="navbar-brand">NoteScribe</Link>
        <div className="navbar-links">
          <Link to="/upload">Upload</Link>
          <button onClick={handleLogout}>Log out</button>
        </div>
      </nav>
      <div className="container">
        <h1>Meetings</h1>
        {meetings.length === 0 ? (
          <div className="empty-state">
            <p>No meetings yet</p>
            <Link to="/upload" className="btn btn-primary">
              Upload your first meeting
            </Link>
          </div>
        ) : (
          <div className="meeting-list">
            {meetings.map((m) => (
              <Link to={`/meeting/${m.id}`} className="meeting-card" key={m.id}>
                <div className="meeting-card-info">
                  <h3>{m.title}</h3>
                  <span>{new Date(m.created_at).toLocaleDateString()}</span>
                </div>
                <div className="meeting-card-actions">
                  <button
                    className="btn btn-danger"
                    onClick={(e) => handleDelete(e, m.id)}
                    style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}
                  >
                    Delete
                  </button>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
