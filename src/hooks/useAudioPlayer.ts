import { useState, useRef, useEffect, useCallback } from 'react';

export interface Track {
  id: string;
  title: string;
  artist: string;
  url: string;
  cover?: string;
  duration?: number;
}

export const useAudioPlayer = (playlist: Track[], audioElementFromDOM: HTMLAudioElement | null) => {
  const audioRef = useRef<HTMLAudioElement | null>(audioElementFromDOM);
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
    return (saved as 'off' | 'one' | 'all') || 'all'; // Default to 'all'
  });

  // Use audio element from DOM
  useEffect(() => {
    if (audioElementFromDOM) {
      audioRef.current = audioElementFromDOM;
      const audio = audioElementFromDOM;
      
      // Enhanced audio quality settings
      audio.preservesPitch = true;
      audio.preload = 'auto';
      
      console.log('🎵 Audio element from DOM initialized');
    }
  }, [audioElementFromDOM]);

  // Load track when index changes
  useEffect(() => {
    if (!audioRef.current || playlist.length === 0) return;

    const audio = audioRef.current;
    const track = playlist[currentTrackIndex];
    
    if (!track) return;

    const wasPlaying = isPlaying;
    audio.src = track.url;
    audio.load();
    
    // Apply saved playback rate
    const savedRate = localStorage.getItem('pocket-mp3-playback-rate');
    if (savedRate) {
      audio.playbackRate = parseFloat(savedRate);
    }
    
    // Auto-play if we were already playing
    if (wasPlaying) {
      audio.play().catch(console.error);
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

      // Set playback state explicitly
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
        seek(Math.max(0, audio.currentTime - 10));
      });
      navigator.mediaSession.setActionHandler('seekforward', () => {
        console.log('📱 Media Session: seekforward');
        seek(Math.min(audio.duration, audio.currentTime + 10));
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          console.log('📱 Media Session: seekto', details.seekTime);
          seek(details.seekTime);
        }
      });
    }
    
    // iOS background playback support
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && !audio.paused) {
        console.log('📱 App going to background, ensuring playback continues...');
        // Update media session state
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
      } else if (document.visibilityState === 'visible') {
        console.log('📱 App returning to foreground');
      }
    };
    
    const handlePageHide = () => {
      console.log('📱 Page hide event - iOS specific');
      // Ensure audio continues on iOS
      if (!audio.paused) {
        audio.play().catch(console.error);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [currentTrackIndex, playlist]);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };
    
    // Separate interval for more frequent Media Session position updates
    const positionUpdateInterval = setInterval(() => {
      if ('mediaSession' in navigator && audio.duration && isFinite(audio.duration) && !audio.paused) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate,
            position: Math.min(audio.currentTime, audio.duration)
          });
        } catch (err) {
          // Ignore errors from invalid position states
        }
      }
    }, 250); // Update every 250ms for smoother lock screen display

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleEnded = () => {
      // Handle song completion with fade out
      try {
        console.log('🎵 Track ended - repeat mode:', repeatMode);
        if (repeatMode === 'one') {
          // Repeat current song using play() callback for proper handling
          audio.currentTime = 0;
          play();
        } else if (repeatMode === 'all') {
          // Repeat all - go to next song
          playNext();
        } else if (currentTrackIndex < playlist.length - 1) {
          // Auto-play next song if not at end
          playNext();
        } else {
          // End of playlist
          setIsPlaying(false);
        }
      } catch (error) {
        console.error('Error handling track end:', error);
        setIsPlaying(false);
      }
    };

    const handleError = (e: ErrorEvent) => {
      console.error('Audio error:', e);
      setIsPlaying(false);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
      console.log('▶️ Playing');
    };
    
    const handlePause = () => {
      setIsPlaying(false);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
      console.log('⏸️ Paused');
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError as any);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      clearInterval(positionUpdateInterval);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError as any);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [currentTrackIndex, playlist.length, repeatMode, isPlaying]);

  // Volume control with persistence
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      localStorage.setItem('pocket-mp3-volume', volume.toString());
    }
  }, [volume]);

  // Persist shuffle and repeat settings
  useEffect(() => {
    localStorage.setItem('pocket-mp3-shuffle', isShuffle.toString());
  }, [isShuffle]);

  useEffect(() => {
    localStorage.setItem('pocket-mp3-repeat', repeatMode);
  }, [repeatMode]);

  const play = useCallback(async () => {
    if (!audioRef.current) return;
    
    try {
      const audio = audioRef.current;
      
      console.log('🎵 Starting playback...');
      
      // Set volume immediately (no fade for iOS compatibility)
      audio.volume = volume;
      
      // iOS requires immediate play() call without delays
      await audio.play();
      
      console.log('✅ Playback started successfully');
      setIsPlaying(true);
      
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
    } catch (error: any) {
      console.error('❌ Playback error:', error);
      setIsPlaying(false);
    }
  }, [volume]);

  const pause = useCallback(async () => {
    if (!audioRef.current) return;
    
    const audio = audioRef.current;
    console.log('⏸️ Pausing playback...');
    
    try {
      // Ensure smooth pause without glitches
      // Add small delay to let buffers flush
      await new Promise(resolve => setTimeout(resolve, 50));
      
      audio.pause();
      setIsPlaying(false);
      
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
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
    if (audioRef.current) {
      audioRef.current.currentTime = time;
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
    // Playback will start automatically via the load effect
  }, [currentTrackIndex, playlist.length, isShuffle]);

  const playPrevious = useCallback(() => {
    if (playlist.length === 0) return;

    if (currentTime > 3) {
      seek(0);
    } else {
      const prevIndex = currentTrackIndex === 0 
        ? playlist.length - 1 
        : currentTrackIndex - 1;
      setCurrentTrackIndex(prevIndex);
      // Playback will start automatically via the load effect
    }
  }, [currentTrackIndex, playlist.length, currentTime, seek]);

  const playTrack = useCallback((index: number) => {
    if (index >= 0 && index < playlist.length) {
      setCurrentTrackIndex(index);
      // Playback will start automatically via the load effect
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
  };
};
