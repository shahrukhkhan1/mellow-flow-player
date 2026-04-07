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

  // Keep refs in sync
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { currentTrackIndexRef.current = currentTrackIndex; }, [currentTrackIndex]);
  useEffect(() => { playlistLengthRef.current = playlist.length; }, [playlist.length]);

  const playNext = useCallback(() => {
    if (playlistLengthRef.current === 0) return;
    let nextIndex;
    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * playlistLengthRef.current);
    } else {
      nextIndex = (currentTrackIndexRef.current + 1) % playlistLengthRef.current;
    }
    setCurrentTrackIndex(nextIndex);
  }, [isShuffle]);

  const playPrevious = useCallback(() => {
    if (playlist.length === 0) return;
    if (soundRef.current && soundRef.current.seek() > 3) {
      soundRef.current.seek(0);
      setCurrentTime(0);
    } else {
      const prevIndex = currentTrackIndex === 0
        ? playlist.length - 1
        : currentTrackIndex - 1;
      setCurrentTrackIndex(prevIndex);
    }
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
      },
      onplay: () => {
        setIsPlaying(true);
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }

        timeUpdateIntervalRef.current = window.setInterval(() => {
          if (sound.playing()) {
            setCurrentTime(sound.seek());
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
      onerror: (id, error) => {
        console.error('❌ Howler error:', error);
        setIsPlaying(false);
        // On error, try to play next track (don't get stuck)
        if (repeatModeRef.current === 'all' && playlistLengthRef.current > 1) {
          console.log('⏭️ Skipping errored track...');
          setTimeout(() => playNextRef.current(), 500);
        }
      }
    });

    soundRef.current = sound;

    if (wasPlaying) {
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

  const getAudioElement = useCallback(() => {
    if (soundRef.current) {
      return (soundRef.current as any)._sounds[0]?._node;
    }
    return null;
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
