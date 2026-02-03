import { useState, useCallback } from 'react';
import { Search, Youtube, Loader2, Music, Play, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { searchYouTube, YouTubeSearchResult, formatDuration, formatViews } from '@/lib/youtubeSearch';
import { importFromYouTube } from '@/lib/syncService';
import { Track } from '@/hooks/useAudioPlayer';

interface YouTubeSearchProps {
  userId: string;
  onTrackImported: (track: Track) => void;
}

type ImportStatus = 'idle' | 'extracting' | 'uploading' | 'caching' | 'complete' | 'error';

export const YouTubeSearch = ({ userId, onTrackImported }: YouTubeSearchProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
  const [importProgress, setImportProgress] = useState(0);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    
    setIsSearching(true);
    setResults([]);
    
    try {
      const searchResults = await searchYouTube(query);
      setResults(searchResults);
      
      if (searchResults.length === 0) {
        toast.info('No results found. Try a different search term.');
      }
    } catch (error) {
      console.error('Search failed:', error);
      toast.error('Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }, [query]);

  const handleImport = async (result: YouTubeSearchResult) => {
    setImportingId(result.videoId);
    setImportStatus('extracting');
    setImportProgress(20);

    try {
      const youtubeUrl = `https://youtube.com/watch?v=${result.videoId}`;
      
      const track = await importFromYouTube(youtubeUrl, userId, (progress) => {
        if (progress === 'uploading') {
          setImportStatus('uploading');
          setImportProgress(60);
        }
        if (progress === 'caching') {
          setImportStatus('caching');
          setImportProgress(90);
        }
      });

      if (track) {
        setImportStatus('complete');
        setImportProgress(100);
        onTrackImported(track);
        toast.success(`Added: ${result.title}`);
        
        // Remove from results to show it's imported
        setResults(prev => prev.filter(r => r.videoId !== result.videoId));
      }
    } catch (error) {
      setImportStatus('error');
      const message = error instanceof Error ? error.message : 'Import failed';
      toast.error(message);
    } finally {
      setTimeout(() => {
        setImportingId(null);
        setImportStatus('idle');
        setImportProgress(0);
      }, 1000);
    }
  };

  const isImporting = importingId !== null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!isImporting) {
        setIsOpen(open);
        if (!open) {
          setQuery('');
          setResults([]);
        }
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Search className="w-4 h-4" />
          <span className="hidden sm:inline">Search Music</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Youtube className="w-5 h-5 text-red-500" />
            Search Billions of Songs
          </DialogTitle>
          <DialogDescription>
            Search for any song worldwide - regional, international, underground music and more
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Input */}
          <div className="flex gap-2">
            <Input
              placeholder="Search for songs, artists, albums..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isImporting}
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isSearching) {
                  handleSearch();
                }
              }}
            />
            <Button
              onClick={handleSearch}
              disabled={isSearching || !query.trim()}
            >
              {isSearching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Search Results */}
          {isSearching && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">Searching...</span>
            </div>
          )}

          {!isSearching && results.length > 0 && (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                {results.map((result) => {
                  const isThisImporting = importingId === result.videoId;
                  
                  return (
                    <div
                      key={result.videoId}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      {/* Thumbnail */}
                      <div className="relative w-16 h-12 flex-shrink-0 rounded overflow-hidden bg-muted">
                        <img
                          src={result.thumbnail}
                          alt={result.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/placeholder.svg';
                          }}
                        />
                        <div className="absolute bottom-0 right-0 bg-black/80 text-white text-[10px] px-1">
                          {result.duration}
                        </div>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{result.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {result.artist} • {formatViews(result.views)} views
                        </p>
                      </div>

                      {/* Import Button */}
                      {isThisImporting ? (
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <Progress value={importProgress} className="h-2 w-16" />
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleImport(result)}
                          disabled={isImporting}
                          className="gap-1"
                        >
                          <Download className="w-4 h-4" />
                          <span className="hidden sm:inline">Add</span>
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          {/* Empty State */}
          {!isSearching && results.length === 0 && query && (
            <div className="text-center py-8 text-muted-foreground">
              <Music className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No results yet. Press Enter or click Search.</p>
            </div>
          )}

          {/* Initial State */}
          {!isSearching && results.length === 0 && !query && (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Search for any song in the world</p>
              <p className="text-xs mt-2">
                Bollywood, K-Pop, Latin, African, Classical, Underground, and more...
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
