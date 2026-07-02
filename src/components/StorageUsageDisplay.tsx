import { useEffect, useState } from 'react';
import { HardDrive, Music } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { getLocalStorageUsage, getStorageQuota } from '@/lib/storageUtils';
import { logger } from '@/lib/logger';

interface StorageInfo {
  musicBytes: number;
  musicFormatted: string;
  trackCount: number;
  quotaUsed: number;
  quotaTotal: number;
  quotaPercent: number;
}

export const StorageUsageDisplay = () => {
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshStorage = async () => {
    setIsLoading(true);
    try {
      const [localUsage, quotaInfo] = await Promise.all([
        getLocalStorageUsage(),
        getStorageQuota(),
      ]);

      setStorageInfo({
        musicBytes: localUsage.totalBytes,
        musicFormatted: localUsage.formattedSize,
        trackCount: localUsage.trackCount,
        quotaUsed: quotaInfo?.used || 0,
        quotaTotal: quotaInfo?.quota || 0,
        quotaPercent: quotaInfo?.percentUsed || 0,
      });
    } catch (error) {
      logger.error('Error fetching storage info:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshStorage();
  }, []);

  if (isLoading) {
    return (
      <div className="p-4 bg-card/50 rounded-lg animate-pulse">
        <div className="h-4 bg-muted rounded w-24 mb-2" />
        <div className="h-2 bg-muted rounded w-full" />
      </div>
    );
  }

  if (!storageInfo) return null;

  return (
    <div className="p-4 bg-card/50 rounded-lg space-y-3">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <HardDrive className="w-4 h-4" />
          <span>Local Storage</span>
        </div>
        <button 
          onClick={refreshStorage}
          className="text-xs text-primary hover:underline"
        >
          Refresh
        </button>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-primary" />
            <span>{storageInfo.trackCount} tracks cached</span>
          </div>
          <span className="font-medium text-primary">{storageInfo.musicFormatted}</span>
        </div>
        
        {storageInfo.quotaTotal > 0 && (
          <>
            <Progress value={storageInfo.quotaPercent} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{storageInfo.quotaPercent}% used</span>
              <span>
                {((storageInfo.quotaTotal - storageInfo.quotaUsed) / 1024 / 1024 / 1024).toFixed(1)} GB free
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
