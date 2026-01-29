import { Progress } from '@/components/ui/progress';
import { Cloud, Download, Upload, CheckCircle } from 'lucide-react';

export interface SyncProgress {
  status: 'idle' | 'checking' | 'uploading' | 'downloading' | 'complete' | 'error';
  currentTrack?: string;
  currentIndex?: number;
  totalTracks?: number;
  bytesDownloaded?: number;
  totalBytes?: number;
}

interface SyncProgressBarProps {
  progress: SyncProgress;
  className?: string;
}

export const SyncProgressBar = ({ progress, className = '' }: SyncProgressBarProps) => {
  if (progress.status === 'idle') return null;

  const getIcon = () => {
    switch (progress.status) {
      case 'checking':
        return <Cloud className="w-4 h-4 animate-pulse" />;
      case 'uploading':
        return <Upload className="w-4 h-4 animate-bounce" />;
      case 'downloading':
        return <Download className="w-4 h-4 animate-bounce" />;
      case 'complete':
        return <CheckCircle className="w-4 h-4 text-primary" />;
      default:
        return <Cloud className="w-4 h-4" />;
    }
  };

  const getMessage = () => {
    switch (progress.status) {
      case 'checking':
        return 'Checking for updates...';
      case 'uploading':
        return progress.currentTrack 
          ? `Uploading: ${progress.currentTrack}` 
          : 'Uploading tracks...';
      case 'downloading':
        return progress.currentTrack 
          ? `Downloading: ${progress.currentTrack}` 
          : 'Downloading tracks...';
      case 'complete':
        return 'Sync complete!';
      case 'error':
        return 'Sync failed';
      default:
        return 'Syncing...';
    }
  };

  const getProgress = () => {
    if (progress.totalTracks && progress.currentIndex !== undefined) {
      return Math.round((progress.currentIndex / progress.totalTracks) * 100);
    }
    if (progress.totalBytes && progress.bytesDownloaded) {
      return Math.round((progress.bytesDownloaded / progress.totalBytes) * 100);
    }
    return progress.status === 'complete' ? 100 : undefined;
  };

  const progressValue = getProgress();

  return (
    <div className={`p-3 bg-primary/10 rounded-lg space-y-2 ${className}`}>
      <div className="flex items-center gap-2 text-sm">
        {getIcon()}
        <span className="truncate flex-1">{getMessage()}</span>
        {progress.totalTracks && progress.currentIndex !== undefined && (
          <span className="text-muted-foreground text-xs">
            {progress.currentIndex}/{progress.totalTracks}
          </span>
        )}
      </div>
      
      {progressValue !== undefined && (
        <Progress value={progressValue} className="h-1.5" />
      )}
    </div>
  );
};
