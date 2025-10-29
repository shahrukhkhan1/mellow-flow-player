import { useState, useRef, useEffect, useCallback } from 'react';

export interface Track {
  id: string;
  title: string;
  artist: string;
  url: string;
  cover?: string;
  duration?: number;
}

export const useAudioPlayer = (playlist: Track[]) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
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
    return (saved as 'off' | 'one' | 'all') || 'off';
  });

  // Initialize audio element
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous'; // Enable CORS for audio processing
    audioRef.current = audio;

    // Enhanced audio quality settings
    audio.setAttribute('playsinline', 'true');
    audio.preservesPitch = true; // Maintain pitch when changing playback rate
    
    // Request high-quality audio decoding
    if ('AudioContext' in window) {
      audio.setAttribute('preload', 'auto');
    }
    
    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

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

    // Update Media Session API for lock screen controls
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: 'Pocket MP3',
        artwork: track.cover ? [
          { src: track.cover, sizes: '512x512', type: 'image/png' }
        ] : []
      });

      navigator.mediaSession.setActionHandler('play', () => play());
      navigator.mediaSession.setActionHandler('pause', () => pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => playPrevious());
      navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime) {
          seek(details.seekTime);
        }
      });
    }
  }, [currentTrackIndex, playlist]);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      
      // Update position state for Media Session API
      if ('mediaSession' in navigator && audio.duration) {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate,
          position: audio.currentTime
        });
      }
    };

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

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError as any);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError as any);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [currentTrackIndex, playlist.length, repeatMode]);

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
      console.log('🎵 Starting playback - paused:', audio.paused, 'readyState:', audio.readyState, 'src:', audio.src.substring(0, 50));
      
      // Fade in effect
      audio.volume = 0;
      await audio.play();
      console.log('✅ Playback started successfully');
      
      // Gradually increase volume to target
      const fadeInDuration = 500; // ms
      const steps = 20;
      const stepTime = fadeInDuration / steps;
      const volumeStep = volume / steps;
      
      for (let i = 1; i <= steps; i++) {
        await new Promise(resolve => setTimeout(resolve, stepTime));
        if (audio.paused) break;
        audio.volume = Math.min(volumeStep * i, volume);
      }
      
      setIsPlaying(true);
    } catch (error) {
      console.error('❌ Error playing audio:', error);
      // Fallback: try playing without fade
      try {
        if (audioRef.current) {
          audioRef.current.volume = volume;
          await audioRef.current.play();
          setIsPlaying(true);
        }
      } catch (fallbackError) {
        console.error('❌ Fallback playback also failed:', fallbackError);
        setIsPlaying(false);
      }
    }
  }, [volume]);

  const pause = useCallback(async () => {
    if (!audioRef.current) return;
    
    const audio = audioRef.current;
    const currentVol = audio.volume;
    
    // Fade out effect
    const fadeOutDuration = 300; // ms
    const steps = 15;
    const stepTime = fadeOutDuration / steps;
    const volumeStep = currentVol / steps;
    
    for (let i = steps - 1; i >= 0; i--) {
      if (audio.paused) break;
      audio.volume = volumeStep * i;
      await new Promise(resolve => setTimeout(resolve, stepTime));
    }
    
    audio.pause();
    audio.volume = currentVol; // Restore volume for next play
    setIsPlaying(false);
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
    audioElement: audioRef.current,
  };
};
