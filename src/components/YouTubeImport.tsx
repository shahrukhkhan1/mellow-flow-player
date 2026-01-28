import { useState } from 'react';
import { Youtube, Clipboard, Loader2, Music } from 'lucide-react';
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
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { importFromYouTube } from '@/lib/syncService';
import { Track } from '@/hooks/useAudioPlayer';

interface YouTubeImportProps {
  userId: string;
  onTrackImported: (track: Track) => void;
}

type ImportStatus = 'idle' | 'validating' | 'extracting' | 'uploading' | 'caching' | 'complete' | 'error';

const statusMessages: Record<ImportStatus, string> = {
  idle: '',
  validating: 'Validating YouTube URL...',
  extracting: 'Extracting audio from YouTube...',
  uploading: 'Uploading to cloud storage...',
  caching: 'Caching for offline playback...',
  complete: 'Import complete!',
  error: 'Import failed',
};

const statusProgress: Record<ImportStatus, number> = {
  idle: 0,
  validating: 10,
  extracting: 40,
  uploading: 70,
  caching: 90,
  complete: 100,
  error: 0,
};

// Validate YouTube URL format
const isValidYouTubeUrl = (url: string): boolean => {
  const patterns = [
    /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)[a-zA-Z0-9_-]{11}/,
    /^[a-zA-Z0-9_-]{11}$/ // Just video ID
  ];
  return patterns.some(pattern => pattern.test(url.trim()));
};

export const YouTubeImport = ({ userId, onTrackImported }: YouTubeImportProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      if (isValidYouTubeUrl(text)) {
        toast.success('YouTube link pasted!');
      }
    } catch {
      toast.error('Could not access clipboard. Please paste manually.');
    }
  };

  const handleImport = async () => {
    const trimmedUrl = url.trim();
    
    if (!trimmedUrl) {
      toast.error('Please enter a YouTube URL');
      return;
    }

    if (!isValidYouTubeUrl(trimmedUrl)) {
      toast.error('Please enter a valid YouTube URL');
      return;
    }

    setStatus('validating');
    setErrorMessage('');

    try {
      setStatus('extracting');
      
      const track = await importFromYouTube(trimmedUrl, userId, (progress) => {
        if (progress === 'uploading') setStatus('uploading');
        if (progress === 'caching') setStatus('caching');
      });

      if (track) {
        setStatus('complete');
        onTrackImported(track);
        toast.success(`Imported: ${track.title}`);
        
        // Reset after success
        setTimeout(() => {
          setUrl('');
          setStatus('idle');
          setIsOpen(false);
        }, 1500);
      } else {
        throw new Error('No track returned from import');
      }
    } catch (error) {
      setStatus('error');
      const message = error instanceof Error ? error.message : 'Import failed';
      setErrorMessage(message);
      toast.error(message);
    }
  };

  const isImporting = status !== 'idle' && status !== 'error' && status !== 'complete';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!isImporting) {
        setIsOpen(open);
        if (!open) {
          setUrl('');
          setStatus('idle');
          setErrorMessage('');
        }
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Youtube className="w-4 h-4" />
          <span className="hidden sm:inline">YouTube</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Youtube className="w-5 h-5 text-red-500" />
            Import from YouTube
          </DialogTitle>
          <DialogDescription>
            Paste a YouTube link to download the audio and add it to your library.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* URL Input */}
          <div className="flex gap-2">
            <Input
              placeholder="https://youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isImporting}
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isImporting) {
                  handleImport();
                }
              }}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={handlePaste}
              disabled={isImporting}
              title="Paste from clipboard"
            >
              <Clipboard className="w-4 h-4" />
            </Button>
          </div>

          {/* Progress Section */}
          {isImporting && (
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  {status === 'extracting' ? (
                    <Youtube className="w-5 h-5 text-red-500 animate-pulse" />
                  ) : (
                    <Music className="w-5 h-5 text-primary animate-pulse" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{statusMessages[status]}</p>
                  <p className="text-xs text-muted-foreground">This may take a minute...</p>
                </div>
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
              <Progress value={statusProgress[status]} className="h-2" />
            </div>
          )}

          {/* Success State */}
          {status === 'complete' && (
            <div className="p-4 bg-primary/10 text-primary rounded-lg text-center">
              <p className="font-medium">✓ Track imported successfully!</p>
            </div>
          )}

          {/* Error State */}
          {status === 'error' && errorMessage && (
            <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
              <p className="text-sm">{errorMessage}</p>
            </div>
          )}

          {/* Import Button */}
          <Button
            className="w-full gap-2"
            onClick={handleImport}
            disabled={isImporting || !url.trim()}
          >
            {isImporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Youtube className="w-4 h-4" />
                Import Audio
              </>
            )}
          </Button>

          {/* Help Text */}
          <p className="text-xs text-muted-foreground text-center">
            Supports youtube.com and youtu.be links
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
