import { useState, useRef, useEffect, useCallback } from 'react';
import { Howl, Howler } from 'howler';
import { isIOSDevice } from '@/lib/utils';

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

  // Use refs for values needed in onend to avoid stale closures
  const playNextRef = useRef<() => void>(() => {});
  const repeatModeRef = useRef(repeatMode);
  const currentTrackIndexRef = useRef(currentTrackIndex);
  const playlistLengthRef = useRef(playlist.length);

  // When set, the next track that loads with this id should auto-play
  // regardless of the previous isPlaying state. Used by stream "play now" actions.
  const autoplayTrackIdRef = useRef<string | null>(null);

  // Shuffle history: track of indices visited so "previous" walks back through
  // the actual previously-played songs instead of re-shuffling.
  const shuffleHistoryRef = useRef<number[]>([]);
  const isShuffleRef = useRef(isShuffle);

  // Keep refs in sync
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { currentTrackIndexRef.current = currentTrackIndex; }, [currentTrackIndex]);
  useEffect(() => { playlistLengthRef.current = playlist.length; }, [playlist.length]);
  useEffect(() => { isShuffleRef.current = isShuffle; }, [isShuffle]);

  // Restore last-played track once the playlist becomes available.
  // Runs only on the first non-empty load so it doesn't override later user selections.
  const hasRestoredRef = useRef(false);
  useEffect(() => {
    if (hasRestoredRef.current) return;
    if (playlist.length === 0) return;
    hasRestoredRef.current = true;
    try {
      const savedTrackId = localStorage.getItem('pocket-mp3-last-track-id');
      if (savedTrackId) {
        const idx = playlist.findIndex(t => t.id === savedTrackId);
        if (idx >= 0 && idx !== currentTrackIndexRef.current) {
          setCurrentTrackIndex(idx);
        }
      }
    } catch {}
  }, [playlist]);

  // Persist current track id whenever it changes
  useEffect(() => {
    const t = playlist[currentTrackIndex];
    if (t) {
      try { localStorage.setItem('pocket-mp3-last-track-id', t.id); } catch {}
    }
  }, [currentTrackIndex, playlist]);

  const playNext = useCallback(() => {
    if (playlistLengthRef.current === 0) return;
    let nextIndex;
    if (isShuffleRef.current) {
      // Push current track into shuffle history before moving forward,
      // so "previous" can walk back to it instead of picking a new random song.
      shuffleHistoryRef.current.push(currentTrackIndexRef.current);
      // Cap history to a reasonable size
      if (shuffleHistoryRef.current.length > 200) {
        shuffleHistoryRef.current.shift();
      }
      if (playlistLengthRef.current === 1) {
        nextIndex = 0;
      } else {
        // Pick a random index that isn't the current one
        do {
          nextIndex = Math.floor(Math.random() * playlistLengthRef.current);
        } while (nextIndex === currentTrackIndexRef.current);
      }
    } else {
      nextIndex = (currentTrackIndexRef.current + 1) % playlistLengthRef.current;
    }
    setCurrentTrackIndex(nextIndex);
  }, []);

  const playPrevious = useCallback(() => {
    if (playlist.length === 0) return;
    if (soundRef.current && soundRef.current.seek() > 3) {
      soundRef.current.seek(0);
      setCurrentTime(0);
      return;
    }
    if (isShuffleRef.current && shuffleHistoryRef.current.length > 0) {
      // Walk back through previously played tracks
      const prevIndex = shuffleHistoryRef.current.pop()!;
      if (prevIndex >= 0 && prevIndex < playlist.length) {
        setCurrentTrackIndex(prevIndex);
        return;
      }
    }
    const prevIndex = currentTrackIndex === 0
      ? playlist.length - 1
      : currentTrackIndex - 1;
    setCurrentTrackIndex(prevIndex);
  }, [currentTrackIndex, playlist.length]);

  // Keep playNextRef current
  useEffect(() => { playNextRef.current = playNext; }, [playNext]);

  const play = useCallback(() => {
    if (!soundRef.current) return;
    try {
      // On iOS, ensure we resume any suspended context
      const isIOS = isIOSDevice();
      if (isIOS && Howler.ctx && Howler.ctx.state === 'suspended') {
        Howler.ctx.resume().catch(() => {});
      }
      soundRef.current.play();
    } catch (error: any) {
      console.error('❌ Playback error:', error);
      setIsPlaying(false);
    }
  }, []);

  const pause = useCallback(() => {
    if (!soundRef.current) return;
    try {
      soundRef.current.pause();
    } catch (error) {
      console.error('Error pausing:', error);
      setIsPlaying(false);
    }
  }, []);

  // Load track when index changes
  useEffect(() => {
    if (playlist.length === 0) return;
    const track = playlist[currentTrackIndex];
    if (!track) return;

    const wasPlaying = isPlaying;

    // Clean up previous sound
    if (soundRef.current) {
      // Remove event listeners before unloading to prevent stale onpause from firing
      soundRef.current.off();
      soundRef.current.unload();
    }

    if (timeUpdateIntervalRef.current) {
      clearInterval(timeUpdateIntervalRef.current);
    }

    const isIOS = isIOSDevice();
    const useHtml5Audio = isIOS;

    console.log('🎵 Loading track:', track.title,
      isIOS ? '(iOS HTML5 Audio)' : '(Web Audio API)');

    // For streaming URLs (external), use html5 for better buffering on slow networks
    const isStreamUrl = track.url.startsWith('http') && !track.url.includes('supabase');
    const useHtml5ForStream = isStreamUrl || useHtml5Audio;

    const sound = new Howl({
      src: [track.url],
      html5: useHtml5ForStream,
      format: ['mp3', 'wav', 'ogg', 'm4a', 'aac'],
      preload: true,
      volume: volume,
      loop: repeatModeRef.current === 'one',
      onload: () => {
        const trackDuration = sound.duration();
        setDuration(trackDuration);
        const savedRate = localStorage.getItem('pocket-mp3-playback-rate');
        if (savedRate) {
          sound.rate(parseFloat(savedRate));
        }
        // Resume from last saved position if this is the same track.
        // Skip for streaming tracks (their URL/buffer can't reliably seek before playing).
        const isStream = track.id.startsWith('stream-');
        if (!isStream) {
          try {
            const saved = localStorage.getItem('pocket-mp3-last-position');
            if (saved) {
              const parsed = JSON.parse(saved) as { trackId: string; position: number };
              if (parsed.trackId === track.id && parsed.position > 2 && parsed.position < trackDuration - 2) {
                sound.seek(parsed.position);
                setCurrentTime(parsed.position);
                console.log(`⏯️ Resumed "${track.title}" at ${Math.floor(parsed.position)}s`);
              }
            }
          } catch {}
        }
        // If this track was queued for immediate playback (e.g. stream "Play now"), start it.
        if (autoplayTrackIdRef.current === track.id) {
          autoplayTrackIdRef.current = null;
          try {
            if (Howler.ctx && Howler.ctx.state === 'suspended') {
              Howler.ctx.resume().catch(() => {});
            }
            sound.play();
          } catch (err) {
            console.error('Autoplay failed:', err);
          }
        }
      },
      onplay: () => {
        setIsPlaying(true);
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }

        timeUpdateIntervalRef.current = window.setInterval(() => {
          if (sound.playing()) {
            const pos = sound.seek();
            setCurrentTime(pos);
            // Persist position for resume-after-refresh
            try {
              localStorage.setItem('pocket-mp3-last-position', JSON.stringify({
                trackId: track.id,
                position: typeof pos === 'number' ? pos : 0,
              }));
            } catch {}
            if ('mediaSession' in navigator && sound.duration() && isFinite(sound.duration())) {
              try {
                navigator.mediaSession.setPositionState({
                  duration: sound.duration(),
                  playbackRate: sound.rate(),
                  position: Math.min(sound.seek(), sound.duration())
                });
              } catch (err) {}
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
      },
      onend: () => {
        if (timeUpdateIntervalRef.current) {
          clearInterval(timeUpdateIntervalRef.current);
        }
        // Clear saved position on natural end
        try { localStorage.removeItem('pocket-mp3-last-position'); } catch {}

        const currentRepeat = repeatModeRef.current;
        console.log('🎵 Track ended - repeat mode:', currentRepeat);

        if (currentRepeat === 'one') {
          sound.seek(0);
          sound.play();
        } else if (currentRepeat === 'all') {
          // Use ref to get latest playNext
          playNextRef.current();
        } else if (currentTrackIndexRef.current < playlistLengthRef.current - 1) {
          playNextRef.current();
        } else {
          setIsPlaying(false);
        }
      },
      onloaderror: (id, error) => {
        console.error('❌ Howler load error:', error, 'url:', track.url);
        setIsPlaying(false);
        autoplayTrackIdRef.current = null;
        if (repeatModeRef.current === 'all' && playlistLengthRef.current > 1) {
          setTimeout(() => playNextRef.current(), 500);
        }
      },
      onplayerror: (id, error) => {
        console.error('❌ Howler play error:', error);
        // Common on iOS / when audio context is suspended — try to recover
        if (Howler.ctx && Howler.ctx.state === 'suspended') {
          Howler.ctx.resume().then(() => {
            try { sound.play(); } catch {}
          }).catch(() => setIsPlaying(false));
        } else {
          setIsPlaying(false);
        }
      },
    });

    soundRef.current = sound;

    if (wasPlaying || autoplayTrackIdRef.current === track.id) {
      sound.play();
    }

    // Media Session API
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

      // Re-register action handlers each time to use fresh function refs
      navigator.mediaSession.setActionHandler('play', () => {
        console.log('📱 Media Session: play');
        if (soundRef.current) {
          if (isIOS && Howler.ctx && Howler.ctx.state === 'suspended') {
            Howler.ctx.resume().then(() => soundRef.current?.play()).catch(() => {});
          } else {
            soundRef.current.play();
          }
        }
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        console.log('📱 Media Session: pause');
        if (soundRef.current) soundRef.current.pause();
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        console.log('📱 Media Session: previoustrack');
        playPrevious();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        console.log('📱 Media Session: nexttrack');
        playNextRef.current();
      });
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        if (soundRef.current) {
          const newTime = Math.max(0, soundRef.current.seek() - 10);
          soundRef.current.seek(newTime);
          setCurrentTime(newTime);
        }
      });
      navigator.mediaSession.setActionHandler('seekforward', () => {
        if (soundRef.current) {
          const newTime = Math.min(soundRef.current.duration(), soundRef.current.seek() + 10);
          soundRef.current.seek(newTime);
          setCurrentTime(newTime);
        }
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined && soundRef.current) {
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
  }, [currentTrackIndex, playlist]);

  // Volume control with persistence
  useEffect(() => {
    if (soundRef.current) {
      soundRef.current.volume(volume);
    }
    Howler.volume(volume);
    localStorage.setItem('pocket-mp3-volume', volume.toString());
  }, [volume]);

  useEffect(() => {
    localStorage.setItem('pocket-mp3-shuffle', isShuffle.toString());
  }, [isShuffle]);

  useEffect(() => {
    localStorage.setItem('pocket-mp3-repeat', repeatMode);
  }, [repeatMode]);

  // Listen for playback rate changes
  useEffect(() => {
    const handleRateChange = (e: CustomEvent) => {
      if (soundRef.current) {
        soundRef.current.rate(e.detail);
      }
    };
    window.addEventListener('playbackRateChange', handleRateChange as EventListener);
    return () => window.removeEventListener('playbackRateChange', handleRateChange as EventListener);
  }, []);

  // Update loop setting when repeat mode changes
  useEffect(() => {
    if (soundRef.current) {
      soundRef.current.loop(repeatMode === 'one');
    }
  }, [repeatMode]);

  // iOS: Handle AudioContext resumption on visibility change (AirPods / lock screen)
  useEffect(() => {
    if (!isIOSDevice()) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && soundRef.current) {
        // When returning to the app, ensure audio context is resumed
        if (Howler.ctx && Howler.ctx.state === 'suspended') {
          Howler.ctx.resume().catch(() => {});
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Cleanup on hook unmount (e.g. navigating away from the player route).
  // Without this, the Howl keeps playing in the background; on return a fresh
  // Howl is created and we get two tracks playing in parallel + stacked FX.
  useEffect(() => {
    return () => {
      try {
        if (soundRef.current) {
          soundRef.current.off();
          soundRef.current.stop();
          soundRef.current.unload();
          soundRef.current = null;
        }
        if (timeUpdateIntervalRef.current) {
          clearInterval(timeUpdateIntervalRef.current);
          timeUpdateIntervalRef.current = null;
        }
      } catch (e) {
        console.warn('Audio cleanup on unmount failed', e);
      }
    };
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

  const playTrack = useCallback((index: number, autoplay = false) => {
    if (index >= 0 && index < playlist.length) {
      if (autoplay) {
        const t = playlist[index];
        if (t) autoplayTrackIdRef.current = t.id;
      }
      // If clicking the same index, the load effect won't refire — handle directly.
      if (index === currentTrackIndexRef.current && soundRef.current) {
        try {
          if (Howler.ctx && Howler.ctx.state === 'suspended') {
            Howler.ctx.resume().catch(() => {});
          }
          soundRef.current.play();
        } catch (err) {
          console.error('playTrack same-index play failed:', err);
        }
        return;
      }
      setCurrentTrackIndex(index);
    }
  }, [playlist]);

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

  const getAudioElement = useCallback((): HTMLMediaElement | null => {
    const node = (soundRef.current as any)?._sounds?.[0]?._node;
    return node instanceof HTMLMediaElement ? node : null;
  }, []);

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
    soundRef,
  };
};
