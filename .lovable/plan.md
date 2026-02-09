
# YouTube Import — Fixed

## What Changed

### Edge Function (`youtube-to-mp3`) — Complete Rewrite
Added 4-method fallback chain for audio extraction:

1. **Cobalt API** (primary, most reliable) — tries multiple instances
2. **YouTube Internal API** — updated to `ANDROID_MUSIC` client v7.27.52
3. **Piped API** — refreshed to working instances (adminforge.de, piped.yt, etc.)
4. **Invidious API** — refreshed to working instances (io.lol, oelrichsgarcia.de, etc.)

### Config
- Added `youtube-search` to `config.toml` with `verify_jwt = false`

## Storage Architecture

| Layer | What | Where |
|-------|------|-------|
| Cloud Storage | Audio files (.mp3) | `music-files` bucket |
| Cloud Database | Track metadata | `tracks` table |
| Local Cache | Audio blobs | Browser IndexedDB |

### Three Ways to Add Music

| Method | How | Status |
|--------|-----|--------|
| **Upload** | Select MP3 from device | ✅ Working |
| **Search** | Search & click Add | ✅ Fixed |
| **YouTube** | Paste YouTube link | ✅ Fixed |
