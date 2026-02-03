// YouTube search using Piped API (free, no API key required)

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  artist: string;
  duration: number; // seconds
  thumbnail: string;
  views: number;
}

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.yt',
];

async function trySearchInstance(instance: string, query: string): Promise<YouTubeSearchResult[]> {
  const response = await fetch(
    `${instance}/search?q=${encodeURIComponent(query)}&filter=music_songs`,
    { headers: { 'Accept': 'application/json' } }
  );
  
  if (!response.ok) {
    throw new Error(`${instance} returned ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.items || !Array.isArray(data.items)) {
    throw new Error('Invalid response format');
  }
  
  return data.items
    .filter((item: any) => item.type === 'stream')
    .slice(0, 20)
    .map((item: any) => ({
      videoId: item.url?.replace('/watch?v=', '') || '',
      title: item.title || 'Unknown Title',
      artist: item.uploaderName || 'Unknown Artist',
      duration: item.duration || 0,
      thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${item.url?.replace('/watch?v=', '')}/hqdefault.jpg`,
      views: item.views || 0,
    }));
}

export async function searchYouTube(query: string): Promise<YouTubeSearchResult[]> {
  if (!query.trim()) {
    return [];
  }
  
  let lastError: Error | null = null;
  
  for (const instance of PIPED_INSTANCES) {
    try {
      console.log(`🔍 Searching YouTube via ${instance}...`);
      const results = await trySearchInstance(instance, query);
      console.log(`✅ Found ${results.length} results`);
      return results;
    } catch (error) {
      console.log(`${instance} failed:`, error);
      lastError = error instanceof Error ? error : new Error('Unknown error');
    }
  }
  
  throw lastError || new Error('All search instances failed');
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatViews(views: number): string {
  if (views >= 1000000000) {
    return `${(views / 1000000000).toFixed(1)}B`;
  }
  if (views >= 1000000) {
    return `${(views / 1000000).toFixed(1)}M`;
  }
  if (views >= 1000) {
    return `${(views / 1000).toFixed(1)}K`;
  }
  return views.toString();
}
