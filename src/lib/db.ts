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
}

let dbInstance: IDBPDatabase<MusicDB> | null = null;

export const initDB = async () => {
  if (dbInstance) return dbInstance;
  
  dbInstance = await openDB<MusicDB>('pocket-mp3-db', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('tracks')) {
        db.createObjectStore('tracks', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('playlists')) {
        db.createObjectStore('playlists', { keyPath: 'id' });
      }
    },
  });
  
  return dbInstance;
};

export const saveTrack = async (track: Track, file: File) => {
  const db = await initDB();
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
  
  return stored.map(s => ({
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
