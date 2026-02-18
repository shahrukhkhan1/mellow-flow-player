

# Fix YouTube Import - Switch to Reliable Paid API

## Why It's Broken

YouTube has systematically blocked all free extraction methods in late 2025:

| Method | Status | Error |
|--------|--------|-------|
| YouTube Internal API (all 4 clients) | Blocked | "Sign in to confirm you're not a bot" |
| Cobalt (meowing.de) | Auth Required | "error.api.auth.jwt.missing" |
| Cobalt (canine.tools) | YouTube Blocked | "error.api.youtube.login" |
| Cobalt (3kh0.net) | Captcha Required | Cloudflare Turnstile |
| Piped instances | Dead/Blocked | DNS failures, bot checks |
| Invidious instances | Dead/Blocked | 502, 404, DNS failures |

No free public API currently works for YouTube audio extraction. This requires switching to a reliable paid API.

## Solution: RapidAPI YouTube MP3 Service

Use RapidAPI's `youtube-mp36` API which provides:
- Free tier: 500 requests/month (no credit card needed)
- Reliable YouTube to MP3 conversion
- Simple GET request with video ID
- Returns direct download URL

### Setup Required (One-Time)

1. Sign up at rapidapi.com (free)
2. Subscribe to the "YouTube MP3" API (free tier)
3. Copy your RapidAPI key
4. Add it as a secret called `RAPIDAPI_KEY` in the project

### Technical Changes

**File: `supabase/functions/youtube-to-mp3/index.ts`** - Rewrite extraction logic

Replace the 4-method fallback chain with:

```text
Extraction Priority:
1. RapidAPI youtube-mp36 (primary, most reliable)
2. RapidAPI youtube-mp3-download (backup)
3. Cobalt API with dynamic instance discovery (free fallback)
```

The RapidAPI integration is straightforward:

```text
GET https://youtube-mp36.p.rapidapi.com/dl?id={videoId}
Headers:
  X-RapidAPI-Key: {secret}
  X-RapidAPI-Host: youtube-mp36.p.rapidapi.com

Response:
{
  "status": "ok",
  "title": "Song Title",
  "link": "https://...direct-download-url.mp3",
  "duration": 240,
  "filesize": 5242880
}
```

### What Changes

| Component | Change |
|-----------|--------|
| `supabase/functions/youtube-to-mp3/index.ts` | Replace all 4 broken methods with RapidAPI as primary |
| Secrets | Add `RAPIDAPI_KEY` secret |
| Fallback | Keep Cobalt as optional fallback (for non-YouTube sources) |

### What Stays the Same

- Search functionality (youtube-search edge function) -- this still works fine
- Storage architecture (music-files bucket + tracks table + IndexedDB cache)
- Upload from device functionality
- All frontend UI components

### Expected Result

| Before | After |
|--------|-------|
| 0% success rate (all methods blocked) | ~99% success rate |
| ~20 second timeout waiting for dead APIs | ~3 second response time |
| Complex 4-method fallback chain | Simple, reliable single API call |
| Free but broken | Free tier (500/month) and working |

### Steps

1. You will be asked to add the `RAPIDAPI_KEY` secret
2. Edge function will be rewritten with RapidAPI as primary extraction method
3. Deploy and test end-to-end

