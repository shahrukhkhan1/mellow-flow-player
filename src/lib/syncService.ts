import { supabase } from '@/integrations/supabase/client';
import { Track } from '@/hooks/useAudioPlayer';
import { saveTrack, getAllTracks as getLocalTracks, getAllFavorites, setFavoriteState } from './db';
import { logger } from './logger';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
let fullSyncPromise: Promise<{ uploaded: number; downloaded: number; skipped: number }> | null = null;

const normalizeTrackTitle = (title: string) => title.toLowerCase().trim();

const withTimeout = async <T,>(promise: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
};

const invokePublicEdgeFunction = async <T>(functionName: string, body: unknown, timeoutMs = 25000): Promise<T> => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Music streaming is not configured. Please check Supabase environment variables.');
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || data?.message || `${functionName} failed (${response.status})`);
    }
    return data as T;
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      throw new Error('Music service timed out. Please try again on a stronger network.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const extractYouTubeVideoId = (urlOrId: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = urlOrId.match(pattern);
    if (match) return match[1];
  }

  return null;
};

const fetchAudioBlob = async (audioUrl: string, timeoutMs = 90000): Promise<Blob> => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(audioUrl, {
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok && response.status !== 206) {
      throw new Error(`Audio download failed (${response.status})`);
    }

    const blob = await response.blob();
    if (blob.size < 1000) {
      throw new Error('Downloaded audio file is too small. Please try another result.');
    }

    return blob.type ? blob : new Blob([blob], { type: 'audio/mpeg' });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      throw new Error('Download timed out. Please try again on a stronger network.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const fetchCloudTrackMetadata = async (userId: string, select = 'id, title') => {
  const pageSize = 1000;
  let from = 0;
  const rows: any[] = [];

  while (true) {
    const { data, error } = await withTimeout(
      supabase
        .from('tracks')
        .select(select)
        .eq('user_id', userId)
        .order('uploaded_at', { ascending: true })
        .range(from, from + pageSize - 1),
      20000,
      'Cloud sync check timed out. Please try again on a stronger network.',
    );

    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
};

// YouTube import types
interface YouTubeImportResponse {
  success: boolean;
  track?: {
    id: string;
    title: string;
    artist: string;
    duration: number | null;
    cover_url: string | null;
    file_path: string;
    signed_url: string;
  };
  error?: string;
}

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

    logger.debug(`Uploading track: ${track.title} (local: ${track.id}, cloud: ${cloudTrackId})`);

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
    logger.error('Error uploading track:', error);
    return { success: false };
  }
};

// Download and cache a single cloud track to IndexedDB
export const downloadAndCacheCloudTrack = async (
  cloudTrack: CloudTrack,
  signedUrl: string
): Promise<Track | null> => {
  try {
    logger.debug(`Downloading: ${cloudTrack.title}`);
    
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
    const savedTrackId = await saveTrack(track, file);
    if (savedTrackId) track.id = savedTrackId;
    
    logger.debug(`Cached locally: ${cloudTrack.title}`);
    return track;
  } catch (error) {
    logger.error(`Failed to cache cloud track ${cloudTrack.title}:`, error);
    return null;
  }
};

// Check what needs to be synced (smart sync - compare counts first)
export const checkSyncNeeded = async (userId: string): Promise<{
  needsUpload: number;
  needsDownload: number;
  localCount: number;
  cloudCount: number;
}> => {
  try {
    const localTracks = await getLocalTracks();
    const localTrackIds = new Set(localTracks.map(t => t.id));
    const localTrackTitles = new Set(localTracks.map(t => normalizeTrackTitle(t.title)));
    const cloudTracks = await fetchCloudTrackMetadata(userId, 'id, title');
    
    const cloudTrackIds = new Set((cloudTracks || []).map(t => t.id));
    const cloudTrackTitles = new Set((cloudTracks || []).map(t => normalizeTrackTitle(t.title)));
    
    // Find what needs to be uploaded (local but not in cloud)
    const needsUpload = localTracks.filter(t => 
      !cloudTrackIds.has(t.id) && !cloudTrackTitles.has(normalizeTrackTitle(t.title))
    ).length;
    
    // Find what needs to be downloaded (cloud but not local)
    const needsDownload = (cloudTracks || []).filter(ct => 
      !localTrackIds.has(ct.id) && !localTrackTitles.has(normalizeTrackTitle(ct.title))
    ).length;
    
    return {
      needsUpload,
      needsDownload,
      localCount: localTracks.length,
      cloudCount: cloudTracks?.length || 0,
    };
  } catch (error) {
    logger.error('Error checking sync needed:', error);
    throw error;
  }
};

// Download and cache cloud tracks that don't exist locally
export const syncTracksFromCloud = async (
  userId: string,
  onProgress?: (current: number, total: number, trackTitle: string, bytesDownloaded?: number, totalBytes?: number) => void
): Promise<Track[]> => {
  try {
    // Get local track IDs first to avoid re-downloading
    const localTracks = await getLocalTracks();
    const localTrackIds = new Set(localTracks.map(t => t.id));
    const localTrackTitles = new Set(localTracks.map(t => normalizeTrackTitle(t.title)));
    const cloudTracks = await fetchCloudTrackMetadata(userId, '*') as CloudTrack[];

    // Filter to only tracks that need downloading
    const tracksToDownload = (cloudTracks || []).filter(ct => 
      !localTrackIds.has(ct.id) && !localTrackTitles.has(normalizeTrackTitle(ct.title))
    );
    
    logger.debug(`${tracksToDownload.length} cloud tracks to download and cache (${localTracks.length} already local)`);
    
    if (tracksToDownload.length === 0) {
      return [];
    }

    const downloadedTracks: Track[] = [];

    for (let i = 0; i < tracksToDownload.length; i++) {
      const cloudTrack = tracksToDownload[i];
      onProgress?.(i + 1, tracksToDownload.length, cloudTrack.title);
      
      // Get signed URL
      const { data: urlData, error: urlError } = await withTimeout(
        supabase.storage
          .from('music-files')
          .createSignedUrl(cloudTrack.file_path, 3600),
        15000,
        `Timed out preparing ${cloudTrack.title}`,
      );

      if (urlError) {
        logger.error(`Failed to create download link for ${cloudTrack.title}:`, urlError);
        continue;
      }

      if (urlData?.signedUrl) {
        // Download with progress tracking
        const cachedTrack = await downloadAndCacheCloudTrackWithProgress(
          cloudTrack, 
          urlData.signedUrl,
          (bytesDownloaded, totalBytes) => {
            onProgress?.(i + 1, tracksToDownload.length, cloudTrack.title, bytesDownloaded, totalBytes);
          }
        );
        if (cachedTrack) {
          downloadedTracks.push(cachedTrack);
        }
      }
    }

    return downloadedTracks;
  } catch (error) {
    logger.error('Error syncing from cloud:', error);
    return [];
  }
};

// Download with progress tracking
export const downloadAndCacheCloudTrackWithProgress = async (
  cloudTrack: CloudTrack,
  signedUrl: string,
  onProgress?: (bytesDownloaded: number, totalBytes: number) => void
): Promise<Track | null> => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 120000);

  try {
    logger.debug(`Downloading: ${cloudTrack.title}`);
    
    const response = await fetch(signedUrl, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
    
    const contentLength = response.headers.get('content-length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
    
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No reader available');
    
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      chunks.push(value);
      receivedBytes += value.length;
      
      if (totalBytes > 0) {
        onProgress?.(receivedBytes, totalBytes);
      }
    }
    
    // Combine chunks into single buffer then blob
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const buffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }
    const blob = new Blob([buffer], { type: 'audio/mpeg' });
    
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
    const savedTrackId = await saveTrack(track, file);
    if (savedTrackId) track.id = savedTrackId;
    
    logger.debug(`Cached locally: ${cloudTrack.title}`);
    return track;
  } catch (error) {
    const message = (error as Error)?.name === 'AbortError'
      ? 'Download timed out'
      : 'Failed to cache cloud track';
    logger.error(`${message} ${cloudTrack.title}:`, error);
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

// Sync favorites to cloud
export const syncFavoritesToCloud = async (trackId: string, userId: string, isFavorite: boolean) => {
  try {
    if (!isValidUUID(trackId)) return;
    if (isFavorite) {
      await supabase
        .from('favorites')
        .upsert({
          user_id: userId,
          track_id: trackId,
        }, { onConflict: 'user_id,track_id' });
    } else {
      await supabase
        .from('favorites')
        .delete()
        .eq('user_id', userId)
        .eq('track_id', trackId);
    }
  } catch (error) {
    logger.error('Error syncing favorites:', error);
  }
};

export const syncFavoritesFromCloud = async (userId: string): Promise<string[]> => {
  const localFavorites = await getAllFavorites();
  const localUuidFavorites = localFavorites.filter(isValidUUID);

  try {
    const { data, error } = await supabase
      .from('favorites')
      .select('track_id')
      .eq('user_id', userId);
    if (error) throw error;

    const cloudFavorites = (data || []).map((f) => f.track_id);
    for (const trackId of cloudFavorites) {
      await setFavoriteState(trackId, true);
    }
    for (const trackId of localUuidFavorites) {
      if (!cloudFavorites.includes(trackId)) {
        await syncFavoritesToCloud(trackId, userId, true);
      }
    }

    return Array.from(new Set([...localFavorites, ...cloudFavorites]));
  } catch (error) {
    logger.error('Error syncing favorites from cloud:', error);
    return localFavorites;
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
    logger.error('Error getting cloud favorites:', error);
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
    logger.error('Error deleting track from cloud:', error);
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
    
    logger.debug(`Found ${storedTracks.length} local tracks to sync`);
    
    for (let i = 0; i < storedTracks.length; i++) {
      const stored = storedTracks[i];
      onProgress?.(i + 1, storedTracks.length);
      
      // Check if track already exists in cloud (by ID or title for legacy tracks)
      const exists = await trackExistsInCloud(stored.id, userId, stored.title);
      if (exists) {
        logger.debug('Skipping existing track:', stored.title);
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
        logger.debug('Uploaded:', stored.title, result.cloudId !== stored.id ? `(migrated ID: ${result.cloudId})` : '');
        uploaded++;
      } else {
        logger.error('Failed to upload:', stored.title);
        errors++;
      }
    }
  } catch (error) {
    logger.error('Error syncing local to cloud:', error);
  }

  return { uploaded, skipped, errors };
};

// Perform full bidirectional sync
export const performFullSync = async (
  userId: string,
  onProgress?: (status: string) => void
): Promise<{ uploaded: number; downloaded: number; skipped: number }> => {
  if (fullSyncPromise) {
    onProgress?.('Sync already running...');
    return fullSyncPromise;
  }

  fullSyncPromise = (async () => {
  try {
    // Download from cloud first
    onProgress?.('Fetching cloud tracks...');
    const cloudTracks = await syncTracksFromCloud(userId);
    
    // Upload local tracks to cloud
    onProgress?.('Uploading local tracks...');
    const { uploaded, skipped } = await syncLocalToCloud(userId, (current, total) => {
      onProgress?.(`Syncing ${current}/${total} tracks...`);
    });

    await syncFavoritesFromCloud(userId);

    return {
      uploaded,
      downloaded: cloudTracks.length,
      skipped,
    };
  } catch (error) {
    logger.error('Error performing full sync:', error);
    return { uploaded: 0, downloaded: 0, skipped: 0 };
  } finally {
    fullSyncPromise = null;
  }
  })();

  return fullSyncPromise;
};

// Import audio from YouTube URL
export const importFromYouTube = async (
  youtubeUrl: string,
  userId?: string,
  onProgress?: (status: 'extracting' | 'uploading' | 'caching') => void
): Promise<Track | null> => {
  try {
    const videoId = extractYouTubeVideoId(youtubeUrl);
    if (!videoId) {
      throw new Error('Invalid YouTube URL format');
    }

    onProgress?.('extracting');

    // Fast path: resolve the stream URL first and cache it straight to IndexedDB.
    // This avoids long server-side convert/upload jobs that can leave the UI stuck,
    // while still keeping the track available offline on this device.
    const streamData = await streamFromYouTube(videoId);
    onProgress?.('caching');

    const blob = await fetchAudioBlob(streamData.audioUrl);
    const track: Track = {
      id: crypto.randomUUID(),
      title: streamData.title || `YouTube-${videoId}`,
      artist: streamData.artist || 'YouTube',
      url: URL.createObjectURL(blob),
      duration: streamData.duration || undefined,
      cover: streamData.thumbnail,
    };

    const file = new File([blob], `${track.title.replace(/[<>:"/\\|?*]/g, '') || 'youtube-track'}.mp3`, {
      type: blob.type || 'audio/mpeg',
    });
    const savedTrackId = await saveTrack(track, file);
    if (savedTrackId) track.id = savedTrackId;

    if (userId && isValidUUID(track.id)) {
      onProgress?.('uploading');
      try {
        await withTimeout(
          uploadTrackToCloud(track, file, userId),
          45000,
          'Cloud sync timed out after local save.',
        );
      } catch (uploadError) {
        logger.error('YouTube cloud sync failed after local save:', uploadError);
      }
    }

    logger.debug(`YouTube offline cache complete: ${track.title}`);
    return track;
  } catch (fastPathError) {
    logger.warn('Fast YouTube offline cache failed, trying cloud import fallback:', fastPathError);

    try {
    // Get auth token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw fastPathError;
    }

    onProgress?.('extracting');

    // Call edge function
    const { data, error } = await supabase.functions.invoke<YouTubeImportResponse>('youtube-to-mp3', {
      body: { youtubeUrl },
    });

    if (error) {
      logger.error('Edge function error:', error);
      throw new Error(error.message || 'Failed to import from YouTube');
    }

    if (!data?.success || !data.track) {
      throw new Error(data?.error || 'Import failed');
    }

    onProgress?.('uploading');

    const { track: cloudTrack } = data;

    // Download and cache locally
    onProgress?.('caching');

    if (!cloudTrack.signed_url) {
      throw new Error('No download URL provided');
    }

    // Download the audio file
    const response = await fetch(cloudTrack.signed_url);
    if (!response.ok) {
      throw new Error('Failed to download audio file');
    }

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

    // Save to IndexedDB
    const file = new File([blob], `${cloudTrack.title}.mp3`, { type: 'audio/mpeg' });
    await saveTrack(track, file);

    logger.debug(`YouTube import complete: ${track.title}`);
    return track;
    } catch (cloudError) {
      logger.error('YouTube import error:', cloudError);
      throw cloudError || fastPathError;
    }
  }
};

// Stream audio from YouTube without downloading/uploading - returns temporary playable URL
export const streamFromYouTube = async (
  videoId: string
): Promise<{ audioUrl: string; title: string; artist: string; duration: number | null; thumbnail: string }> => {
  const attempt = async () => {
    const data = await invokePublicEdgeFunction<any>('youtube-stream', { videoId }, 30000);
    if (!data?.audioUrl) throw new Error(data?.error || 'No audio URL returned');
    return data;
  };

  try {
    return await attempt();
  } catch (e: any) {
    // One client-side retry if the track was still being prepared
    if (/prepar|process/i.test(e?.message || '')) {
      await new Promise((r) => setTimeout(r, 2500));
      return await attempt();
    }
    throw e;
  }
};
