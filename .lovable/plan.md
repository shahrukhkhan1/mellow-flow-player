

# Stream Music + UI/UX Improvements

## Problem Summary

1. **Recommendations suggest 2-hour videos** — need duration filtering
2. **All music downloads before playing** — wastes bandwidth and storage; should stream first, download only on explicit "Save Offline"
3. **Add buttons not visible on mobile** in search/discover results
4. **iOS uses fallback animated visualizer** instead of the real audiomotion visualizer

## Plan

### 1. Add YouTube Streaming Playback (Stream-First Architecture)

**Current flow**: Search → Download MP3 → Upload to storage → Cache in IndexedDB → Play  
**New flow**: Search → Get audio URL → Stream directly → (optional) Save for offline

Changes:
- **New edge function `youtube-stream`**: Takes a videoId, calls RapidAPI to get the temporary audio download URL, returns it directly to the client WITHOUT downloading/uploading. Lightweight and fast (~1-2s response).
- **New `streamFromYouTube` function in `syncService.ts`**: Calls the stream edge function, returns a temporary playable URL + metadata.
- **Update `YouTubeSearch.tsx`**: Replace "Add" button with two actions:
  - **Play** (▶) — streams immediately, adds to current session playlist as a streaming track
  - **Save** (↓) — downloads to storage + IndexedDB for offline (existing `importFromYouTube` flow)
- **Update `SongRecommendations.tsx`**: Same dual-button approach (Play to stream, Save for offline)
- **Update `useAudioPlayer.ts`**: No changes needed — Howler.js already supports playing from any URL including remote ones

### 2. Filter Long Videos from Recommendations

- **Update `get-recommendations` edge function**: When processing YouTube search results, filter out any result with duration > 10 minutes (600 seconds). This removes podcasts, mixes, and 2-hour compilations.
- Parse duration strings (e.g., "2:15:30") into seconds for comparison

### 3. Fix Mobile Responsiveness for Search & Discover

- **`YouTubeSearch.tsx`**: 
  - Make the dialog full-screen on mobile (`max-h-[100dvh] h-full sm:max-h-[80vh] sm:h-auto`)
  - Always show Play/Save buttons (remove `hidden sm:inline` on labels)
  - Stack thumbnail + info + buttons vertically on very small screens
  - Increase touch targets for buttons

- **`SongRecommendations.tsx`**:
  - Always show action buttons (remove any hidden classes)
  - Better spacing and larger touch targets on mobile

### 4. Use Real Visualizer on Mobile (Including iOS)

**The constraint**: iOS requires `html5: true` in Howler for background playback. AudioMotion Analyzer requires Web Audio API, which is incompatible with `html5: true`.

**Solution**: Use a hybrid approach on iOS:
- When the app is in the foreground and the user is viewing the visualizer, create a secondary Web Audio API source connected to AudioMotion for visual analysis only (not for playback)
- Use `AudioContext.createMediaElementSource()` on the HTML5 audio element that Howler creates
- This allows real visualizer data while keeping HTML5 audio for background playback
- When the app goes to background, the visualizer naturally stops (no analysis needed)

Changes:
- **`AudioMotionVisualizer.tsx`**: Remove the `isIOS` bypass. Instead, for iOS, get the HTML5 audio element from Howler and connect it to an AudioContext for analysis only. The `IOSFallbackVisualizer` component is removed.
- Keep the animated mode badge but only show it if the AudioContext connection actually fails

### Summary of Files to Change

| File | Change |
|------|--------|
| `supabase/functions/youtube-stream/index.ts` | **New** — lightweight stream URL endpoint |
| `supabase/functions/get-recommendations/index.ts` | Filter out videos > 10 min |
| `src/lib/syncService.ts` | Add `streamFromYouTube()` function |
| `src/components/YouTubeSearch.tsx` | Dual Play/Save buttons, full-screen mobile dialog |
| `src/components/SongRecommendations.tsx` | Dual Play/Save buttons, mobile-friendly layout |
| `src/components/AudioMotionVisualizer.tsx` | Remove iOS fallback, connect HTML5 audio to AudioContext |
| `supabase/config.toml` | Register new `youtube-stream` function |

### Steps

1. Create `youtube-stream` edge function and register in config
2. Add `streamFromYouTube()` to syncService
3. Update YouTubeSearch with stream/save buttons and mobile-full dialog
4. Update SongRecommendations with stream/save buttons and duration filter
5. Update get-recommendations to filter long videos
6. Update AudioMotionVisualizer to use real visualizer on iOS

