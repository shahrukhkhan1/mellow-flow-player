import { supabase } from '@/integrations/supabase/client';

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: string;
  views: number;
}

export async function searchYouTube(query: string): Promise<YouTubeSearchResult[]> {
  if (!query.trim()) return [];
  
  console.log(`🎵 Searching for: ${query}`);
  
  const { data, error } = await supabase.functions.invoke('youtube-search', {
    body: { query },
  });

  if (error) {
    console.error('Search error:', error);
    throw new Error(error.message || 'Search failed');
  }

  if (!data?.results) {
    return [];
  }

  return data.results;
}

export function formatDuration(duration: string | number): string {
  if (typeof duration === 'string') return duration;
  if (!duration || duration <= 0) return '0:00';
  const mins = Math.floor(duration / 60);
  const secs = Math.floor(duration % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatViews(views: number): string {
  if (!views) return '0';
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
