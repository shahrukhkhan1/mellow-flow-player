import { supabase } from '@/integrations/supabase/client';

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: string;
  views: number;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export async function searchYouTube(query: string): Promise<YouTubeSearchResult[]> {
  if (!query.trim()) return [];

  console.log(`🎵 Searching for: ${query}`);

  // Use fetch directly with an AbortController timeout instead of supabase.functions.invoke,
  // which has been observed to hang indefinitely in some browsers when the edge runtime
  // closes the connection abnormally.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s hard timeout

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token ?? SUPABASE_ANON_KEY;

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/youtube-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Search failed (${resp.status}): ${text || resp.statusText}`);
    }

    const data = await resp.json();
    return data?.results ?? [];
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error('Search timed out. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
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
