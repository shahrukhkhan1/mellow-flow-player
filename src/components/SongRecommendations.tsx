import { useState, useEffect, useCallback } from 'react';
import { Sparkles, RefreshCw, Download, Loader2, ChevronDown, ChevronUp, Music, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { importFromYouTube, streamFromYouTube } from '@/lib/syncService';
import { Track } from '@/hooks/useAudioPlayer';
import { toast } from 'sonner';

interface TopGenre {
  genre: string;
  count: number;
  percentage: number;
}

interface Recommendation {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: string;
  views: number;
}

interface SongRecommendationsProps {
  userId: string;
  trackCount: number;
  onTrackImported: (track: Track) => void;
  onStreamTrack?: (track: Track) => void;
}

export const SongRecommendations = ({ userId, trackCount, onTrackImported, onStreamTrack }: SongRecommendationsProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [topGenres, setTopGenres] = useState<TopGenre[]>([]);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState(0);

  const classifyUntaggedTracks = useCallback(async () => {
    try {
      setIsClassifying(true);
      const { data: untagged } = await supabase
        .from('tracks')
        .select('id, title, artist')
        .eq('user_id', userId)
        .is('genre', null)
        .limit(30);

      if (!untagged || untagged.length === 0) return;

      const { data, error } = await supabase.functions.invoke('classify-genres', {
        body: { tracks: untagged },
      });

      if (error) { console.error('Classification error:', error); return; }

      const classifications = data?.classifications;
      if (!classifications) return;

      for (const c of classifications) {
        await supabase
          .from('tracks')
          .update({ genre: c.genre } as any)
          .eq('id', c.id)
          .eq('user_id', userId);
      }
      console.log(`🎵 Classified ${classifications.length} tracks`);
    } catch (error) {
      console.error('Classification failed:', error);
    } finally {
      setIsClassifying(false);
    }
  }, [userId]);

  const fetchRecommendations = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-recommendations', {});
      if (error) throw error;

      if (data?.needsClassification) {
        await classifyUntaggedTracks();
        const { data: retryData } = await supabase.functions.invoke('get-recommendations', {});
        setRecommendations(retryData?.recommendations || []);
        setTopGenres(retryData?.topGenres || []);
      } else {
        setRecommendations(data?.recommendations || []);
        setTopGenres(data?.topGenres || []);
      }
    } catch (error) {
      console.error('Failed to get recommendations:', error);
      toast.error('Failed to load recommendations');
    } finally {
      setIsLoading(false);
    }
  }, [classifyUntaggedTracks]);

  useEffect(() => {
    if (isOpen && trackCount >= 50 && recommendations.length === 0) {
      classifyUntaggedTracks().then(() => fetchRecommendations());
    }
  }, [isOpen, trackCount, recommendations.length, classifyUntaggedTracks, fetchRecommendations]);

  const handleStream = async (rec: Recommendation) => {
    if (!onStreamTrack) return;
    setStreamingId(rec.videoId);
    try {
      const streamData = await streamFromYouTube(rec.videoId);
      const track: Track = {
        id: `stream-${rec.videoId}`,
        title: streamData.title || rec.title,
        artist: streamData.artist || rec.artist,
        url: streamData.audioUrl,
        duration: streamData.duration || undefined,
        cover: streamData.thumbnail,
      };
      onStreamTrack(track);
      toast.success(`Playing: ${track.title}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Stream failed');
    } finally {
      setStreamingId(null);
    }
  };

  const handleSave = async (rec: Recommendation) => {
    setImportingId(rec.videoId);
    setImportProgress(20);
    try {
      const url = `https://youtube.com/watch?v=${rec.videoId}`;
      const track = await importFromYouTube(url, userId, (progress) => {
        if (progress === 'uploading') setImportProgress(60);
        if (progress === 'caching') setImportProgress(90);
      });
      if (track) {
        setImportProgress(100);
        onTrackImported(track);
        setRecommendations(prev => prev.filter(r => r.videoId !== rec.videoId));
        toast.success(`Saved: ${rec.title}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setTimeout(() => { setImportingId(null); setImportProgress(0); }, 1000);
    }
  };

  const isBusy = importingId !== null || streamingId !== null;

  if (trackCount < 50) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-4">
      <CollapsibleTrigger asChild>
        <Button
          variant="outline"
          className="w-full gap-2 bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20 hover:border-primary/40"
        >
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="flex-1 text-left">Discover Music For You</span>
          {isClassifying && <Loader2 className="w-4 h-4 animate-spin" />}
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-3 space-y-3">
        {/* Genre Tags */}
        {topGenres.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Your taste:</span>
            {topGenres.map(g => (
              <Badge key={g.genre} variant="secondary" className="text-xs">
                {g.genre} {g.percentage}%
              </Badge>
            ))}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Finding music for you...</span>
          </div>
        )}

        {/* Recommendations */}
        {!isLoading && recommendations.length > 0 && (
          <>
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2 pr-2">
                {recommendations.map(rec => {
                  const isImporting = importingId === rec.videoId;
                  const isStreaming = streamingId === rec.videoId;
                  return (
                    <div
                      key={rec.videoId}
                      className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="relative w-12 sm:w-14 h-9 sm:h-10 flex-shrink-0 rounded overflow-hidden bg-muted">
                        <img
                          src={rec.thumbnail}
                          alt={rec.title}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
                        />
                        <div className="absolute bottom-0 right-0 bg-black/80 text-white text-[9px] px-0.5">
                          {rec.duration}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs sm:text-sm truncate">{rec.title}</p>
                        <p className="text-[11px] sm:text-xs text-muted-foreground truncate">{rec.artist}</p>
                      </div>
                      {isImporting ? (
                        <div className="flex items-center gap-2 min-w-[80px]">
                          <Progress value={importProgress} className="h-2 w-14" />
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 shrink-0">
                          {onStreamTrack && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleStream(rec)}
                              disabled={isBusy}
                              className="h-9 w-9 sm:h-8 sm:w-8"
                              title="Stream now"
                            >
                              {isStreaming ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Play className="w-4 h-4" />
                              )}
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleSave(rec)}
                            disabled={isBusy}
                            className="h-9 w-9 sm:h-8 sm:w-8"
                            title="Save for offline"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchRecommendations}
              disabled={isLoading}
              className="w-full gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Recommendations
            </Button>
          </>
        )}

        {/* Empty State */}
        {!isLoading && recommendations.length === 0 && !isClassifying && (
          <div className="text-center py-6 text-muted-foreground">
            <Music className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No recommendations yet</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => classifyUntaggedTracks().then(() => fetchRecommendations())}
              className="mt-2 gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Generate Recommendations
            </Button>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};
