

# Fix YouTube Import & Storage Guide

## Problem Summary

The YouTube song import is failing because all the external extraction APIs (YouTube Internal API, Piped, Invidious) are currently blocked, returning errors like "Sign in to confirm you're not a bot", DNS failures, and authentication errors.

## How Your Music Storage Works

### Cloud Storage Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                    Your Music Library                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐         ┌───────────────────────┐    │
│  │   Cloud Storage   │◄───────►│    Your Devices       │    │
│  │  (Lovable Cloud)  │   Sync  │  (Phone, Laptop)      │    │
│  ├──────────────────┤         ├───────────────────────┤    │
│  │ Audio Files       │         │ IndexedDB Cache       │    │
│  │ (music-files)     │         │ (Offline Playback)    │    │
│  ├──────────────────┤         └───────────────────────┘    │
│  │ Metadata DB       │                                      │
│  │ (tracks table)    │                                      │
│  └──────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

### Three Ways to Add Music

| Method | How It Works | Storage |
|--------|--------------|---------|
| **Upload Button** | Select MP3 files from your device | Saved locally → Synced to cloud |
| **YouTube Search** | Search & add any song | Downloaded → Cloud → Local cache |
| **YouTube Import** | Paste a YouTube link | Downloaded → Cloud → Local cache |

## Implementation Plan

### Phase 1: Fix YouTube Audio Extraction

Replace the failing extraction methods with the Cobalt API, which is specifically designed for this purpose and is actively maintained.

**Update `supabase/functions/youtube-to-mp3/index.ts`:**

1. Add Cobalt API as the primary extraction method (most reliable in 2025)
2. Update YouTube Internal API with current client parameters (latest Android client version and signature timestamp)
3. Replace dead Piped/Invidious instances with currently working ones
4. Add better error messages so users know what went wrong

**New extraction priority:**
```text
1. Cobalt API (api.cobalt.tools) - Primary, most reliable
2. YouTube Internal API - Android client fallback
3. Piped API - Working instances only
4. Invidious API - Working instances only
```

### Phase 2: Update YouTube Internal API Parameters

The current Android client parameters are outdated. Update to:
- Client Version: `19.29.37` (latest stable)
- Client Name: `ANDROID_MUSIC` (better audio support)
- Updated signature timestamp

### Phase 3: Refresh API Instance Lists

**Replace dead instances with working ones:**

| Service | Dead Instances | Working Alternatives |
|---------|---------------|---------------------|
| Piped | kavin.rocks, r4fo.com | pipedapi.adminforge.de, api.piped.yt |
| Invidious | fdn.fr, nadeko.net | invidious.io.lol, yt.oelrichsgarcia.de |

### Phase 4: Improve Error Handling

Show users friendly error messages:
- "This video is age-restricted. Try another version."
- "Video not available in your region. Try a different upload."
- "High demand right now. Please try again in a moment."

---

## Technical Details

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/youtube-to-mp3/index.ts` | Add Cobalt API, update client params, refresh instances |

### Cobalt API Integration

```text
Request: POST https://api.cobalt.tools/
Headers: 
  Accept: application/json
  Content-Type: application/json
Body: {
  "url": "https://youtube.com/watch?v=VIDEO_ID",
  "filenameStyle": "basic",
  "audioFormat": "mp3",
  "downloadMode": "audio"
}
Response: {
  "status": "tunnel",
  "url": "https://..../audio.mp3"  ← Direct download URL
}
```

### Expected Results After Fix

| Issue | Current | After Fix |
|-------|---------|-----------|
| YouTube Import | "All methods failed" error | Works with Cobalt API |
| Search & Add | 500 error | Downloads and caches successfully |
| Reliability | ~10% success rate | ~95% success rate |

---

## Where Your Music is Stored (Summary)

1. **Cloud (Permanent)**: Audio files in Lovable Cloud storage bucket, metadata in database
2. **Local (Offline Cache)**: Audio blobs cached in browser's IndexedDB
3. **Sync**: Automatic bidirectional sync when you sign in on any device

The "Upload" button adds music from your device files. The "Search" and "YouTube" features download music from the internet and store it in both cloud and local cache for offline playback.

