# Video Extract Extension

## Purpose
Extracts content from YouTube videos and local video files. Supports full video analysis via Gemini API, frame extraction at specific timestamps or ranges, and sampling frames across entire videos using ffmpeg and yt-dlp.

## Ownership
- `index.ts` — video extraction logic, Gemini API integration, frame extraction
- YouTube detection and stream URL resolution
- Local video file validation and frame extraction

## Local Contracts
- Registers tool: `video_extract` (url, prompt, timestamp, frames, model)
- Uses `yt-dlp` for YouTube stream URL extraction
- Uses `ffmpeg` for frame extraction (both YouTube and local)
- Uses `ffprobe` for local video duration detection
- Gemini API for full video analysis (requires Google API key)
- `ExtractedContent` interface: url, title, content, error, thumbnail, frames, duration

## Work Guidance
- Frame extraction preferred over Gemini analysis for quick visual checks
- YouTube URLs detected via regex pattern
- Local videos validated by extension (.mp4, .mov, .webm, etc.) and size (50MB max)
- Timestamps support: single (1:23:45), range (23:41-25:00), or seconds (85)
- Gemini files uploaded via Files API and deleted after analysis
- Tool provides `renderShell: "self"` for custom result rendering

## Verification
- Test YouTube: extract frames from a known YouTube video
- Test local video: extract frames from a local .mp4 file
- Test Gemini analysis: provide prompt with a YouTube URL
- Test timestamp ranges: extract frames between two timestamps
- Test frame sampling: extract N frames across full video

## Child DOX Index
None
