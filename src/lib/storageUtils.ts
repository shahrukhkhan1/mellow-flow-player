// Utility functions for storage management

/**
 * Get the estimated storage usage for IndexedDB tracks
 */
export const getLocalStorageUsage = async (): Promise<{
  totalBytes: number;
  trackCount: number;
  formattedSize: string;
}> => {
  try {
    const db = await import('./db').then(m => m.initDB());
    const tracks = await db.getAll('tracks');
    
    // Deduplicate by title (case-insensitive) and count only unique tracks
    const seenTitles = new Set<string>();
    let totalBytes = 0;
    let uniqueCount = 0;
    
    for (const track of tracks) {
      const titleKey = track.title.toLowerCase().trim();
      if (!seenTitles.has(titleKey)) {
        seenTitles.add(titleKey);
        uniqueCount++;
        if (track.blob) {
          totalBytes += track.blob.size;
        }
      }
    }
    
    return {
      totalBytes,
      trackCount: uniqueCount,
      formattedSize: formatBytes(totalBytes),
    };
  } catch (error) {
    console.error('Error calculating storage usage:', error);
    return {
      totalBytes: 0,
      trackCount: 0,
      formattedSize: '0 B',
    };
  }
};

/**
 * Get storage quota and usage from the browser's StorageManager
 */
export const getStorageQuota = async (): Promise<{
  used: number;
  quota: number;
  usedFormatted: string;
  quotaFormatted: string;
  percentUsed: number;
} | null> => {
  try {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const quota = estimate.quota || 0;
      
      return {
        used,
        quota,
        usedFormatted: formatBytes(used),
        quotaFormatted: formatBytes(quota),
        percentUsed: quota > 0 ? Math.round((used / quota) * 100) : 0,
      };
    }
  } catch (error) {
    console.error('Error getting storage quota:', error);
  }
  return null;
};

/**
 * Format bytes to human-readable string
 */
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};
