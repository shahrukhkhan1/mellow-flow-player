import { useState, useRef, useEffect, useCallback } from 'react';
import { Howl, Howler } from 'howler';

export interface Track {
  id: string;
  title: string;
  artist: string;
  url: string;
  cover?: string;
  duration?: number;
}

export const useAudioPlayer = (playlist: Track[]) => {
  const soundRef = useRef<Howl | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('pocket-mp3-volume');
    return saved ? parseFloat(saved) : 1;
  });
  const [isShuffle, setIsShuffle] = useState(() => {
    const saved = localStorage.getItem('pocket-mp3-shuffle');
    return saved === 'true';
  });
  const [repeatMode, setRepeatMode] = useState<'off' | 'one' | 'all'>(() => {
    const saved = localStorage.getItem('pocket-mp3-repeat');
    return (saved as 'off' | 'one' | 'all') || 'all';
  });

  const timeUpdateIntervalRef = useRef<number | null>(null);

  // Check if effects mode is enabled
  const effectsEnabled = localStorage.getItem('pocket-mp3-enable-effects') === 'true';

  // Load track when index changes
  useEffect(() => {
    if (playlist.length === 0) return;

    const track = playlist[currentTrackIndex];
    if (!track) return;

    const wasPlaying = isPlaying;

    // Clean up previous sound
    if (soundRef.current) {
      soundRef.current.unload();
    }

    // Clear time update interval
    if (timeUpdateIntervalRef.current) {
      clearInterval(timeUpdateIntervalRef.current);
    }

    console.log('🎵 Loading track with Howler.js:', track.title, effectsEnabled ? '(Effects Mode)' : '(Native Audio)');

    // Create new Howl instance
    const sound = new Howl({
      src: [track.url],
      html5: false, // Always use Web Audio API for visualizers
      format: ['mp3', 'wav', 'ogg', 'm4a', 'aac'],
      preload: true,
      volume: volume,
      loop: repeatMode === 'one',
      onload: () => {
        const trackDuration = sound.duration();
        setDuration(trackDuration);
        console.log('✅ Track loaded, duration:', trackDuration);

        // Apply saved playback rate
        const savedRate = localStorage.getItem('pocket-mp3-playback-rate');
        if (savedRate) {
          sound.rate(parseFloat(savedRate));
        }
      },
      onplay: () => {
        setIsPlaying(true);
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
        console.log('▶️ Playing');

        // Start time update interval
        timeUpdateIntervalRef.current = window.setInterval(() => {
          setCurrentTime(sound.seek());
          
          // Update Media Session position
          if ('mediaSession' in navigator && sound.duration() && isFinite(sound.duration())) {
            try {
              navigator.mediaSession.setPositionState({
                duration: sound.duration(),
                playbackRate: sound.rate(),
                position: Math.min(sound.seek(), sound.duration())
              });
            } catch (err) {
              // Ignore errors
            }
          }
        }, 250);
      },
      onpause: () => {
        setIsPlaying(false);
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'paused';
        }
        if (timeUpdateIntervalRef.current) {
          clearInterval(timeUpdateIntervalRef.current);
        }
        console.log('⏸️ Paused');
      },
      onend: () => {
        if (timeUpdateIntervalRef.current) {
          clearInterval(timeUpdateIntervalRef.current);
        }
        
        console.log('🎵 Track ended - repeat mode:', repeatMode);
        if (repeatMode === 'one') {
          sound.seek(0);
          sound.play();
        } else if (repeatMode === 'all') {
          playNext();
        } else if (currentTrackIndex < playlist.length - 1) {
          playNext();
        } else {
          setIsPlaying(false);
        }
      },
      onerror: (id, error) => {
        console.error('❌ Howler error:', error);
        setIsPlaying(false);
      }
    });

    soundRef.current = sound;

    // Auto-play if we were already playing
    if (wasPlaying) {
      sound.play();
    }

    // Enhanced Media Session API for lock screen and bluetooth controls
    if ('mediaSession' in navigator) {
      const artwork = track.cover ? [
        { src: track.cover, sizes: '96x96', type: 'image/png' },
        { src: track.cover, sizes: '128x128', type: 'image/png' },
        { src: track.cover, sizes: '192x192', type: 'image/png' },
        { src: track.cover, sizes: '256x256', type: 'image/png' },
        { src: track.cover, sizes: '384x384', type: 'image/png' },
        { src: track.cover, sizes: '512x512', type: 'image/png' }
      ] : [];

      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: 'Pocket MP3',
        artwork
      });

      navigator.mediaSession.playbackState = wasPlaying ? 'playing' : 'paused';
      
      console.log('📱 Media Session API initialized for:', track.title);

      // Set action handlers for bluetooth and lock screen controls
      navigator.mediaSession.setActionHandler('play', () => {
        console.log('📱 Media Session: play');
        play();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        console.log('📱 Media Session: pause');
        pause();
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        console.log('📱 Media Session: previoustrack');
        playPrevious();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        console.log('📱 Media Session: nexttrack');
        playNext();
      });
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        console.log('📱 Media Session: seekbackward');
        if (soundRef.current) {
          const newTime = Math.max(0, soundRef.current.seek() - 10);
          soundRef.current.seek(newTime);
          setCurrentTime(newTime);
        }
      });
      navigator.mediaSession.setActionHandler('seekforward', () => {
        console.log('📱 Media Session: seekforward');
        if (soundRef.current) {
          const newTime = Math.min(soundRef.current.duration(), soundRef.current.seek() + 10);
          soundRef.current.seek(newTime);
          setCurrentTime(newTime);
        }
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined && soundRef.current) {
          console.log('📱 Media Session: seekto', details.seekTime);
          soundRef.current.seek(details.seekTime);
          setCurrentTime(details.seekTime);
        }
      });
    }

    return () => {
      if (timeUpdateIntervalRef.current) {
        clearInterval(timeUpdateIntervalRef.current);
      }
    };
  }, [currentTrackIndex, playlist, repeatMode]);

  // Volume control with persistence
  useEffect(() => {
    if (soundRef.current) {
      soundRef.current.volume(volume);
    }
    Howler.volume(volume);
    localStorage.setItem('pocket-mp3-volume', volume.toString());
  }, [volume]);

  // Persist shuffle and repeat settings
  useEffect(() => {
    localStorage.setItem('pocket-mp3-shuffle', isShuffle.toString());
  }, [isShuffle]);

  useEffect(() => {
    localStorage.setItem('pocket-mp3-repeat', repeatMode);
  }, [repeatMode]);

  // Update loop setting when repeat mode changes
  useEffect(() => {
    if (soundRef.current) {
      soundRef.current.loop(repeatMode === 'one');
    }
  }, [repeatMode]);

  const play = useCallback(async () => {
    if (!soundRef.current) return;
    
    try {
      console.log('🎵 Starting playback...');
      soundRef.current.play();
      console.log('✅ Playback started successfully');
    } catch (error: any) {
      console.error('❌ Playback error:', error);
      setIsPlaying(false);
    }
  }, []);

  const pause = useCallback(async () => {
    if (!soundRef.current) return;
    
    console.log('⏸️ Pausing playback...');
    
    try {
      soundRef.current.pause();
    } catch (error) {
      console.error('Error pausing:', error);
      setIsPlaying(false);
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  const seek = useCallback((time: number) => {
    if (soundRef.current) {
      soundRef.current.seek(time);
      setCurrentTime(time);
    }
  }, []);

  const playNext = useCallback(() => {
    if (playlist.length === 0) return;

    let nextIndex;
    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * playlist.length);
    } else {
      nextIndex = (currentTrackIndex + 1) % playlist.length;
    }
    
    setCurrentTrackIndex(nextIndex);
  }, [currentTrackIndex, playlist.length, isShuffle]);

  const playPrevious = useCallback(() => {
    if (playlist.length === 0) return;

    if (soundRef.current && soundRef.current.seek() > 3) {
      seek(0);
    } else {
      const prevIndex = currentTrackIndex === 0 
        ? playlist.length - 1 
        : currentTrackIndex - 1;
      setCurrentTrackIndex(prevIndex);
    }
  }, [currentTrackIndex, playlist.length, seek]);

  const playTrack = useCallback((index: number) => {
    if (index >= 0 && index < playlist.length) {
      setCurrentTrackIndex(index);
    }
  }, [playlist.length]);

  const toggleShuffle = useCallback(() => {
    setIsShuffle(prev => !prev);
  }, []);

  const toggleRepeat = useCallback(() => {
    setRepeatMode(prev => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
  }, []);

  const currentTrack = playlist[currentTrackIndex] || null;

  // Get Howler's audio element for effects processing
  const getAudioElement = useCallback(() => {
    if (soundRef.current && effectsEnabled) {
      // Howler exposes the audio node when using Web Audio API
      return (soundRef.current as any)._sounds[0]?._node;
    }
    return null;
  }, [effectsEnabled]);

  return {
    currentTrack,
    currentTrackIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    isShuffle,
    repeatMode,
    play,
    pause,
    togglePlay,
    seek,
    playNext,
    playPrevious,
    playTrack,
    setVolume,
    toggleShuffle,
    toggleRepeat,
    getAudioElement,
    howlerInstance: soundRef.current,
  };
};
