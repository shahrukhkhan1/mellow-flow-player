import { useEffect, useState } from 'react';
import { useAudioPlayer, Track } from '@/hooks/useAudioPlayer';
import { useAudioEffects } from '@/hooks/useAudioEffects';
import { useAnalytics } from '@/hooks/useAnalytics';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { AudioVisualizer } from '@/components/AudioVisualizer';
import { VisualizerSelector } from '@/components/VisualizerSelector';
import { EqualizerPanel } from '@/components/EqualizerPanel';
import { PlaylistManager } from '@/components/PlaylistManager';
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
  X
} from 'lucide-react';
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';
import { toast } from 'sonner';
import { saveTrack, getAllTracks, deleteTrack, getTrack } from '@/lib/db';

const formatTime = (seconds: number): string => {
  if (!isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const MusicPlayer = () => {
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [visualizerType, setVisualizerType] = useState<'bars' | 'wave' | 'circular' | 'spectrum' | 'particles' | 'waveform'>('bars');
  const [filesMap, setFilesMap] = useState<Map<string, File>>(new Map());
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);
  const analytics = useAnalytics();
  
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
    audioElement,
  } = useAudioPlayer(playlist);

  const {
    setEqualizer,
    toggleReverb,
    updateReverbAmount,
    updatePlaybackRate,
    reverbEnabled,
    reverbAmount,
    playbackRate,
    currentPreset,
    analyser,
  } = useAudioEffects(audioElement);

  // Load cached songs on mount
  useEffect(() => {
    loadCachedTracks();
  }, []);

  const loadCachedTracks = async () => {
    try {
      const tracks = await getAllTracks();
      setPlaylist(tracks);
      analytics.trackEvent('load', 'cached_tracks', `${tracks.length} tracks`);
    } catch (error) {
      console.error('Error loading cached tracks:', error);
      analytics.trackError(`Load cached tracks failed: ${error}`);
    }
  };

  // Request wake lock to prevent screen sleep during playback
  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && isPlaying) {
        try {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        } catch (err) {
          console.log('Wake Lock error:', err);
        }
      }
    };

    const releaseWakeLock = () => {
      if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
      }
    };

    if (isPlaying) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    return () => releaseWakeLock();
  }, [isPlaying]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const files = event.target.files;
      if (!files) return;

      const newTracks: Track[] = [];
      const newFilesMap = new Map(filesMap);

      for (const file of Array.from(files)) {
        if (file.type.startsWith('audio/')) {
          const url = URL.createObjectURL(file);
          const track: Track = {
            id: Math.random().toString(36).substr(2, 9),
            title: file.name.replace(/\.[^/.]+$/, ''),
            artist: 'Unknown Artist',
            url,
          };
          newTracks.push(track);
          newFilesMap.set(track.id, file);
          
          // Cache to IndexedDB
          await saveTrack(track, file);
        }
      }

      if (newTracks.length > 0) {
        setPlaylist(prev => [...prev, ...newTracks]);
        setFilesMap(newFilesMap);
        toast.success(`Added and cached ${newTracks.length} track${newTracks.length > 1 ? 's' : ''}`);
        analytics.trackEvent('upload', 'tracks', `${newTracks.length} tracks`, newTracks.length);
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

  const toggleMute = () => {
    setVolume(volume === 0 ? 1 : 0);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-player-bg flex flex-col">
      <PWAInstallPrompt />
      
      {/* Header */}
      <header className="safe-top safe-left safe-right p-4 md:p-6 border-b border-border/50">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
              <Music className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <h1 className="text-lg md:text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Pocket MP3
            </h1>
          </div>
          
          <div className="flex gap-2">
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
                accept="audio/*"
                multiple
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto safe-bottom">
        <div className="max-w-4xl mx-auto p-4 md:p-6 safe-left safe-right">
          {/* Visualizer */}
          {currentTrack && (
            <div className="mb-4 md:mb-6">
              <div className="h-40 md:h-48 bg-card/50 backdrop-blur rounded-2xl border border-primary/20 overflow-hidden mb-3 md:mb-4">
                <AudioVisualizer analyser={analyser} type={visualizerType} isPlaying={isPlaying} />
              </div>
              <VisualizerSelector currentType={visualizerType} onTypeChange={setVisualizerType} />
            </div>
          )}

          {/* Current Track Display */}
          {currentTrack ? (
            <div className="mb-6 md:mb-8 text-center">
              <h2 className="text-xl md:text-3xl font-bold mb-2 px-4 truncate">{currentTrack.title}</h2>
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
                    <Slider
                      value={[volume]}
                      max={1}
                      step={0.01}
                      onValueChange={handleVolumeChange}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Playlist Toggle Button (Mobile) */}
          {playlist.length > 0 && (
            <div className="mt-4">
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => setIsPlaylistOpen(!isPlaylistOpen)}
              >
                {isPlaylistOpen ? <X className="w-4 h-4" /> : <List className="w-4 h-4" />}
                {isPlaylistOpen ? 'Hide' : 'Show'} Playlist ({playlist.length})
              </Button>
            </div>
          )}

          {/* Playlist */}
          {playlist.length > 0 && isPlaylistOpen && (
            <div className="space-y-2 mt-4 max-h-[60vh] overflow-y-auto">
              {playlist.map((track, index) => (
                <button
                  key={track.id}
                  onClick={() => {
                    playTrack(index);
                    analytics.trackEvent('click', 'playlist', track.title);
                  }}
                  className={`w-full p-3 md:p-4 rounded-lg text-left transition-all ${
                    index === currentTrackIndex
                      ? 'bg-primary/10 border border-primary/30'
                      : 'bg-card hover:bg-card/80 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      index === currentTrackIndex 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {index === currentTrackIndex && isPlaying ? (
                        <div className="flex gap-1">
                          <div className="w-1 h-3 md:h-4 bg-current animate-pulse" style={{ animationDelay: '0ms' }} />
                          <div className="w-1 h-3 md:h-4 bg-current animate-pulse" style={{ animationDelay: '150ms' }} />
                          <div className="w-1 h-3 md:h-4 bg-current animate-pulse" style={{ animationDelay: '300ms' }} />
                        </div>
                      ) : (
                        <span className="text-xs md:text-sm font-medium">{index + 1}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-sm md:text-base">{track.title}</p>
                      <p className="text-xs md:text-sm text-muted-foreground truncate">{track.artist}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTrack(track.id);
                      }}
                      className="flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
