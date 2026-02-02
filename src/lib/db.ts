import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Track } from '@/hooks/useAudioPlayer';

interface MusicDB extends DBSchema {
  tracks: {
    key: string;
    value: {
      id: string;
      title: string;
      artist: string;
      blob: Blob;
      duration?: number;
      cover?: string;
    };
  };
  playlists: {
    key: string;
    value: {
      id: string;
      name: string;
      trackIds: string[];
      createdAt: number;
    };
  };
  favorites: {
    key: string;
    value: {
      trackId: string;
      addedAt: number;
    };
  };
  playStats: {
    key: string;
    value: {
      trackId: string;
      playCount: number;
      totalPlayTime: number;
      lastPlayed: number;
      genre?: string;
    };
  };
}

let dbInstance: IDBPDatabase<MusicDB> | null = null;

export const initDB = async () => {
  if (dbInstance) return dbInstance;
  
  dbInstance = await openDB<MusicDB>('pocket-mp3-db', 3, {
    upgrade(db, oldVersion) {
      if (!db.objectStoreNames.contains('tracks')) {
        db.createObjectStore('tracks', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('playlists')) {
        db.createObjectStore('playlists', { keyPath: 'id' });
      }
      if (oldVersion < 2 && !db.objectStoreNames.contains('favorites')) {
        db.createObjectStore('favorites', { keyPath: 'trackId' });
      }
      if (oldVersion < 3 && !db.objectStoreNames.contains('playStats')) {
        db.createObjectStore('playStats', { keyPath: 'trackId' });
      }
    },
  });
  
  return dbInstance;
};

export const saveTrack = async (track: Track, file: File) => {
  const db = await initDB();
  
  // Check if track with same title already exists (deduplication)
  const allTracks = await db.getAll('tracks');
  const titleKey = track.title.toLowerCase().trim();
  const existingTrack = allTracks.find(t => t.title.toLowerCase().trim() === titleKey);
  
  if (existingTrack) {
    console.log(`⏭️ Track "${track.title}" already exists locally, skipping save`);
    return; // Don't save duplicate
  }
  
  await db.put('tracks', {
    id: track.id,
    title: track.title,
    artist: track.artist,
    blob: file,
    duration: track.duration,
    cover: track.cover,
  });
};

export const getTrack = async (id: string): Promise<Track | null> => {
  const db = await initDB();
  const stored = await db.get('tracks', id);
  if (!stored) return null;
  
  return {
    id: stored.id,
    title: stored.title,
    artist: stored.artist,
    url: URL.createObjectURL(stored.blob),
    duration: stored.duration,
    cover: stored.cover,
  };
};

export const getAllTracks = async (): Promise<Track[]> => {
  const db = await initDB();
  const stored = await db.getAll('tracks');
  
  // Deduplicate by title (case-insensitive) - keep first occurrence
  const seenTitles = new Set<string>();
  const uniqueStored = stored.filter(s => {
    const titleKey = s.title.toLowerCase().trim();
    if (seenTitles.has(titleKey)) {
      return false;
    }
    seenTitles.add(titleKey);
    return true;
  });
  
  return uniqueStored.map(s => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    url: URL.createObjectURL(s.blob),
    duration: s.duration,
    cover: s.cover,
  }));
};

export const deleteTrack = async (id: string) => {
  const db = await initDB();
  await db.delete('tracks', id);
};

export const savePlaylist = async (name: string, trackIds: string[]) => {
  const db = await initDB();
  const id = `playlist-${Date.now()}`;
  await db.put('playlists', {
    id,
    name,
    trackIds,
    createdAt: Date.now(),
  });
  return id;
};

export const getAllPlaylists = async () => {
  const db = await initDB();
  return await db.getAll('playlists');
};

export const deletePlaylist = async (id: string) => {
  const db = await initDB();
  await db.delete('playlists', id);
};

// Favorites functions
export const toggleFavorite = async (trackId: string): Promise<boolean> => {
  const db = await initDB();
  const existing = await db.get('favorites', trackId);
  
  if (existing) {
    await db.delete('favorites', trackId);
    return false;
  } else {
    await db.put('favorites', {
      trackId,
      addedAt: Date.now(),
    });
    return true;
  }
};

export const isFavorite = async (trackId: string): Promise<boolean> => {
  const db = await initDB();
  const favorite = await db.get('favorites', trackId);
  return !!favorite;
};

export const getAllFavorites = async (): Promise<string[]> => {
  const db = await initDB();
  const favorites = await db.getAll('favorites');
  return favorites.map(f => f.trackId);
};

// Play statistics functions
export const trackPlayStats = async (trackId: string, playTime: number, genre?: string) => {
  const db = await initDB();
  const existing = await db.get('playStats', trackId);
  
  if (existing) {
    await db.put('playStats', {
      trackId,
      playCount: existing.playCount + 1,
      totalPlayTime: existing.totalPlayTime + playTime,
      lastPlayed: Date.now(),
      genre: genre || existing.genre,
    });
  } else {
    await db.put('playStats', {
      trackId,
      playCount: 1,
      totalPlayTime: playTime,
      lastPlayed: Date.now(),
      genre,
    });
  }
};

export const getPlayStats = async (trackId: string) => {
  const db = await initDB();
  return await db.get('playStats', trackId);
};

export const getAllPlayStats = async () => {
  const db = await initDB();
  return await db.getAll('playStats');
};

// Cleanup duplicate tracks from IndexedDB (keeps first occurrence by title)
export const cleanupDuplicateTracks = async (): Promise<number> => {
  const db = await initDB();
  const tracks = await db.getAll('tracks');
  
  const seenTitles = new Set<string>();
  const duplicateIds: string[] = [];
  
  for (const track of tracks) {
    const titleKey = track.title.toLowerCase().trim();
    if (seenTitles.has(titleKey)) {
      duplicateIds.push(track.id);
    } else {
      seenTitles.add(titleKey);
    }
  }
  
  // Delete duplicates
  for (const id of duplicateIds) {
    await db.delete('tracks', id);
  }
  
  console.log(`🧹 Cleaned up ${duplicateIds.length} duplicate tracks from IndexedDB`);
  return duplicateIds.length;
};
