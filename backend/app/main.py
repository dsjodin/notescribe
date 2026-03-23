import os
import secrets
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Header, Request
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.database import init_db, get_db


# --- Password hash (computed once at startup) ---
_password_hash: bytes = b""


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _password_hash
    os.makedirs(settings.data_dir, exist_ok=True)
    os.makedirs(os.path.join(settings.data_dir, "audio"), exist_ok=True)
    await init_db()

    # Hash the configured password at startup
    _password_hash = bcrypt.hashpw(settings.app_password.encode(), bcrypt.gensalt())

    # Clean up expired sessions
    db = await get_db()
    try:
        await db.execute(
            "DELETE FROM sessions WHERE expires_at < ?",
            (datetime.now(timezone.utc).isoformat(),),
        )
        await db.commit()
    finally:
        await db.close()

    yield


app = FastAPI(title="NoteScribe", lifespan=lifespan, docs_url=None, redoc_url=None)

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


# --- CORS (restricted) ---
if settings.cors_origins:
    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )


# --- Security headers middleware ---
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


app.add_middleware(SecurityHeadersMiddleware)


# --- Rate limiting (login) ---
_login_attempts: dict[str, tuple[int, float]] = {}
MAX_LOGIN_ATTEMPTS = 5
LOGIN_WINDOW_SECONDS = 15 * 60  # 15 minutes


def _check_rate_limit(client_ip: str):
    now = time.time()
    if client_ip in _login_attempts:
        count, window_start = _login_attempts[client_ip]
        if now - window_start > LOGIN_WINDOW_SECONDS:
            # Window expired, reset
            del _login_attempts[client_ip]
        elif count >= MAX_LOGIN_ATTEMPTS:
            raise HTTPException(
                status_code=429,
                detail="Too many login attempts. Try again later.",
            )


def _record_failed_attempt(client_ip: str):
    now = time.time()
    if client_ip in _login_attempts:
        count, window_start = _login_attempts[client_ip]
        if now - window_start > LOGIN_WINDOW_SECONDS:
            _login_attempts[client_ip] = (1, now)
        else:
            _login_attempts[client_ip] = (count + 1, window_start)
    else:
        _login_attempts[client_ip] = (1, now)


def _clear_attempts(client_ip: str):
    _login_attempts.pop(client_ip, None)


# --- Auth ---

async def verify_token(authorization: str = Header()):
    token = authorization.removeprefix("Bearer ")
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT token FROM sessions WHERE token = ? AND expires_at > ?",
            (token, datetime.now(timezone.utc).isoformat()),
        )
        row = await cursor.fetchone()
        if not row:
            # Clean up expired token if it exists
            await db.execute("DELETE FROM sessions WHERE token = ?", (token,))
            await db.commit()
            raise HTTPException(status_code=401, detail="Invalid or expired token")
    finally:
        await db.close()


@app.post("/api/auth/login")
async def login(request: Request, password: str = Form()):
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)

    if not bcrypt.checkpw(password.encode(), _password_hash):
        _record_failed_attempt(client_ip)
        raise HTTPException(status_code=401, detail="Wrong password")

    _clear_attempts(client_ip)

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.session_ttl_hours)

    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO sessions (token, expires_at) VALUES (?, ?)",
            (token, expires_at.isoformat()),
        )
        await db.commit()
    finally:
        await db.close()

    return {"token": token}


@app.delete("/api/auth/logout", dependencies=[Depends(verify_token)])
async def logout(authorization: str = Header()):
    token = authorization.removeprefix("Bearer ")
    db = await get_db()
    try:
        await db.execute("DELETE FROM sessions WHERE token = ?", (token,))
        await db.commit()
    finally:
        await db.close()
    return {"ok": True}


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
