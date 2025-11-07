import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp, Clock, Music, Heart } from 'lucide-react';
import { getAllPlayStats, getAllTracks, getAllFavorites } from '@/lib/db';
import { Track } from '@/hooks/useAudioPlayer';
import { useNavigate } from 'react-router-dom';

interface PlayStat {
  trackId: string;
  playCount: number;
  totalPlayTime: number;
  lastPlayed: number;
  genre?: string;
}

interface TrackWithStats extends Track {
  playCount: number;
  totalPlayTime: number;
  lastPlayed: number;
}

const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
};

export default function Statistics() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<PlayStat[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [tracksWithStats, setTracksWithStats] = useState<TrackWithStats[]>([]);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [totalListeningTime, setTotalListeningTime] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStatistics();
  }, []);

  const loadStatistics = async () => {
    try {
      setLoading(true);
      const [playStats, allTracks, favorites] = await Promise.all([
        getAllPlayStats(),
        getAllTracks(),
        getAllFavorites(),
      ]);

      setStats(playStats);
      setTracks(allTracks);
      setFavoritesCount(favorites.length);

      // Calculate total listening time
      const total = playStats.reduce((sum, stat) => sum + stat.totalPlayTime, 0);
      setTotalListeningTime(total);

      // Merge tracks with stats
      const merged = allTracks.map(track => {
        const stat = playStats.find(s => s.trackId === track.id);
        return {
          ...track,
          playCount: stat?.playCount || 0,
          totalPlayTime: stat?.totalPlayTime || 0,
          lastPlayed: stat?.lastPlayed || 0,
        };
      }).filter(t => t.playCount > 0);

      // Sort by play count
      merged.sort((a, b) => b.playCount - a.playCount);
      setTracksWithStats(merged);
    } catch (error) {
      console.error('Error loading statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  const topGenres = stats.reduce((acc, stat) => {
    if (stat.genre) {
      acc[stat.genre] = (acc[stat.genre] || 0) + stat.playCount;
    }
    return acc;
  }, {} as Record<string, number>);

  const sortedGenres = Object.entries(topGenres)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading statistics...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background safe-top safe-bottom">
      <div className="container max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-3xl font-bold">Your Music Stats</h1>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Listening Time
              </CardTitle>
              <Clock className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatTime(totalListeningTime)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Across {stats.length} tracks
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Plays
              </CardTitle>
              <TrendingUp className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.reduce((sum, s) => sum + s.playCount, 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                All time plays
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Favorites
              </CardTitle>
              <Heart className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{favoritesCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Tracks you love
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Most Played Tracks */}
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music className="w-5 h-5 text-primary" />
              Most Played Tracks
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tracksWithStats.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No play history yet. Start listening to see your stats!
              </p>
            ) : (
              <div className="space-y-3">
                {tracksWithStats.slice(0, 10).map((track, index) => (
                  <div
                    key={track.id}
                    className="flex items-center gap-4 p-3 rounded-lg bg-background/50 hover:bg-background/80 transition-colors"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{track.title}</p>
                      <p className="text-sm text-muted-foreground truncate">{track.artist}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-sm font-medium">{track.playCount} plays</span>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(track.totalPlayTime)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Favorite Genres */}
        {sortedGenres.length > 0 && (
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Top Genres
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sortedGenres.map(([genre, count]) => (
                  <div key={genre} className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="font-medium capitalize">{genre}</span>
                        <span className="text-sm text-muted-foreground">{count} plays</span>
                      </div>
                      <div className="h-2 bg-background/50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{
                            width: `${(count / sortedGenres[0][1]) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
