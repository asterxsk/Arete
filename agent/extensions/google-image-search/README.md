# google-image-search

`google_image_search` tool — searches Google Images via the Custom Search
JSON API and returns structured image metadata with inline thumbnails.

## What the tool does

- Accepts a text `query` and optional `max_results` (1-10, default 5)
- Calls the Google Custom Search API (`searchType=image`)
- Fetches thumbnail images in parallel and returns them as inline
  `image` content blocks alongside structured text (title, URL, source domain)
- Requires a Google API key and Custom Search Engine ID

## Credentials

Set credentials via one of:

1. **Environment variables**: `GOOGLE_SEARCH_API_KEY` + `GOOGLE_CSE_ID`
   (or `GOOGLE_API_KEY` + `GOOGLE_CUSTOM_SEARCH_ENGINE_ID`)
2. **Auth file**: `auth.json` in this extension directory:
   ```json
   { "google_search_api_key": "...", "google_cse_id": "..." }
   ```

Get credentials from https://developers.google.com/custom-search/v1/introduction

## Removal

Delete the `google-image-search/` folder. The `google_image_search` tool
disappears.
