# NoteScribe

A containerized app for uploading meeting audio recordings with their transcriptions, then playing back audio synced to the transcript.

## Features

- Upload meeting audio (WAV, MP3, etc.) together with a Gemini-generated transcript
- Browse all uploaded meetings
- View transcripts with speaker labels and timestamps
- Click any transcript line to play audio from that point
- Audio player highlights the current line as it plays
- Basic password protection

## Transcript Format

NoteScribe expects Gemini's transcript format:

```
[00:00] **Sarah**: Hello everyone, welcome to the meeting.
[00:05] **John**: Thanks Sarah. Let's get started.
```

## Quick Start

```bash
docker compose up -d --build
```

Then open [http://localhost:8080](http://localhost:8080). Default password: `changeme`.

## Configuration

Set via environment variables in `docker-compose.yml`:

| Variable | Default | Description |
|---|---|---|
| `NOTESCRIBE_APP_PASSWORD` | `changeme` | Login password |
| `NOTESCRIBE_MAX_UPLOAD_SIZE_MB` | `500` | Max audio file size |

## Development

**Backend:**

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` requests to `localhost:8000`.
