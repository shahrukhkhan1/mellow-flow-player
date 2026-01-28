
# Caching Cloud Music Locally for Offline Playback

## Problem Analysis

When you log in and sync your music from the cloud, the app only fetches temporary signed URLs (expire in 24 hours) for your tracks. These URLs are stored in memory, but the actual audio files are **never downloaded and saved locally** to IndexedDB.

This means:
- First load: Cloud tracks work (via signed URLs)
- Page refresh: Cloud tracks need to be re-fetched because they weren't cached locally
- Offline: Cloud tracks won't play at all

## Solution

Implement a proper "download and cache" mechanism that:
1. Downloads the actual audio file from cloud storage
2. Saves the audio blob to IndexedDB for offline access
3. Uses local cache on subsequent loads instead of re-downloading

---

## Technical Implementation

### 1. Add Download Function to Sync Service

Create a new function `downloadAndCacheCloudTrack` in `src/lib/syncService.ts`:

```typescript
export const downloadAndCacheCloudTrack = async (
  cloudTrack: CloudTrack, 
  signedUrl: string
): Promise<Track | null> => {
  try {
    // Download the audio file blob
    const response = await fetch(signedUrl);
    if (!response.ok) throw new Error('Failed to download');
    
    const blob = await response.blob();
    
    // Create track object
    const track: Track = {
      id: cloudTrack.id,
      title: cloudTrack.title,
      artist: cloudTrack.artist,
      url: URL.createObjectURL(blob),
      duration: cloudTrack.duration || undefined,
      cover: cloudTrack.cover_url || undefined,
    };
    
    // Save to IndexedDB with the blob
    const file = new File([blob], `${cloudTrack.title}.mp3`, { type: 'audio/mpeg' });
    await saveTrack(track, file);
    
    return track;
  } catch (error) {
    console.error('Failed to cache cloud track:', error);
    return null;
  }
};
```

### 2. Update `syncTracksFromCloud` Function

Modify to download and cache tracks that don't exist locally:

```typescript
export const syncTracksFromCloud = async (
  userId: string,
  onProgress?: (current: number, total: number) => void
): Promise<Track[]> => {
  // Get local track IDs first
  const localTracks = await getLocalTracks();
  const localTrackIds = new Set(localTracks.map(t => t.id));
  
  // Fetch cloud track metadata
  const { data: cloudTracks, error } = await supabase
    .from('tracks')
    .select('*')
    .eq('user_id', userId);

  if (error) throw error;

  const tracks: Track[] = [];
  const tracksToDownload = (cloudTracks || []).filter(
    ct => !localTrackIds.has(ct.id)
  );
  
  console.log(`📥 ${tracksToDownload.length} cloud tracks to download and cache`);
  
  for (let i = 0; i < tracksToDownload.length; i++) {
    const cloudTrack = tracksToDownload[i];
    onProgress?.(i + 1, tracksToDownload.length);
    
    // Get signed URL
    const { data: urlData } = await supabase.storage
      .from('music-files')
      .createSignedUrl(cloudTrack.file_path, 3600);

    if (urlData?.signedUrl) {
      // Download and cache locally
      const cachedTrack = await downloadAndCacheCloudTrack(cloudTrack, urlData.signedUrl);
      if (cachedTrack) {
        tracks.push(cachedTrack);
        console.log(`✅ Cached: ${cloudTrack.title}`);
      }
    }
  }

  return tracks;
};
```

### 3. Update MusicPlayer Sync Logic

Modify `syncFromCloud` in `src/components/MusicPlayer.tsx` to show download progress:

```typescript
const syncFromCloud = async () => {
  if (!isAuthenticated || !user) return;
  
  try {
    setSyncStatus('syncing');
    
    // Upload local tracks first
    const uploadResult = await syncLocalToCloud(user.id, (current, total) => {
      console.log(`📤 Uploading ${current}/${total}`);
    });
    
    // Download and cache cloud tracks that aren't local
    const downloadedTracks = await syncTracksFromCloud(user.id, (current, total) => {
      console.log(`📥 Downloading ${current}/${total}`);
    });
    
    // Now load everything from local IndexedDB (includes newly cached tracks)
    const allLocalTracks = await getAllTracks();
    setPlaylist(allLocalTracks);
    
    setSyncStatus('idle');
    toast.success(`Synced! ${uploadResult.uploaded} uploaded, ${downloadedTracks.length} downloaded`);
  } catch (error) {
    // error handling...
  }
};
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/syncService.ts` | Add `downloadAndCacheCloudTrack`, update `syncTracksFromCloud` to download and cache |
| `src/components/MusicPlayer.tsx` | Update `syncFromCloud` to properly sequence upload/download and reload from IndexedDB |

---

## Benefits

1. **Truly Offline**: Music plays without internet after first sync
2. **No Re-downloading**: Tracks load instantly from local cache on refresh
3. **Cross-device**: Upload from laptop, download on iPhone - stays cached on both
4. **Efficient**: Only downloads tracks not already in local IndexedDB

---

## User Experience

- **First login on new device**: Shows "Downloading X tracks..." progress
- **Subsequent loads**: Instant load from local cache
- **Offline mode**: All synced music plays without internet
- **New uploads**: Automatically sync to cloud, then cached on other devices
