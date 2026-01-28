import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAudioPlayer, Track } from '@/hooks/useAudioPlayer';
import { useAudioEffects } from '@/hooks/useAudioEffects';
import { useAnalytics } from '@/hooks/useAnalytics';
import { usePlayTracking } from '@/hooks/usePlayTracking';
import { useAuth } from '@/hooks/useAuth';
import { useVideoRecorder } from '@/hooks/useVideoRecorder';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { AudioMotionVisualizer } from '@/components/AudioMotionVisualizer';
import { VisualizerSelector } from '@/components/VisualizerSelector';
import { EqualizerPanel } from '@/components/EqualizerPanel';
import { PlaylistManager } from '@/components/PlaylistManager';
import { UserMenu } from '@/components/UserMenu';
import { OnboardingDialog } from '@/components/OnboardingDialog';
import { RecordingControls } from '@/components/RecordingControls';
import { DevTools } from '@/components/DevTools';
import {
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Shuffle, 
  Repeat, 
  Repeat1,
  Volume2,
  VolumeX,
  Music,
  Upload,
  Trash2,
  List,
  X,
  Maximize2,
  Minimize2,
  Heart,
  BarChart3,
  Search,
  PictureInPicture2,
  Monitor
} from 'lucide-react';
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';
import { ShareButton } from '@/components/ShareButton';
import { toast } from 'sonner';
import { saveTrack, getAllTracks, deleteTrack, getTrack, toggleFavorite, getAllFavorites } from '@/lib/db';
import { uploadTrackToCloud, syncTracksFromCloud, deleteTrackFromCloud, performFullSync } from '@/lib/syncService';
import { isIOSDevice } from '@/lib/utils';

const formatTime = (seconds: number): string => {
  if (!isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const MusicPlayer = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [visualizerType, setVisualizerType] = useState<'bars' | 'wave' | 'circular' | 'spectrum' | 'particles' | 'waveform' | 'rings' | 'galaxy'>('bars');
  const [filesMap, setFilesMap] = useState<Map<string, File>>(new Map());
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);
  const [isFullscreenVisualizer, setIsFullscreenVisualizer] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [visualizerCanvas, setVisualizerCanvas] = useState<HTMLCanvasElement | null>(null);
  const [fullscreenVisualizerCanvas, setFullscreenVisualizerCanvas] = useState<HTMLCanvasElement | null>(null);
  const [showDevTools, setShowDevTools] = useState(false);
  const logoTapRef = useRef<{ count: number; lastTap: number }>({ count: 0, lastTap: 0 });
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const analytics = useAnalytics();

  // 5-tap gesture handler for dev tools
  const handleLogoTap = useCallback(() => {
    const now = Date.now();
    const TAP_THRESHOLD = 500; // 500ms between taps
    
    if (now - logoTapRef.current.lastTap > TAP_THRESHOLD) {
      logoTapRef.current.count = 1;
    } else {
      logoTapRef.current.count++;
    }
    logoTapRef.current.lastTap = now;
    
    if (logoTapRef.current.count >= 5) {
      logoTapRef.current.count = 0;
      setShowDevTools(true);
      analytics.trackEvent('open', 'dev_tools', 'gesture');
    }
  }, [analytics]);
  
  const {
    currentTrack,
    currentTrackIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    isShuffle,
    repeatMode,
    togglePlay,
    seek,
    playNext,
    playPrevious,
    playTrack,
    setVolume,
    toggleShuffle,
    toggleRepeat,
  } = useAudioPlayer(playlist);

  const {
    setEqualizer,
    toggleReverb,
    updateReverbAmount,
    updatePlaybackRate,
    resetAllSettings,
    reverbEnabled,
    reverbAmount,
    playbackRate,
    currentPreset,
    analyser,
    visualizerSource,
    isBypassMode,
    isReady: audioEffectsReady,
  } = useAudioEffects();

  // Video recorder for visualizer
  const { 
    isRecording, 
    formattedTime, 
    toggleRecording, 
    stopRecording,
    recordingMode,
    setRecordingMode 
  } = useVideoRecorder({
    trackTitle: currentTrack?.title,
    onRecordingComplete: (blob, filename) => {
      console.log(`Recording saved: ${filename} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
    },
  });

  // Auto-stop recording when music pauses or track ends
  const prevIsPlayingRef = useRef(isPlaying);
  const prevTrackIndexRef = useRef(currentTrackIndex);

  useEffect(() => {
    // Check if music was paused
    if (isRecording && prevIsPlayingRef.current && !isPlaying) {
      stopRecording();
      toast.info('Recording saved - music paused');
    }
    prevIsPlayingRef.current = isPlaying;
  }, [isPlaying, isRecording, stopRecording]);

  useEffect(() => {
    // Check if track changed (only in single mode)
    if (isRecording && recordingMode === 'single' && prevTrackIndexRef.current !== currentTrackIndex) {
      stopRecording();
      toast.info('Recording saved - track ended');
    }
    prevTrackIndexRef.current = currentTrackIndex;
  }, [currentTrackIndex, isRecording, recordingMode, stopRecording]);

  // Track play statistics
  usePlayTracking(currentTrack, isPlaying, currentTime);

  // Load tracks from cloud on mount if authenticated
  useEffect(() => {
    if (isAuthenticated) {
      syncFromCloud();
    }
  }, [isAuthenticated]);

  const syncFromCloud = async () => {
    if (!isAuthenticated || !user) return;
    
    try {
      setSyncStatus('syncing');
      
      // Step 1: Upload local tracks to cloud first
      const uploadResult = await performFullSync(user.id, (status) => {
        console.log('📤 Sync status:', status);
      });
      
      // Step 2: Download and cache cloud tracks that aren't local
      const downloadedTracks = await syncTracksFromCloud(user.id, (current, total, title) => {
        console.log(`📥 Downloading ${current}/${total}: ${title}`);
        toast.loading(`Downloading ${current}/${total}: ${title}`, { id: 'sync-download' });
      });
      
      if (downloadedTracks.length > 0) {
        toast.dismiss('sync-download');
      }
      
      // Step 3: Load everything from local IndexedDB (includes newly cached tracks)
      const allLocalTracks = await getAllTracks();
      setPlaylist(allLocalTracks);
      
      setSyncStatus('idle');
      
      const message = [];
      if (uploadResult.uploaded > 0) message.push(`Uploaded ${uploadResult.uploaded}`);
      if (downloadedTracks.length > 0) message.push(`Downloaded ${downloadedTracks.length}`);
      if (uploadResult.skipped > 0) message.push(`${uploadResult.skipped} already synced`);
      
      toast.success(message.length > 0 ? message.join(', ') : 'All synced!');
    } catch (error) {
      console.error('Sync error:', error);
      setSyncStatus('error');
      toast.dismiss('sync-download');
      toast.error('Failed to sync from cloud');
    }
  };

  // Picture-in-Picture toggle
  const togglePictureInPicture = useCallback(async () => {
    if (!visualizerCanvas && !fullscreenVisualizerCanvas) {
      toast.error('Visualizer not ready for Picture-in-Picture');
      return;
    }

    const canvas = fullscreenVisualizerCanvas || visualizerCanvas;
    if (!canvas) return;

    try {
      // Check if PiP is supported
      if (!document.pictureInPictureEnabled) {
        toast.error('Picture-in-Picture not supported in this browser');
        return;
      }

      // If already in PiP, exit
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        toast.success('Exited Picture-in-Picture');
        return;
      }

      // Create or reuse video element
      if (!pipVideoRef.current) {
        pipVideoRef.current = document.createElement('video');
        pipVideoRef.current.muted = true; // Audio comes from main player
        pipVideoRef.current.playsInline = true;
      }

      const video = pipVideoRef.current;
      const stream = canvas.captureStream(30);
      video.srcObject = stream;
      
      await video.play();
      await video.requestPictureInPicture();
      toast.success('Opened in Picture-in-Picture. Drag to external monitor!');
      analytics.trackFeature('pip', 'open');
    } catch (error) {
      console.error('PiP error:', error);
      toast.error('Failed to open Picture-in-Picture');
    }
  }, [visualizerCanvas, fullscreenVisualizerCanvas, analytics]);

  // Handle recording toggle
  const handleRecordingToggle = useCallback(() => {
    const canvas = isFullscreenVisualizer ? fullscreenVisualizerCanvas : visualizerCanvas;
    if (!canvas) {
      toast.error('Visualizer not ready for recording');
      return;
    }
    
    toggleRecording(canvas);
    if (!isRecording) {
      toast.success('Recording started');
      analytics.trackFeature('recording', 'start');
    } else {
      toast.success('Recording saved');
      analytics.trackFeature('recording', 'stop');
    }
  }, [isFullscreenVisualizer, fullscreenVisualizerCanvas, visualizerCanvas, toggleRecording, isRecording, analytics]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'arrowup':
          e.preventDefault();
          setVolume(Math.min(1, volume + 0.1));
          break;
        case 'arrowdown':
          e.preventDefault();
          setVolume(Math.max(0, volume - 0.1));
          break;
        case 'arrowleft':
          e.preventDefault();
          seek(Math.max(0, currentTime - 10));
          break;
        case 'arrowright':
          e.preventDefault();
          seek(Math.min(duration, currentTime + 10));
          break;
        case 'f':
          // Toggle fullscreen visualizer
          if (currentTrack) {
            setIsFullscreenVisualizer(prev => !prev);
          }
          break;
        case 'p':
          // Toggle Picture-in-Picture
          if (currentTrack) {
            togglePictureInPicture();
          }
          break;
        case 'r':
          // Toggle recording
          if (currentTrack && isPlaying) {
            handleRecordingToggle();
          }
          break;
        case 'escape':
          // Exit fullscreen visualizer
          if (isFullscreenVisualizer) {
            setIsFullscreenVisualizer(false);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [togglePlay, volume, setVolume, currentTime, duration, seek, currentTrack, togglePictureInPicture, handleRecordingToggle, isPlaying, isFullscreenVisualizer]);

  // Load cached songs on mount
  useEffect(() => {
    loadCachedTracks();
  }, []);

  const loadCachedTracks = async () => {
    try {
      const tracks = await getAllTracks();
      setPlaylist(tracks);
      
      // Load favorites
      const favs = await getAllFavorites();
      setFavorites(new Set(favs));
      
      // Check if onboarding has been completed
      const onboardingCompleted = localStorage.getItem('pocket-mp3-onboarding-completed');
      if (!onboardingCompleted) {
        setShowOnboarding(true);
      }
      
      analytics.trackEvent('load', 'cached_tracks', `${tracks.length} tracks`);
    } catch (error) {
      console.error('Error loading cached tracks:', error);
      analytics.trackError(`Load cached tracks failed: ${error}`);
    }
  };

  const handleToggleFavorite = async (trackId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const isFav = await toggleFavorite(trackId);
      setFavorites(prev => {
        const newSet = new Set(prev);
        if (isFav) {
          newSet.add(trackId);
          toast.success('Added to favorites');
        } else {
          newSet.delete(trackId);
          toast.success('Removed from favorites');
        }
        return newSet;
      });
      analytics.trackEvent('favorite', isFav ? 'add' : 'remove', trackId);
    } catch (error) {
      console.error('Error toggling favorite:', error);
      toast.error('Failed to update favorite');
    }
  };

  // Only request wake lock when visualizer is active (better for background playback)
  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && isPlaying && document.visibilityState === 'visible') {
        try {
          wakeLock = await (navigator as any).wakeLock.request('screen');
          console.log('✅ Wake lock acquired');
        } catch (err) {
          console.log('Wake Lock error:', err);
        }
      }
    };

    const releaseWakeLock = () => {
      if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
        console.log('🔓 Wake lock released');
      }
    };

    // Only get wake lock when visible and playing
    if (isPlaying && document.visibilityState === 'visible') {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    // Release wake lock when page becomes hidden
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        releaseWakeLock();
      } else if (isPlaying) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      releaseWakeLock();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPlaying]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const files = event.target.files;
      if (!files) return;

      const newTracks: Track[] = [];
      const duplicates: string[] = [];
      const newFilesMap = new Map(filesMap);

      const skippedFiles: string[] = [];
      
      for (const file of Array.from(files)) {
        // Only accept MP3 files - check both extension and MIME type for iOS compatibility
        const isMP3 = file.name.toLowerCase().endsWith('.mp3') || 
                      file.type === 'audio/mpeg' || 
                      file.type === 'audio/mp3';
        
        if (!isMP3) {
          skippedFiles.push(file.name);
          continue;
        }
        
        const title = file.name.replace(/\.[^/.]+$/, '');
        
        // Check for duplicates
        const isDuplicate = playlist.some(t => 
          t.title.toLowerCase() === title.toLowerCase()
        );
        
        if (isDuplicate) {
          duplicates.push(title);
          continue;
        }
        
        const url = URL.createObjectURL(file);
        const track: Track = {
          id: crypto.randomUUID(), // Use proper UUID for database compatibility
          title,
          artist: 'Unknown Artist',
          url,
        };
        newTracks.push(track);
        newFilesMap.set(track.id, file);
        
        // Cache to IndexedDB
        await saveTrack(track, file);
      }
      
      if (skippedFiles.length > 0) {
        toast.error(`Only MP3 files are supported. Skipped: ${skippedFiles.length} file(s)`);
      }

      if (newTracks.length > 0) {
        setPlaylist(prev => [...prev, ...newTracks]);
        setFilesMap(newFilesMap);
        toast.success(`Added ${newTracks.length} track${newTracks.length > 1 ? 's' : ''}`);
        analytics.trackEvent('upload', 'tracks', `${newTracks.length} tracks`, newTracks.length);
        
        // Auto-sync to cloud if authenticated
        if (isAuthenticated && user) {
          setSyncStatus('syncing');
          try {
            for (const track of newTracks) {
              const file = newFilesMap.get(track.id);
              if (file) {
                await uploadTrackToCloud(track, file, user.id);
              }
            }
            setSyncStatus('idle');
            toast.success('Synced to cloud');
          } catch (error) {
            console.error('Cloud sync error:', error);
            setSyncStatus('error');
            toast.error('Failed to sync to cloud');
          }
        }
      }
      
      if (duplicates.length > 0) {
        toast.info(`Skipped ${duplicates.length} duplicate${duplicates.length > 1 ? 's' : ''}`);
      }
    } catch (error) {
      console.error('Error uploading tracks:', error);
      toast.error('Failed to upload tracks');
      analytics.trackError(`Upload failed: ${error}`);
    }
  };

  const handleDeleteTrack = async (trackId: string) => {
    try {
      await deleteTrack(trackId);
      setPlaylist(prev => prev.filter(t => t.id !== trackId));
      
      // Delete from cloud if authenticated
      if (isAuthenticated && user) {
        try {
          await deleteTrackFromCloud(trackId, user.id);
        } catch (error) {
          console.error('Failed to delete from cloud:', error);
        }
      }
      
      toast.success('Track deleted');
      analytics.trackEvent('delete', 'track', trackId);
    } catch (error) {
      console.error('Error deleting track:', error);
      toast.error('Failed to delete track');
      analytics.trackError(`Delete failed: ${error}`);
    }
  };

  const handleLoadPlaylist = async (trackIds: string[]) => {
    try {
      const tracks = await Promise.all(trackIds.map(id => getTrack(id)));
      setPlaylist(tracks.filter(Boolean) as Track[]);
      analytics.trackEvent('load', 'playlist', `${trackIds.length} tracks`);
    } catch (error) {
      console.error('Error loading playlist:', error);
      toast.error('Failed to load playlist');
      analytics.trackError(`Load playlist failed: ${error}`);
    }
  };

  const handleSeek = (value: number[]) => {
    seek(value[0]);
  };

  const handleVolumeChange = (value: number[]) => {
    setVolume(value[0]);
  };
  
  const handleVolumeTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  const toggleMute = () => {
    setVolume(volume === 0 ? 1 : 0);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-player-bg flex flex-col">
      <PWAInstallPrompt />
      <OnboardingDialog open={showOnboarding} onOpenChange={setShowOnboarding} />
      <DevTools isOpen={showDevTools} onClose={() => setShowDevTools(false)} />
      
      {/* Header */}
      <header className="safe-top safe-left safe-right p-4 md:p-6 border-b border-border/50">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div 
            className="flex items-center gap-2 md:gap-3 cursor-pointer select-none"
            onClick={handleLogoTap}
            role="button"
            tabIndex={0}
            aria-label="Pocket MP3 - Tap 5 times for dev tools"
          >
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
              <Music className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <h1 className="text-lg md:text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Pocket MP3
            </h1>
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/statistics')}
              className="gap-2"
              title="View statistics"
            >
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Stats</span>
            </Button>
            <ShareButton />
            <PlaylistManager currentPlaylist={playlist} onLoadPlaylist={handleLoadPlaylist} />
            <label htmlFor="file-upload">
              <Button variant="outline" size="sm" className="gap-2 cursor-pointer" asChild>
                <span>
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">Add Music</span>
                </span>
              </Button>
              <input
                id="file-upload"
                type="file"
                accept="*/*"
                multiple
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
            <UserMenu syncStatus={syncStatus} onSyncNow={syncFromCloud} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto safe-bottom">
        <div className="max-w-4xl mx-auto p-4 md:p-6 safe-left safe-right">
          {/* Visualizer */}
          {currentTrack && (
            <div className="mb-4 md:mb-6">
              <div className="h-64 md:h-48 bg-card/50 backdrop-blur rounded-2xl border border-primary/20 overflow-hidden mb-3 md:mb-4 relative visualizer-container">
                <AudioMotionVisualizer
                  type={visualizerType} 
                  isPlaying={isPlaying} 
                  onCanvasReady={setVisualizerCanvas}
                />
                
                {/* Visualizer Controls Overlay */}
                <div className="absolute top-2 right-2 flex gap-1.5">
                  {/* Recording Control */}
                  {isPlaying && (
                    <RecordingControls
                      isRecording={isRecording}
                      recordingTime={formattedTime}
                      onToggleRecording={handleRecordingToggle}
                      recordingMode={recordingMode}
                      onModeChange={setRecordingMode}
                      compact
                    />
                  )}
                  
                  {/* PiP Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={togglePictureInPicture}
                    className="h-8 px-2 gap-1.5 text-xs"
                    title="Picture-in-Picture (P)"
                  >
                    <PictureInPicture2 className="w-3 h-3" />
                  </Button>
                  
                  {/* Fullscreen Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Use native fullscreen API for mobile
                      const container = document.querySelector('.visualizer-container');
                      if (container && container.requestFullscreen) {
                        container.requestFullscreen().catch(() => {
                          // Fallback to our fullscreen overlay
                          setIsFullscreenVisualizer(true);
                        });
                      } else {
                        setIsFullscreenVisualizer(true);
                      }
                    }}
                    className="h-8 px-2 gap-1.5 text-xs"
                    title="Fullscreen visualizer (F)"
                  >
                    <Maximize2 className="w-3 h-3" />
                  </Button>
                </div>
                
                {/* Keyboard hints */}
                <div className="absolute bottom-2 left-2 text-[10px] text-muted-foreground/50 hidden md:block">
                  F: Fullscreen · P: PiP · R: Record
                </div>
              </div>
              <div className="flex justify-center">
                <VisualizerSelector currentType={visualizerType} onTypeChange={setVisualizerType} compact className="md:hidden" />
                <div className="hidden md:block">
                  <VisualizerSelector currentType={visualizerType} onTypeChange={setVisualizerType} />
                </div>
              </div>
            </div>
          )}

          {/* Current Track Display */}
          {currentTrack ? (
            <div className="mb-6 md:mb-8 text-center">
              <div className="flex items-center justify-center gap-3 mb-2">
                <h2 className="text-xl md:text-3xl font-bold px-4 truncate">{currentTrack.title}</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleToggleFavorite(currentTrack.id)}
                  className="rounded-full shrink-0"
                >
                  <Heart 
                    className={`w-5 h-5 transition-all ${
                      favorites.has(currentTrack.id) 
                        ? 'fill-red-500 text-red-500' 
                        : 'text-muted-foreground hover:text-red-400'
                    }`} 
                  />
                </Button>
              </div>
              <p className="text-muted-foreground text-sm md:text-lg truncate px-4">{currentTrack.artist}</p>
            </div>
          ) : (
            <div className="mb-6 md:mb-8 text-center py-12 md:py-20">
              <div className="w-24 h-24 md:w-32 md:h-32 mx-auto mb-4 md:mb-6 rounded-2xl bg-muted flex items-center justify-center">
                <Music className="w-12 h-12 md:w-16 md:h-16 text-muted-foreground/40" />
              </div>
              <h2 className="text-xl md:text-2xl font-bold mb-2">No tracks loaded</h2>
              <p className="text-muted-foreground text-sm md:text-base">Upload your music to get started</p>
            </div>
          )}

          {/* Player Controls - Moved before playlist */}
          {currentTrack && (
            <div className="mb-4 md:mb-8 p-4 md:p-6 bg-card/50 backdrop-blur rounded-2xl border border-border/50">
              {/* Progress Bar */}
              <div className="mb-6">
                <Slider
                  value={[currentTime]}
                  max={duration || 100}
                  step={0.1}
                  onValueChange={handleSeek}
                  className="cursor-pointer"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Controls */}
              <div className="space-y-4">
                {/* Main playback controls - centered */}
                <div className="flex items-center justify-center gap-3 md:gap-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      playPrevious();
                      analytics.trackPlayback('previous', currentTrack.title);
                    }}
                    className="rounded-full"
                  >
                    <SkipBack className="w-5 h-5" />
                  </Button>
                  <Button
                    size="icon"
                    onClick={() => {
                      togglePlay();
                      analytics.trackPlayback(isPlaying ? 'pause' : 'play', currentTrack.title);
                    }}
                    className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-gradient-to-br from-primary to-primary-glow shadow-glow"
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5 md:w-6 md:h-6" />
                    ) : (
                      <Play className="w-5 h-5 md:w-6 md:h-6 ml-1" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      playNext();
                      analytics.trackPlayback('next', currentTrack.title);
                    }}
                    className="rounded-full"
                  >
                    <SkipForward className="w-5 h-5" />
                  </Button>
                </div>

                {/* Secondary controls */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <EqualizerPanel
                      currentPreset={currentPreset}
                      onPresetChange={(preset) => {
                        setEqualizer(preset);
                        analytics.trackFeature('equalizer', preset);
                      }}
                      reverbEnabled={reverbEnabled}
                      reverbAmount={reverbAmount}
                      onReverbToggle={() => {
                        toggleReverb();
                        analytics.trackFeature('reverb', !reverbEnabled ? 'on' : 'off');
                      }}
                      onReverbAmountChange={updateReverbAmount}
                      playbackRate={playbackRate}
                      onPlaybackRateChange={(rate) => {
                        updatePlaybackRate(rate);
                        analytics.trackFeature('playback_rate', rate.toString());
                      }}
                      onResetSettings={() => {
                        resetAllSettings();
                        analytics.trackFeature('reset_settings', 'all');
                        toast.success('Settings reset to default');
                      }}
                      isBypassMode={isBypassMode}
                    />
                    <Button
                      variant={isShuffle ? 'default' : 'ghost'}
                      size="icon"
                      onClick={() => {
                        toggleShuffle();
                        analytics.trackFeature('shuffle', !isShuffle ? 'on' : 'off');
                      }}
                      className="rounded-full"
                    >
                      <Shuffle className="w-4 h-4" />
                    </Button>
                    <Button
                      variant={repeatMode !== 'off' ? 'default' : 'ghost'}
                      size="icon"
                      onClick={() => {
                        toggleRepeat();
                        analytics.trackFeature('repeat', repeatMode);
                      }}
                      className="rounded-full"
                    >
                      {repeatMode === 'one' ? (
                        <Repeat1 className="w-4 h-4" />
                      ) : (
                        <Repeat className="w-4 h-4" />
                      )}
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 min-w-[120px]">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggleMute}
                      className="rounded-full flex-shrink-0"
                    >
                      {volume === 0 ? (
                        <VolumeX className="w-4 h-4" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </Button>
                    <div className="flex-1" onTouchStart={handleVolumeTouchStart}>
                      <Slider
                        value={[volume]}
                        max={1}
                        step={0.01}
                        onValueChange={handleVolumeChange}
                        className="cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Playlist Toggle Button (Mobile) */}
          {playlist.length > 0 && (
            <div className="mt-4 space-y-3">
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => setIsPlaylistOpen(!isPlaylistOpen)}
              >
                {isPlaylistOpen ? <X className="w-4 h-4" /> : <List className="w-4 h-4" />}
                {isPlaylistOpen ? 'Hide' : 'Show'} Playlist ({playlist.length})
              </Button>
              
              {/* Search Input */}
              {isPlaylistOpen && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search tracks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              )}
            </div>
          )}

          {/* Playlist */}
          {playlist.length > 0 && isPlaylistOpen && (
            <div className="space-y-2 mt-4 max-h-[60vh] overflow-y-auto">
              {playlist.filter(track => {
                if (!searchQuery) return true;
                const query = searchQuery.toLowerCase();
                return track.title.toLowerCase().includes(query) || 
                       track.artist.toLowerCase().includes(query);
              }).map((track, index) => {
                const originalIndex = playlist.indexOf(track);
                return (
                  <button
                    key={track.id}
                    onClick={() => {
                      playTrack(originalIndex);
                      analytics.trackEvent('click', 'playlist', track.title);
                    }}
                    className={`w-full p-3 md:p-4 rounded-lg text-left transition-all ${
                      originalIndex === currentTrackIndex
                        ? 'bg-primary/10 border border-primary/30'
                        : 'bg-card hover:bg-card/80 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3 md:gap-4">
                      <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        originalIndex === currentTrackIndex 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {originalIndex === currentTrackIndex && isPlaying ? (
                          <div className="flex gap-1">
                            <div className="w-1 h-3 md:h-4 bg-current animate-pulse" style={{ animationDelay: '0ms' }} />
                            <div className="w-1 h-3 md:h-4 bg-current animate-pulse" style={{ animationDelay: '150ms' }} />
                            <div className="w-1 h-3 md:h-4 bg-current animate-pulse" style={{ animationDelay: '300ms' }} />
                          </div>
                        ) : (
                          <span className="text-xs md:text-sm font-medium">{originalIndex + 1}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-sm md:text-base">{track.title}</p>
                        <p className="text-xs md:text-sm text-muted-foreground truncate">{track.artist}</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => handleToggleFavorite(track.id, e)}
                          className="h-8 w-8"
                        >
                          <Heart 
                            className={`w-4 h-4 transition-all ${
                              favorites.has(track.id) 
                                ? 'fill-red-500 text-red-500' 
                                : 'text-muted-foreground hover:text-red-400'
                            }`} 
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTrack(track.id);
                          }}
                          className="h-8 w-8"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Fullscreen Visualizer Modal */}
      {isFullscreenVisualizer && currentTrack && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          {/* Header with controls */}
          <div className="safe-top safe-left safe-right p-4 flex items-center justify-between bg-background/95 backdrop-blur border-b border-border/50">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsFullscreenVisualizer(false)}
                className="shrink-0"
              >
                <Minimize2 className="w-5 h-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold truncate text-sm md:text-base">{currentTrack.title}</h3>
                <p className="text-xs text-muted-foreground truncate">{currentTrack.artist}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              {/* Recording Controls */}
              {isPlaying && (
                <RecordingControls
                  isRecording={isRecording}
                  recordingTime={formattedTime}
                  onToggleRecording={handleRecordingToggle}
                  compact
                />
              )}
              
              {/* PiP Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={togglePictureInPicture}
                className="h-8 px-2 gap-1.5"
                title="Picture-in-Picture (P)"
              >
                <PictureInPicture2 className="w-4 h-4" />
                <span className="hidden sm:inline text-xs">PiP</span>
              </Button>
              
              <VisualizerSelector currentType={visualizerType} onTypeChange={setVisualizerType} compact />
              <EqualizerPanel
                currentPreset={currentPreset}
                onPresetChange={(preset) => {
                  setEqualizer(preset);
                  analytics.trackFeature('equalizer', preset);
                }}
                reverbEnabled={reverbEnabled}
                reverbAmount={reverbAmount}
                onReverbToggle={() => {
                  toggleReverb();
                  analytics.trackFeature('reverb', !reverbEnabled ? 'on' : 'off');
                }}
                onReverbAmountChange={updateReverbAmount}
                playbackRate={playbackRate}
                onPlaybackRateChange={(rate) => {
                  updatePlaybackRate(rate);
                  analytics.trackFeature('playback_rate', rate.toString());
                }}
                onResetSettings={() => {
                  resetAllSettings();
                  analytics.trackFeature('reset_settings', 'all');
                  toast.success('Settings reset to default');
                }}
                isBypassMode={isBypassMode}
              />
            </div>
          </div>

          {/* Fullscreen Visualizer */}
          <div className="flex-1 relative overflow-hidden">
            <AudioMotionVisualizer 
              type={visualizerType} 
              isPlaying={isPlaying} 
              onCanvasReady={setFullscreenVisualizerCanvas}
            />
            
            {/* Casting hint */}
            <div className="absolute bottom-4 left-4 text-xs text-muted-foreground/60 hidden md:block bg-background/50 px-2 py-1 rounded">
              Press ESC to exit · P for Picture-in-Picture · R to record
            </div>
          </div>

          {/* Playback controls overlay */}
          <div className="safe-bottom safe-left safe-right p-4 bg-background/95 backdrop-blur border-t border-border/50">
            {/* Progress Bar */}
            <div className="mb-4">
              <Slider
                value={[currentTime]}
                max={duration || 100}
                step={0.1}
                onValueChange={handleSeek}
                className="cursor-pointer"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Main controls */}
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  playPrevious();
                  analytics.trackPlayback('previous', currentTrack.title);
                }}
                className="rounded-full"
              >
                <SkipBack className="w-5 h-5" />
              </Button>
              <Button
                size="icon"
                onClick={() => {
                  togglePlay();
                  analytics.trackPlayback(isPlaying ? 'pause' : 'play', currentTrack.title);
                }}
                className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary-glow shadow-glow"
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6" />
                ) : (
                  <Play className="w-6 h-6 ml-1" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  playNext();
                  analytics.trackPlayback('next', currentTrack.title);
                }}
                className="rounded-full"
              >
                <SkipForward className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
