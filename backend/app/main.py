import os
import secrets
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Header
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db, get_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.data_dir, exist_ok=True)
    os.makedirs(os.path.join(settings.data_dir, "audio"), exist_ok=True)
    await init_db()
    yield


app = FastAPI(title="NoteScribe", lifespan=lifespan)

AUDIO_MIME_TYPES = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".webm": "audio/webm",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".opus": "audio/opus",
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Auth ---

_tokens: set[str] = set()


def verify_token(authorization: str = Header()):
    token = authorization.removeprefix("Bearer ")
    if token not in _tokens:
        raise HTTPException(status_code=401, detail="Invalid token")


@app.post("/api/auth/login")
async def login(password: str = Form()):
    if password != settings.app_password:
        raise HTTPException(status_code=401, detail="Wrong password")
    token = secrets.token_urlsafe(32)
    _tokens.add(token)
    return {"token": token}


# --- Meetings ---


@app.get("/api/meetings", dependencies=[Depends(verify_token)])
async def list_meetings():
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, title, created_at FROM meetings ORDER BY created_at DESC"
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()


@app.get("/api/meetings/{meeting_id}", dependencies=[Depends(verify_token)])
async def get_meeting(meeting_id: int):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, title, transcript, audio_filename, summary, created_at FROM meetings WHERE id = ?",
            (meeting_id,),
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Meeting not found")
        return dict(row)
    finally:
        await db.close()


@app.put("/api/meetings/{meeting_id}/summary", dependencies=[Depends(verify_token)])
async def update_summary(meeting_id: int, summary: str = Form()):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id FROM meetings WHERE id = ?", (meeting_id,)
        )
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Meeting not found")
        await db.execute(
            "UPDATE meetings SET summary = ? WHERE id = ?", (summary, meeting_id)
        )
        await db.commit()
        return {"ok": True}
    finally:
        await db.close()


@app.post("/api/meetings", dependencies=[Depends(verify_token)])
async def create_meeting(
    title: str = Form(),
    transcript: str = Form(),
    audio: UploadFile = File(),
):
    ext = os.path.splitext(audio.filename or "")[1].lower()
    if ext not in AUDIO_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported audio format")

    db = await get_db()
    try:
        cursor = await db.execute(
            "INSERT INTO meetings (title, transcript, audio_filename) VALUES (?, ?, ?)",
            (title, transcript, audio.filename),
        )
        await db.commit()
        meeting_id = cursor.lastrowid

        # Save audio file with meeting ID prefix to avoid name conflicts
        audio_path = os.path.join(settings.data_dir, "audio", f"{meeting_id}{ext}")
        content = await audio.read()
        with open(audio_path, "wb") as f:
            f.write(content)

        # Update stored filename to the ID-based name
        await db.execute(
            "UPDATE meetings SET audio_filename = ? WHERE id = ?",
            (f"{meeting_id}{ext}", meeting_id),
        )
        await db.commit()

        return {"id": meeting_id}
    finally:
        await db.close()


@app.delete("/api/meetings/{meeting_id}", dependencies=[Depends(verify_token)])
async def delete_meeting(meeting_id: int):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT audio_filename FROM meetings WHERE id = ?", (meeting_id,)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Meeting not found")

        # Delete audio file
        audio_path = os.path.join(settings.data_dir, "audio", row["audio_filename"])
        if os.path.exists(audio_path):
            os.remove(audio_path)

        await db.execute("DELETE FROM meetings WHERE id = ?", (meeting_id,))
        await db.commit()
        return {"ok": True}
    finally:
        await db.close()


@app.get("/api/meetings/{meeting_id}/audio", dependencies=[Depends(verify_token)])
async def get_audio(meeting_id: int):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT audio_filename FROM meetings WHERE id = ?", (meeting_id,)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Meeting not found")

        audio_path = os.path.join(settings.data_dir, "audio", row["audio_filename"])
        if not os.path.exists(audio_path):
            raise HTTPException(status_code=404, detail="Audio file not found")

        ext = os.path.splitext(row["audio_filename"])[1].lower()
        mime = AUDIO_MIME_TYPES.get(ext, "application/octet-stream")
        return FileResponse(audio_path, media_type=mime)
    finally:
        await db.close()


# Serve frontend static files in production
static_dir = "/app/static"
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
