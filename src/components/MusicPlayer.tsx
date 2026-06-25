import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAudioPlayer, Track } from '@/hooks/useAudioPlayer';
import { useAudioEffects } from '@/hooks/useAudioEffects';
import { useAudioFXStudio } from '@/hooks/useAudioFXStudio';
import { useAnalytics } from '@/hooks/useAnalytics';
import { usePlayTracking } from '@/hooks/usePlayTracking';
import { useAuth } from '@/hooks/useAuth';
import { useVideoRecorder } from '@/hooks/useVideoRecorder';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { AudioMotionVisualizer } from '@/components/AudioMotionVisualizer';
import { VisualizerSelector } from '@/components/VisualizerSelector';
import { VisualizerColorPicker, VisualizerColorScheme } from '@/components/VisualizerColorPicker';
import { EqualizerPanel } from '@/components/EqualizerPanel';
import { AudioFXStudio } from '@/components/AudioFXStudio';
import { PlaylistManager } from '@/components/PlaylistManager';
import { UserMenu } from '@/components/UserMenu';
import { OnboardingDialog } from '@/components/OnboardingDialog';
import { RecordingControls } from '@/components/RecordingControls';
import { VideoExportSuite } from '@/components/VideoExportSuite';
import { loadVideoExportConfig, VideoExportConfig } from '@/lib/videoExportConfig';
import { DevTools } from '@/components/DevTools';
import { WaveformSeekbar } from '@/components/WaveformSeekbar';
import { MetadataEditor } from '@/components/MetadataEditor';
import { PremiumModal } from '@/components/PremiumModal';
import { usePremium } from '@/hooks/usePremium';
import { Crown, Pencil, Lock } from 'lucide-react';
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
import { StorageUsageDisplay } from '@/components/StorageUsageDisplay';
import { SyncProgressBar, SyncProgress } from '@/components/SyncProgressBar';
import { toast } from 'sonner';
import { saveTrack, getAllTracks, deleteTrack, getTrack, toggleFavorite, getAllFavorites, cleanupDuplicateTracks } from '@/lib/db';
import { uploadTrackToCloud, syncTracksFromCloud, deleteTrackFromCloud, performFullSync, checkSyncNeeded } from '@/lib/syncService';

import { YouTubeSearch } from '@/components/YouTubeSearch';
import { SongRecommendations } from '@/components/SongRecommendations';
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
  const [visualizerColorScheme, setVisualizerColorScheme] = useState<VisualizerColorScheme>(() => {
    return (localStorage.getItem('pocket-mp3-visualizer-color') as VisualizerColorScheme) || 'default';
  });
  const [filesMap, setFilesMap] = useState<Map<string, File>>(new Map());
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);
  const [isFullscreenVisualizer, setIsFullscreenVisualizer] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilteredView, setIsFilteredView] = useState(false);
  const [fullPlaylistCache, setFullPlaylistCache] = useState<Track[] | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({ status: 'idle' });
  const [visualizerCanvas, setVisualizerCanvas] = useState<HTMLCanvasElement | null>(null);
  const [fullscreenVisualizerCanvas, setFullscreenVisualizerCanvas] = useState<HTMLCanvasElement | null>(null);
  const [showDevTools, setShowDevTools] = useState(false);
  const [showDiscoverMobile, setShowDiscoverMobile] = useState(false);
  const logoTapRef = useRef<{ count: number; lastTap: number }>({ count: 0, lastTap: 0 });
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const analytics = useAnalytics();
  const { isPremium, requirePremium } = usePremium();
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);

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
    getAudioElement,
    soundRef,
  } = useAudioPlayer(playlist);

  const {
    setEqualizer,
    toggleReverb,
    updateReverbAmount,
    updatePlaybackRate,
    resetAllSettings,
    connectHtml5Source,
    updateEnhancer,
    reverbEnabled,
    reverbAmount,
    playbackRate,
    currentPreset,
    analyser,
    visualizerSource,
    isBypassMode,
    isReady: audioEffectsReady,
    enhancerEnabled,
    enhancerPreset,
    loudnessAmount,
    stereoWidth,
    bassBoost,
    pitchSemitones,
    stereoPan,
    spatial8DEnabled,
    updatePitch,
    updateStereoPan,
    toggle8DSpatial,
    audioContextRef,
    limiterRef,
  } = useAudioEffects();

  const {
    ambience,
    setAmbienceLayer,
    baseBPM,
    updateBaseBPM,
    applyStylePreset,
  } = useAudioFXStudio({
    audioContextRef,
    limiterRef,
    isBypassMode,
    updatePitch,
    updatePlaybackRate,
    toggleReverb,
    updateReverbAmount,
    toggle8DSpatial,
    updateStereoPan,
  });


  // Video Export Suite config (aspect ratio / background / overlay)
  const [videoExportConfig, setVideoExportConfig] = useState<VideoExportConfig>(
    () => loadVideoExportConfig(),
  );
  const videoExportConfigRef = useRef<VideoExportConfig>(videoExportConfig);
  useEffect(() => { videoExportConfigRef.current = videoExportConfig; }, [videoExportConfig]);

  // Video recorder for visualizer
  const {
    isRecording,
    formattedTime,
    toggleRecording,
    stopRecording,
    recordingMode,
    setRecordingMode,
    resolution,
    setResolution,
  } = useVideoRecorder({
    trackTitle: currentTrack?.title,
    getExportConfig: () => videoExportConfigRef.current,
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

  // Connect HTML5 audio elements to effects chain (for streaming tracks on non-iOS)
  useEffect(() => {
    if (!isPlaying || !currentTrack || !audioEffectsReady || isBypassMode) return;
    const isHtml5Stream = currentTrack.id.startsWith('stream-') || (currentTrack.url.startsWith('http') && !currentTrack.url.includes('supabase'));
    if (!isHtml5Stream) return;
    
    // Small delay to ensure Howl has created the audio element
    const timer = setTimeout(() => {
      const audioEl = getAudioElement();
      if (audioEl) {
        connectHtml5Source(audioEl);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [isPlaying, currentTrackIndex, audioEffectsReady, isBypassMode, connectHtml5Source, getAudioElement, currentTrack]);

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
      setSyncProgress({ status: 'checking' });
      
      // Step 1: Check what needs syncing (smart sync)
      const syncNeeded = await checkSyncNeeded(user.id);
      console.log('📊 Sync check:', syncNeeded);
      
      // Skip if nothing to sync
      if (syncNeeded.needsUpload === 0 && syncNeeded.needsDownload === 0) {
        setSyncStatus('idle');
        setSyncProgress({ status: 'complete' });
        toast.success(`Already synced (${syncNeeded.localCount} tracks)`);
        setTimeout(() => setSyncProgress({ status: 'idle' }), 2000);
        return;
      }
      
      // Step 2: Upload local tracks to cloud if needed
      if (syncNeeded.needsUpload > 0) {
        setSyncProgress({ status: 'uploading', totalTracks: syncNeeded.needsUpload, currentIndex: 0 });
        const uploadResult = await performFullSync(user.id, (status) => {
          console.log('📤 Sync status:', status);
        });
        console.log('📤 Upload result:', uploadResult);
      }
      
      // Step 3: Download and cache cloud tracks that aren't local
      if (syncNeeded.needsDownload > 0) {
        const downloadedTracks = await syncTracksFromCloud(user.id, (current, total, title, bytesDownloaded, totalBytes) => {
          console.log(`📥 Downloading ${current}/${total}: ${title}`);
          setSyncProgress({ 
            status: 'downloading', 
            currentTrack: title,
            currentIndex: current,
            totalTracks: total,
            bytesDownloaded,
            totalBytes
          });
        });
        console.log(`📥 Downloaded ${downloadedTracks.length} tracks`);
      }
      
      // Step 4: Load everything from local IndexedDB (includes newly cached tracks)
      const allLocalTracks = await getAllTracks();
      setPlaylist(allLocalTracks);
      
      setSyncStatus('idle');
      setSyncProgress({ status: 'complete' });
      
      const messages = [];
      if (syncNeeded.needsUpload > 0) messages.push(`Uploaded ${syncNeeded.needsUpload}`);
      if (syncNeeded.needsDownload > 0) messages.push(`Downloaded ${syncNeeded.needsDownload}`);
      
      toast.success(messages.join(', ') || 'Sync complete!');
      setTimeout(() => setSyncProgress({ status: 'idle' }), 2000);
    } catch (error) {
      console.error('Sync error:', error);
      setSyncStatus('error');
      setSyncProgress({ status: 'error' });
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
        case 'j':
          e.preventDefault();
          seek(Math.max(0, currentTime - 10));
          break;
        case 'arrowright':
        case 'l':
          e.preventDefault();
          seek(Math.min(duration, currentTime + 10));
          break;
        case 'n':
          // Next track
          e.preventDefault();
          playNext();
          break;
        case 'b':
          // Previous track
          e.preventDefault();
          playPrevious();
          break;
        case 'm':
          // Mute toggle
          e.preventDefault();
          setVolume(volume === 0 ? 1 : 0);
          break;
        case 's':
          // Shuffle toggle
          e.preventDefault();
          toggleShuffle();
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
  }, [togglePlay, volume, setVolume, currentTime, duration, seek, currentTrack, togglePictureInPicture, handleRecordingToggle, isPlaying, isFullscreenVisualizer, playNext, playPrevious, toggleShuffle]);

  // Load cached songs on mount
  useEffect(() => {
    loadCachedTracks();
  }, []);

  const loadCachedTracks = async () => {
    try {
      // Cleanup any duplicate tracks first to save memory
      const cleaned = await cleanupDuplicateTracks();
      if (cleaned > 0) {
        console.log(`🧹 Removed ${cleaned} duplicate tracks from storage`);
      }
      
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
        setPlaylist(prev => [...newTracks, ...prev]);
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
      // Cache the full playlist before switching to a filtered view
      setFullPlaylistCache(playlist);
      setIsFilteredView(true);
      const tracks = await Promise.all(trackIds.map(id => getTrack(id)));
      setPlaylist(tracks.filter(Boolean) as Track[]);
      analytics.trackEvent('load', 'playlist', `${trackIds.length} tracks`);
    } catch (error) {
      console.error('Error loading playlist:', error);
      toast.error('Failed to load playlist');
      analytics.trackError(`Load playlist failed: ${error}`);
    }
  };

  const handleBackToAllSongs = async () => {
    if (fullPlaylistCache) {
      setPlaylist(fullPlaylistCache);
    } else {
      const allTracks = await getAllTracks();
      setPlaylist(allTracks);
    }
    setIsFilteredView(false);
    setFullPlaylistCache(null);
    toast.success('Back to all songs');
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

  // Premium-gated wrappers
  const renderExportButton = (compact: boolean) => {
    if (isPremium) {
      return (
        <VideoExportSuite config={videoExportConfig} onChange={setVideoExportConfig} compact={compact} />
      );
    }
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => requirePremium('Video Export')}
        className={compact ? 'h-8 px-2 text-xs gap-1.5 relative' : 'h-9 px-3 text-sm gap-1.5 relative'}
        title="Premium feature"
      >
        <Lock className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
        <span className="hidden sm:inline">Export</span>
        <Crown className="w-2.5 h-2.5 absolute -top-1 -right-1 text-primary fill-primary" />
      </Button>
    );
  };

  const handleStylePreset = (preset: Parameters<typeof applyStylePreset>[0]) => {
    if (preset === '8d-spatial' && !requirePremium('8D Spatial Audio')) return;
    applyStylePreset(preset);
    analytics.trackFeature('fx_preset', preset);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-player-bg flex flex-col">
      <PWAInstallPrompt />
      <OnboardingDialog open={showOnboarding} onOpenChange={setShowOnboarding} />
      <DevTools isOpen={showDevTools} onClose={() => setShowDevTools(false)} />
      
      {/* Header */}
      <header className="safe-top safe-left safe-right px-3 py-3 md:px-6 md:py-4 border-b border-border/50">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
          <div 
            className="flex items-center gap-2 shrink-0 cursor-pointer select-none"
            onClick={handleLogoTap}
            role="button"
            tabIndex={0}
            aria-label="Pocket MP3 - Tap 5 times for dev tools"
          >
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-glow">
              <Music className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <h1 className="text-lg md:text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent hidden sm:block">
              Pocket MP3
            </h1>
          </div>
          
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/statistics')}
              className="gap-1.5 h-8 px-2 sm:px-3"
              title="View statistics"
            >
              <BarChart3 className="w-4 h-4" />
              <span className="hidden lg:inline text-xs">Stats</span>
            </Button>
            <ShareButton />
            {isAuthenticated && user ? (
              <>
                <YouTubeSearch 
                  userId={user.id} 
                  onTrackImported={(track) => {
                    setPlaylist(prev => [track, ...prev]);
                  }}
                  onStreamTrack={(track) => {
                    setPlaylist(prev => {
                      const exists = prev.some(t => t.id === track.id);
                      if (exists) {
                        const existingIdx = prev.findIndex(t => t.id === track.id);
                        setTimeout(() => playTrack(existingIdx, true), 0);
                        return prev;
                      }
                      const newIdx = prev.length;
                      const next = [...prev, track];
                      // Wait for React to commit the new playlist before changing index,
                      // so the load effect sees the new track at newIdx.
                      setTimeout(() => playTrack(newIdx, true), 60);
                      return next;
                    });
                  }}
                />
              </>
            ) : (
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-1.5 h-8 px-2 sm:px-3"
                onClick={() => navigate('/auth')}
              >
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline text-xs">Search</span>
              </Button>
            )}
            <PlaylistManager currentPlaylist={playlist} onLoadPlaylist={handleLoadPlaylist} />
            <label htmlFor="file-upload">
              <Button variant="outline" size="sm" className="gap-1.5 h-8 px-2 sm:px-3 cursor-pointer" asChild>
                <span>
                  <Upload className="w-4 h-4" />
                  <span className="hidden lg:inline text-xs">Add Music</span>
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
        <div className="max-w-5xl mx-auto p-3 sm:p-4 md:p-6 safe-left safe-right">
          {/* Sync Progress Bar */}
          {syncProgress.status !== 'idle' && (
            <SyncProgressBar progress={syncProgress} className="mb-4" />
          )}
          {/* Visualizer */}
          {currentTrack && (
            <div className="mb-3 md:mb-6">
              <div className="h-40 sm:h-56 md:h-72 lg:h-80 bg-card/50 backdrop-blur rounded-2xl border border-primary/20 overflow-hidden mb-2 md:mb-4 relative visualizer-container">
                <AudioMotionVisualizer
                  type={visualizerType} 
                  isPlaying={isPlaying} 
                  onCanvasReady={setVisualizerCanvas}
                  colorScheme={visualizerColorScheme}
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
                      resolution={resolution}
                      onResolutionChange={setResolution}
                      compact
                    />
                  )}

                  {/* Video Export Suite (premium) */}
                  {renderExportButton(true)}

                  
                  {/* Color Picker */}
                  <VisualizerColorPicker
                    currentScheme={visualizerColorScheme}
                    onSchemeChange={(scheme) => {
                      setVisualizerColorScheme(scheme);
                      localStorage.setItem('pocket-mp3-visualizer-color', scheme);
                    }}
                  />
                  
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
                      const container = document.querySelector('.visualizer-container');
                      if (container && container.requestFullscreen) {
                        container.requestFullscreen().catch(() => {
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
            <div className="mb-3 md:mb-8 text-center">
              <div className="flex items-center justify-center gap-2 md:gap-3 mb-1">
                <h2 className="text-base md:text-3xl font-bold px-2 md:px-4 truncate">{currentTrack.title}</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleToggleFavorite(currentTrack.id)}
                  className="rounded-full shrink-0 h-8 w-8 md:h-10 md:w-10"
                >
                  <Heart 
                    className={`w-4 h-4 md:w-5 md:h-5 transition-all ${
                      favorites.has(currentTrack.id) 
                        ? 'fill-red-500 text-red-500' 
                        : 'text-muted-foreground hover:text-red-400'
                    }`} 
                  />
                </Button>
              </div>
              <p className="text-muted-foreground text-xs md:text-lg truncate px-4">{currentTrack.artist}</p>
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
            <div className="mb-3 md:mb-8 p-3 md:p-6 bg-card/50 backdrop-blur rounded-2xl border border-border/50">
              {/* Progress Bar */}
              <div className="mb-4 md:mb-6">
                <WaveformSeekbar
                  trackId={currentTrack.id}
                  url={currentTrack.url}
                  currentTime={currentTime}
                  duration={duration || 0}
                  onSeek={seek}
                  height={56}
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
                      enhancerEnabled={enhancerEnabled}
                      enhancerPreset={enhancerPreset}
                      loudnessAmount={loudnessAmount}
                      stereoWidth={stereoWidth}
                      bassBoost={bassBoost}
                      onEnhancerChange={(settings) => {
                        updateEnhancer(settings);
                        analytics.trackFeature('enhancer', settings.preset || 'custom');
                      }}
                    />
                    <AudioFXStudio
                      pitchSemitones={pitchSemitones}
                      onPitchChange={updatePitch}
                      playbackRate={playbackRate}
                      onPlaybackRateChange={updatePlaybackRate}
                      baseBPM={baseBPM}
                      onBaseBPMChange={updateBaseBPM}
                      stereoPan={stereoPan}
                      onStereoPanChange={updateStereoPan}
                      spatial8DEnabled={spatial8DEnabled}
                      ambience={ambience}
                      onAmbienceChange={setAmbienceLayer}
                      onApplyStylePreset={handleStylePreset}
                      onReset={() => {
                        updatePitch(0);
                        updatePlaybackRate(1);
                        updateStereoPan(0);
                        toggle8DSpatial(false);
                        (['vinyl','rain','hiss'] as const).forEach(l => setAmbienceLayer(l, { enabled: false }));
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
              {/* Back to All Songs - prominent sticky banner */}
              {isFilteredView && (
                <button
                  onClick={handleBackToAllSongs}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-lg bg-primary/15 border-2 border-primary/30 text-primary font-semibold text-sm hover:bg-primary/25 transition-colors"
                >
                  <List className="w-4 h-4" />
                  ← Back to All Songs ({fullPlaylistCache?.length || 0} tracks)
                </button>
              )}
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
                            setEditingTrack(track);
                          }}
                          className="h-8 w-8"
                          title="Edit track info"
                        >
                          <Pencil className="w-4 h-4 text-muted-foreground" />
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
          
          {/* Song Recommendations - hidden behind a toggle on mobile to keep app feeling single-page */}
          {isAuthenticated && user && (
            <>
              <div className="md:hidden mt-4">
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => setShowDiscoverMobile((v) => !v)}
                >
                  {showDiscoverMobile ? 'Hide Discover' : '✨ Discover Music'}
                </Button>
              </div>
              <div className={showDiscoverMobile ? 'block' : 'hidden md:block'}>
                <SongRecommendations
                  userId={user.id}
                  trackCount={playlist.length}
                  onTrackImported={(track) => setPlaylist(prev => [track, ...prev])}
                  onStreamTrack={(track) => {
                    setPlaylist(prev => {
                      const exists = prev.some(t => t.id === track.id);
                      if (exists) {
                        const existingIdx = prev.findIndex(t => t.id === track.id);
                        setTimeout(() => playTrack(existingIdx, true), 0);
                        return prev;
                      }
                      const newIdx = prev.length;
                      const next = [...prev, track];
                      setTimeout(() => playTrack(newIdx, true), 60);
                      return next;
                    });
                  }}
                />
              </div>
            </>
          )}

          {/* Storage Usage Display */}
          {isPlaylistOpen && (
            <div className="mt-4">
              <StorageUsageDisplay />
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
                  recordingMode={recordingMode}
                  onModeChange={setRecordingMode}
                  resolution={resolution}
                  onResolutionChange={setResolution}
                  compact
                />
              )}

              {/* Video Export Suite (premium) */}
              {renderExportButton(true)}

              
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
                enhancerEnabled={enhancerEnabled}
                enhancerPreset={enhancerPreset}
                loudnessAmount={loudnessAmount}
                stereoWidth={stereoWidth}
                bassBoost={bassBoost}
                onEnhancerChange={(settings) => {
                  updateEnhancer(settings);
                  analytics.trackFeature('enhancer', settings.preset || 'custom');
                }}
              />
              <AudioFXStudio
                pitchSemitones={pitchSemitones}
                onPitchChange={updatePitch}
                playbackRate={playbackRate}
                onPlaybackRateChange={updatePlaybackRate}
                baseBPM={baseBPM}
                onBaseBPMChange={updateBaseBPM}
                stereoPan={stereoPan}
                onStereoPanChange={updateStereoPan}
                spatial8DEnabled={spatial8DEnabled}
                ambience={ambience}
                onAmbienceChange={setAmbienceLayer}
                onApplyStylePreset={handleStylePreset}
                onReset={() => {
                  updatePitch(0);
                  updatePlaybackRate(1);
                  updateStereoPan(0);
                  toggle8DSpatial(false);
                  (['vinyl','rain','hiss'] as const).forEach(l => setAmbienceLayer(l, { enabled: false }));
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
              colorScheme={visualizerColorScheme}
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
              <WaveformSeekbar
                trackId={currentTrack.id}
                url={currentTrack.url}
                currentTime={currentTime}
                duration={duration || 0}
                onSeek={seek}
                height={64}
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

      {/* Premium upgrade modal (listens to global events) */}
      <PremiumModal />

      {/* Metadata Editor */}
      <MetadataEditor
        open={!!editingTrack}
        onOpenChange={(o) => { if (!o) setEditingTrack(null); }}
        track={editingTrack}
        onSaved={(updated) => {
          setPlaylist(prev => prev.map(t => t.id === updated.id
            ? { ...t, title: updated.title, artist: updated.artist, cover: updated.cover }
            : t));
        }}
      />
    </div>
  );
};
