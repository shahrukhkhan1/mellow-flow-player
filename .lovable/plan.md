

# YouTube to MP3 Download Feature

## Overview

Add a feature that allows logged-in users to paste a YouTube link and automatically:
1. Extract audio from the YouTube video
2. Download and save it to cloud storage
3. Cache it locally in IndexedDB for offline playback

---

## Architecture

```
User pastes YouTube URL
        |
        v
  Frontend validates URL & shows dialog
        |
        v
  Edge Function (youtube-to-mp3)
        |
        +---> Uses @distube/ytdl-core to extract audio
        |
        +---> Streams audio to Supabase Storage
        |
        +---> Creates track metadata in database
        |
        v
  Returns track info to frontend
        |
        v
  Frontend downloads & caches to IndexedDB
        |
        v
  Track appears in playlist
```

---

## Implementation Details

### 1. Edge Function: `youtube-to-mp3`

Create a new edge function that:
- Accepts a YouTube URL
- Validates the URL format
- Uses `@distube/ytdl-core` (Deno-compatible) to extract audio stream
- Uploads the audio to Supabase Storage
- Creates track metadata in the database
- Returns the track info to the client

**Key code pattern:**
```typescript
import ytdl from "npm:@distube/ytdl-core@^4.15.8";

// Extract audio stream
const info = await ytdl.getInfo(videoId);
const audioStream = ytdl(videoId, { 
  quality: "highestaudio", 
  filter: "audioonly" 
});

// Convert stream to buffer
const chunks: Uint8Array[] = [];
for await (const chunk of audioStream) {
  chunks.push(chunk);
}

// Upload to storage
await supabase.storage
  .from('music-files')
  .upload(filePath, audioBuffer, { contentType: 'audio/mpeg' });
```

### 2. New UI Component: `YouTubeImport`

A dialog component with:
- Input field for YouTube URL
- Paste button for mobile convenience
- Progress indicator during conversion
- Error handling for invalid URLs or failed conversions

### 3. Frontend Integration

- Add "Import from YouTube" button in header (visible when logged in)
- New function in `syncService.ts` to call the edge function
- After successful import, download and cache the track locally
- Add to playlist and sync

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/youtube-to-mp3/index.ts` | Create | Edge function for YouTube audio extraction |
| `src/components/YouTubeImport.tsx` | Create | Dialog for pasting YouTube links |
| `src/lib/syncService.ts` | Modify | Add `importFromYouTube` function |
| `src/components/MusicPlayer.tsx` | Modify | Add YouTube import button and integrate dialog |

---

## Technical Considerations

### Why Edge Function?
- YouTube extraction cannot be done client-side due to CORS restrictions
- Edge functions can run Node/Deno packages like ytdl-core
- Keeps API logic server-side for security

### Library Choice: `@distube/ytdl-core`
- Actively maintained fork of ytdl-core
- Works in Deno environment (as shown in Supabase discussions)
- Supports audio-only extraction
- No API key required

### Rate Limiting Considerations
- YouTube may rate limit or block excessive requests
- Consider adding a cooldown between imports
- Display clear error messages if YouTube blocks

### Storage
- Audio files stored in existing `music-files` bucket
- Same RLS policies apply (user can only access their own files)
- Track metadata stored in `tracks` table

---

## User Flow

1. User clicks "Import YouTube" button in header
2. Dialog opens with URL input field
3. User pastes YouTube link (e.g., `https://youtube.com/watch?v=xyz123`)
4. System validates URL format
5. User clicks "Import" button
6. Progress shows: "Extracting audio from YouTube..."
7. Edge function:
   - Fetches video info (title, duration)
   - Extracts audio stream
   - Uploads to cloud storage
   - Saves metadata to database
8. Frontend:
   - Downloads the audio file
   - Caches in IndexedDB
   - Adds to playlist
9. Success toast: "Imported: [Song Title]"

---

## Error Handling

| Scenario | User Message |
|----------|--------------|
| Invalid YouTube URL | "Please enter a valid YouTube URL" |
| Video not found | "Video not found or unavailable" |
| Age-restricted video | "Cannot download age-restricted videos" |
| Network error | "Failed to connect. Please try again" |
| Edge function timeout | "Download took too long. Try a shorter video" |

---

## Security

- Only authenticated users can use this feature
- User ID is verified in the edge function
- RLS policies ensure users only see their own tracks
- No external API keys required (ytdl-core works directly)

