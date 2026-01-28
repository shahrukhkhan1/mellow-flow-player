import { supabase } from '@/integrations/supabase/client';
import { Track } from '@/hooks/useAudioPlayer';
import { saveTrack, getAllTracks as getLocalTracks } from './db';

export interface CloudTrack {
  id: string;
  user_id: string;
  title: string;
  artist: string;
  duration: number | null;
  file_path: string;
  cover_url: string | null;
  uploaded_at: string;
  last_synced: string;
  device_id: string | null;
}

// Helper to check if a string is a valid UUID
const isValidUUID = (str: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

// Upload track to cloud
export const uploadTrackToCloud = async (track: Track, file: File, userId: string, localTrackId?: string): Promise<{ success: boolean; cloudId?: string }> => {
  try {
    const deviceId = getDeviceId();
    
    // Generate a proper UUID for the cloud if the local ID is not a valid UUID
    const cloudTrackId = isValidUUID(track.id) ? track.id : crypto.randomUUID();
    const filePath = `${userId}/${cloudTrackId}.${file.name.split('.').pop()}`;

    console.log(`📤 Uploading track: ${track.title} (local: ${track.id}, cloud: ${cloudTrackId})`);

    // Upload file to storage
    const { error: uploadError } = await supabase.storage
      .from('music-files')
      .upload(filePath, file, {
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Save metadata to database with valid UUID
    const { error: dbError } = await supabase
      .from('tracks')
      .upsert({
        id: cloudTrackId,
        user_id: userId,
        title: track.title,
        artist: track.artist,
        duration: track.duration || null,
        file_path: filePath,
        cover_url: track.cover || null,
        device_id: deviceId,
        last_synced: new Date().toISOString(),
      });

    if (dbError) throw dbError;

    return { success: true, cloudId: cloudTrackId };
  } catch (error) {
    console.error('Error uploading track:', error);
    return { success: false };
  }
};

// Download and cache a single cloud track to IndexedDB
export const downloadAndCacheCloudTrack = async (
  cloudTrack: CloudTrack,
  signedUrl: string
): Promise<Track | null> => {
  try {
    console.log(`📥 Downloading: ${cloudTrack.title}`);
    
    // Download the audio file blob
    const response = await fetch(signedUrl);
    if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
    
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
    
    console.log(`✅ Cached locally: ${cloudTrack.title}`);
    return track;
  } catch (error) {
    console.error(`Failed to cache cloud track ${cloudTrack.title}:`, error);
    return null;
  }
};

// Download and cache cloud tracks that don't exist locally
export const syncTracksFromCloud = async (
  userId: string,
  onProgress?: (current: number, total: number, trackTitle: string) => void
): Promise<Track[]> => {
  try {
    // Get local track IDs first to avoid re-downloading
    const localTracks = await getLocalTracks();
    const localTrackIds = new Set(localTracks.map(t => t.id));
    const localTrackTitles = new Set(localTracks.map(t => t.title.toLowerCase()));
    
    // Fetch cloud track metadata
    const { data: cloudTracks, error } = await supabase
      .from('tracks')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    // Filter to only tracks that need downloading
    const tracksToDownload = (cloudTracks || []).filter(ct => 
      !localTrackIds.has(ct.id) && !localTrackTitles.has(ct.title.toLowerCase())
    );
    
    console.log(`📥 ${tracksToDownload.length} cloud tracks to download and cache (${localTracks.length} already local)`);
    
    if (tracksToDownload.length === 0) {
      return [];
    }

    const downloadedTracks: Track[] = [];

    for (let i = 0; i < tracksToDownload.length; i++) {
      const cloudTrack = tracksToDownload[i];
      onProgress?.(i + 1, tracksToDownload.length, cloudTrack.title);
      
      // Get signed URL
      const { data: urlData } = await supabase.storage
        .from('music-files')
        .createSignedUrl(cloudTrack.file_path, 3600); // 1 hour for download

      if (urlData?.signedUrl) {
        // Download and cache locally
        const cachedTrack = await downloadAndCacheCloudTrack(cloudTrack, urlData.signedUrl);
        if (cachedTrack) {
          downloadedTracks.push(cachedTrack);
        }
      }
    }

    return downloadedTracks;
  } catch (error) {
    console.error('Error syncing from cloud:', error);
    return [];
  }
};

// Sync favorites to cloud
export const syncFavoritesToCloud = async (trackId: string, userId: string, isFavorite: boolean) => {
  try {
    if (isFavorite) {
      await supabase
        .from('favorites')
        .insert({
          user_id: userId,
          track_id: trackId,
        });
    } else {
      await supabase
        .from('favorites')
        .delete()
        .eq('user_id', userId)
        .eq('track_id', trackId);
    }
  } catch (error) {
    console.error('Error syncing favorites:', error);
  }
};

// Get cloud favorites
export const getCloudFavorites = async (userId: string): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from('favorites')
      .select('track_id')
      .eq('user_id', userId);

    if (error) throw error;
    return data?.map(f => f.track_id) || [];
  } catch (error) {
    console.error('Error getting cloud favorites:', error);
    return [];
  }
};

// Delete track from cloud
export const deleteTrackFromCloud = async (trackId: string, userId: string) => {
  try {
    // Get file path first
    const { data: track } = await supabase
      .from('tracks')
      .select('file_path')
      .eq('id', trackId)
      .eq('user_id', userId)
      .single();

    if (track) {
      // Delete from storage
      await supabase.storage
        .from('music-files')
        .remove([track.file_path]);
    }

    // Delete from database (will cascade to favorites and playlist_tracks)
    await supabase
      .from('tracks')
      .delete()
      .eq('id', trackId)
      .eq('user_id', userId);
  } catch (error) {
    console.error('Error deleting track from cloud:', error);
  }
};

// Helper to get/create device ID
const getDeviceId = (): string => {
  let deviceId = localStorage.getItem('pocket-mp3-device-id');
  if (!deviceId) {
    deviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('pocket-mp3-device-id', deviceId);
  }
  return deviceId;
};

// Check if a track already exists in cloud by ID or title (for deduplication)
export const trackExistsInCloud = async (trackId: string, userId: string, title?: string): Promise<boolean> => {
  try {
    // If the ID is a valid UUID, check by ID
    if (isValidUUID(trackId)) {
      const { data, error } = await supabase
        .from('tracks')
        .select('id')
        .eq('id', trackId)
        .eq('user_id', userId)
        .maybeSingle();

      if (data && !error) return true;
    }
    
    // Also check by title for tracks with non-UUID IDs (legacy tracks)
    if (title) {
      const { data: titleMatch } = await supabase
        .from('tracks')
        .select('id')
        .eq('title', title)
        .eq('user_id', userId)
        .maybeSingle();
        
      if (titleMatch) return true;
    }
    
    return false;
  } catch (error) {
    return false;
  }
};

// Sync local tracks to cloud (with file blob support from IndexedDB)
export const syncLocalToCloud = async (
  userId: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ uploaded: number; skipped: number; errors: number }> => {
  let uploaded = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // Get local tracks from IndexedDB with their file blobs
    const db = await import('./db').then(m => m.initDB());
    const storedTracks = await db.getAll('tracks');
    
    console.log(`📤 Found ${storedTracks.length} local tracks to sync`);
    
    for (let i = 0; i < storedTracks.length; i++) {
      const stored = storedTracks[i];
      onProgress?.(i + 1, storedTracks.length);
      
      // Check if track already exists in cloud (by ID or title for legacy tracks)
      const exists = await trackExistsInCloud(stored.id, userId, stored.title);
      if (exists) {
        console.log('⏭️ Skipping existing track:', stored.title);
        skipped++;
        continue;
      }

      // Upload track with its blob
      const track = {
        id: stored.id,
        title: stored.title,
        artist: stored.artist,
        url: URL.createObjectURL(stored.blob),
        duration: stored.duration,
        cover: stored.cover,
      };
      
      // Create a file from the blob
      const file = new File([stored.blob], `${stored.title}.mp3`, { type: 'audio/mpeg' });
      
      // Upload with potential ID migration (non-UUID to UUID)
      const result = await uploadTrackToCloud(track, file, userId, stored.id);
      if (result.success) {
        console.log('✅ Uploaded:', stored.title, result.cloudId !== stored.id ? `(migrated ID: ${result.cloudId})` : '');
        uploaded++;
      } else {
        console.error('❌ Failed to upload:', stored.title);
        errors++;
      }
    }
  } catch (error) {
    console.error('Error syncing local to cloud:', error);
  }

  return { uploaded, skipped, errors };
};

// Perform full bidirectional sync
export const performFullSync = async (
  userId: string,
  onProgress?: (status: string) => void
): Promise<{ uploaded: number; downloaded: number; skipped: number }> => {
  try {
    // Download from cloud first
    onProgress?.('Fetching cloud tracks...');
    const cloudTracks = await syncTracksFromCloud(userId);
    
    // Upload local tracks to cloud
    onProgress?.('Uploading local tracks...');
    const { uploaded, skipped } = await syncLocalToCloud(userId, (current, total) => {
      onProgress?.(`Syncing ${current}/${total} tracks...`);
    });

    return {
      uploaded,
      downloaded: cloudTracks.length,
      skipped,
    };
  } catch (error) {
    console.error('Error performing full sync:', error);
    return { uploaded: 0, downloaded: 0, skipped: 0 };
  }
};
