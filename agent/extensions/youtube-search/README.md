# youtube-search

`youtube_search` tool — searches YouTube for videos using yt-dlp and
returns structured metadata (title, URL, duration, view count, channel,
upload date, thumbnail).

## What the tool does

- Searches YouTube via `yt-dlp ytsearchN:query`
- Returns clean structured results: title, URL, duration, views, channel,
  upload date, and thumbnail URL
- Supports optional filters:
  - `min_duration` / `max_duration` — filter by video length (seconds)
  - `upload_date` — recency filter: `day`, `week`, `month`, `year`
- Supports `max_results` (1-20, default 5)
- Streams progress updates so the user sees activity

## Requirements

- `yt-dlp` must be installed and in PATH:
  - `brew install yt-dlp` (macOS)
  - `pip install yt-dlp` (Python/pip)

## Integration with video-extract

Results from `youtube_search` can be passed to `video_extract` for
frame extraction or full content analysis:

1. Search for videos → get URLs
2. Pass URL to `video_extract` for frame extraction or Gemini analysis

## Removal

Delete the `youtube-search/` folder. The `youtube_search` tool disappears.
