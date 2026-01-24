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

// Upload track to cloud
export const uploadTrackToCloud = async (track: Track, file: File, userId: string): Promise<boolean> => {
  try {
    const deviceId = getDeviceId();
    const filePath = `${userId}/${track.id}.${file.name.split('.').pop()}`;

    // Upload file to storage
    const { error: uploadError } = await supabase.storage
      .from('music-files')
      .upload(filePath, file, {
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Save metadata to database
    const { error: dbError } = await supabase
      .from('tracks')
      .upsert({
        id: track.id,
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

    return true;
  } catch (error) {
    console.error('Error uploading track:', error);
    return false;
  }
};

// Download all tracks metadata from cloud
export const syncTracksFromCloud = async (userId: string): Promise<Track[]> => {
  try {
    const { data: cloudTracks, error } = await supabase
      .from('tracks')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    const tracks: Track[] = [];

    for (const cloudTrack of cloudTracks || []) {
      // Get signed URL for the audio file
      const { data: urlData } = await supabase.storage
        .from('music-files')
        .createSignedUrl(cloudTrack.file_path, 3600 * 24); // 24 hour expiry

      if (urlData?.signedUrl) {
        tracks.push({
          id: cloudTrack.id,
          title: cloudTrack.title,
          artist: cloudTrack.artist,
          url: urlData.signedUrl,
          duration: cloudTrack.duration || undefined,
          cover: cloudTrack.cover_url || undefined,
        });
      }
    }

    return tracks;
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

// Check if a track already exists in cloud
export const trackExistsInCloud = async (trackId: string, userId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('tracks')
      .select('id')
      .eq('id', trackId)
      .eq('user_id', userId)
      .single();

    return !!data && !error;
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
      
      // Check if track already exists in cloud
      const exists = await trackExistsInCloud(stored.id, userId);
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
      
      const success = await uploadTrackToCloud(track, file, userId);
      if (success) {
        console.log('✅ Uploaded:', stored.title);
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
