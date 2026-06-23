# video-extract

`video_extract` tool — extracts content from YouTube videos and local
video files. Supports full video analysis via the Gemini API, frame
extraction at specific timestamps or ranges, and sampling frames across
an entire video.

## What the tool does

- **YouTube videos**: Extracts frames via yt-dlp + ffmpeg, and/or
  analyzes the full video content via the Gemini API
- **Local video files**: Supports `.mp4`, `.mov`, `.webm`, `.avi`,
  `.mpeg`, `.mpg`, `.wmv`, `.flv`, `.3gp`, `.3gpp` — up to 50MB
- **Frame extraction**: At a specific timestamp, a range (evenly-spaced
  frames), or across the full video
- **Gemini analysis**: Pass a specific `prompt` for deep content
  understanding (transcription, descriptions, etc.)

## Requirements

- **YouTube**: `yt-dlp` (`brew install yt-dlp` or `pip install yt-dlp`)
  and `ffmpeg` (`brew install ffmpeg` or `apt install ffmpeg`)
- **Local video analysis**: A Google API key configured via `/login`
  or the `GEMINI_API_KEY` / `GOOGLE_API_KEY` environment variable
- **Frame extraction only** (no Gemini): `ffmpeg` is sufficient

## Parameters

| Parameter | Description |
|-----------|-------------|
| `url` | YouTube URL or local file path (required) |
| `prompt` | Question for Gemini analysis (omit for frame-only) |
| `timestamp` | Single time (`1:23:45`) or range (`23:41-25:00`) |
| `frames` | Number of frames to extract (1-12, default 6) |
| `model` | Override Gemini model (default: gemini-3-flash-preview) |

## Workflow

Prefer **frame extraction** (timestamp and/or frames params) over
Gemini analysis for quick visual checks — it's fast and doesn't
require API calls. Use the `prompt` param only when you need deep
analysis like full transcription.

## Removal

Delete the `video-extract/` folder. The `video_extract` tool disappears.
