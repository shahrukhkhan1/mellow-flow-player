import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type AudioResult = {
  audioUrl: string;
  info: { title: string; artist: string; duration: number | null; thumbnail: string | null };
};

// Extract video ID from various YouTube URL formats
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// ─── Method 1: Cobalt API (most reliable in 2025/2026) ───
async function tryCobaltAPI(videoId: string): Promise<AudioResult | null> {
  const cobaltInstances = [
    'https://api.cobalt.tools',
    'https://cobalt-api.hyper.lol',
    'https://cobalt.api.timelessnesses.me',
  ];

  for (const instance of cobaltInstances) {
    try {
      console.log(`🔄 Trying Cobalt: ${instance}`);

      const response = await fetch(instance, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: `https://youtube.com/watch?v=${videoId}`,
          downloadMode: 'audio',
          audioFormat: 'mp3',
          filenameStyle: 'basic',
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.log(`Cobalt ${instance} returned ${response.status}: ${text.slice(0, 200)}`);
        continue;
      }

      const data = await response.json();
      console.log(`Cobalt response status: ${data.status}`);

      if (data.status === 'error') {
        console.log(`Cobalt error: ${data.error?.code || 'unknown'}`);
        continue;
      }

      // "tunnel" or "redirect" both provide a URL
      const audioUrl = data.url;
      if (!audioUrl) {
        console.log('No URL in Cobalt response');
        continue;
      }

      // Cobalt doesn't return metadata, so we'll get it separately
      const info = await getVideoMetadata(videoId);

      console.log(`✅ Cobalt success from ${instance}`);
      return { audioUrl, info };
    } catch (error) {
      console.log(`Cobalt ${instance} failed:`, error);
    }
  }
  return null;
}

// ─── Method 2: YouTube Internal API (Android Music client) ───
async function tryYouTubeInternal(videoId: string): Promise<AudioResult | null> {
  try {
    console.log('🔄 Trying YouTube Internal API (ANDROID_MUSIC)...');

    const response = await fetch('https://music.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/19.29.37 (Linux; U; Android 11) gzip',
        'X-Goog-Api-Key': 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID_MUSIC',
            clientVersion: '7.27.52',
            androidSdkVersion: 30,
            hl: 'en',
            gl: 'US',
          },
        },
        videoId,
        playbackContext: {
          contentPlaybackContext: {
            signatureTimestamp: 20073,
          },
        },
        racyCheckOk: true,
        contentCheckOk: true,
      }),
    });

    if (!response.ok) {
      console.log(`YouTube internal returned ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.playabilityStatus?.status !== 'OK') {
      console.log(`Not playable: ${data.playabilityStatus?.reason || data.playabilityStatus?.status}`);
      return null;
    }

    const formats = data.streamingData?.adaptiveFormats || [];
    const audioFormats = formats.filter((f: any) => f.mimeType?.startsWith('audio/') && f.url);

    if (audioFormats.length === 0) {
      console.log('No direct audio URLs found');
      return null;
    }

    // Prefer m4a (mp4a codec), then sort by bitrate
    audioFormats.sort((a: any, b: any) => {
      const aIsM4a = a.mimeType?.includes('mp4a') ? 1 : 0;
      const bIsM4a = b.mimeType?.includes('mp4a') ? 1 : 0;
      if (aIsM4a !== bIsM4a) return bIsM4a - aIsM4a;
      return (b.bitrate || 0) - (a.bitrate || 0);
    });

    const best = audioFormats[0];
    console.log(`✅ YouTube Internal: ${best.mimeType} (${best.bitrate}bps)`);

    return {
      audioUrl: best.url,
      info: {
        title: data.videoDetails?.title || `YouTube-${videoId}`,
        artist: data.videoDetails?.author || 'YouTube',
        duration: parseInt(data.videoDetails?.lengthSeconds) || null,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      },
    };
  } catch (error) {
    console.log('YouTube Internal failed:', error);
    return null;
  }
}

// ─── Method 3: Piped API ───
async function tryPipedAPI(videoId: string): Promise<AudioResult | null> {
  const instances = [
    'https://pipedapi.adminforge.de',
    'https://api.piped.yt',
    'https://pipedapi.darkness.services',
    'https://pipedapi.leptons.xyz',
  ];

  for (const instance of instances) {
    try {
      console.log(`🔄 Trying Piped: ${instance}`);

      const res = await fetch(`${instance}/streams/${videoId}`, {
        headers: { 'Accept': 'application/json' },
      });

      if (!res.ok) { console.log(`${instance}: ${res.status}`); continue; }

      const info = await res.json();
      if (info.error) { console.log(`Piped error: ${info.message || info.error}`); continue; }

      const streams = info.audioStreams || [];
      if (streams.length === 0) { console.log('No audio streams'); continue; }

      streams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      const best = streams[0];
      if (!best.url) { console.log('No URL in stream'); continue; }

      console.log(`✅ Piped: ${best.mimeType} (${best.bitrate}bps)`);

      return {
        audioUrl: best.url,
        info: {
          title: info.title || `YouTube-${videoId}`,
          artist: info.uploader || 'YouTube',
          duration: info.duration || null,
          thumbnail: info.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        },
      };
    } catch (error) {
      console.log(`${instance} failed:`, error);
    }
  }
  return null;
}

// ─── Method 4: Invidious API ───
async function tryInvidiousAPI(videoId: string): Promise<AudioResult | null> {
  const instances = [
    'https://invidious.io.lol',
    'https://yt.oelrichsgarcia.de',
    'https://iv.nbohr.se',
    'https://invidious.privacyredirect.com',
  ];

  for (const instance of instances) {
    try {
      console.log(`🔄 Trying Invidious: ${instance}`);

      const res = await fetch(`${instance}/api/v1/videos/${videoId}`, {
        headers: { 'Accept': 'application/json' },
      });

      if (!res.ok) { console.log(`${instance}: ${res.status}`); continue; }

      const ct = res.headers.get('content-type');
      if (!ct?.includes('application/json')) { console.log(`${instance}: non-JSON`); continue; }

      const info = await res.json();
      const audioFormats = (info.adaptiveFormats || []).filter(
        (f: any) => f.type?.startsWith('audio/') && f.url
      );

      if (audioFormats.length === 0) { console.log('No audio formats'); continue; }

      audioFormats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      const best = audioFormats[0];

      console.log(`✅ Invidious: ${best.type}`);

      return {
        audioUrl: best.url,
        info: {
          title: info.title || `YouTube-${videoId}`,
          artist: info.author || 'YouTube',
          duration: info.lengthSeconds || null,
          thumbnail: info.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        },
      };
    } catch (error) {
      console.log(`${instance} failed:`, error);
    }
  }
  return null;
}

// ─── Get video metadata (used by Cobalt which doesn't return metadata) ───
async function getVideoMetadata(videoId: string): Promise<AudioResult['info']> {
  const fallback = {
    title: `YouTube-${videoId}`,
    artist: 'YouTube',
    duration: null as number | null,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };

  try {
    // Try oembed (no auth needed, lightweight)
    const res = await fetch(`https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${videoId}&format=json`);
    if (res.ok) {
      const data = await res.json();
      return {
        title: data.title || fallback.title,
        artist: data.author_name || fallback.artist,
        duration: null,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      };
    }
  } catch { /* ignore */ }

  return fallback;
}

// ─── Main: try all methods with fallback chain ───
async function getAudioStreamUrl(videoId: string): Promise<AudioResult> {
  const methods = [
    { name: 'Cobalt', fn: () => tryCobaltAPI(videoId) },
    { name: 'YouTube Internal', fn: () => tryYouTubeInternal(videoId) },
    { name: 'Piped', fn: () => tryPipedAPI(videoId) },
    { name: 'Invidious', fn: () => tryInvidiousAPI(videoId) },
  ];

  const errors: string[] = [];

  for (const method of methods) {
    try {
      const result = await method.fn();
      if (result) return result;
      errors.push(`${method.name}: no result`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${method.name}: ${msg}`);
    }
  }

  console.error('All methods failed:', errors.join(' | '));
  throw new Error(
    'Could not extract audio. The video may be unavailable, age-restricted, or region-locked. Please try a different video.'
  );
}

// ─── Download audio from URL ───
async function downloadAudio(audioUrl: string): Promise<Uint8Array> {
  console.log('📥 Downloading audio...');

  const response = await fetch(audioUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  console.log(`📦 Downloaded: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
  return new Uint8Array(buffer);
}

// ─── Edge function handler ───
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;

    // Parse request
    const { youtubeUrl } = await req.json();
    if (!youtubeUrl) {
      return new Response(
        JSON.stringify({ error: 'YouTube URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      return new Response(
        JSON.stringify({ error: 'Invalid YouTube URL format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📥 Processing: ${videoId} for user: ${userId}`);

    // Extract audio URL
    const { audioUrl, info } = await getAudioStreamUrl(videoId);

    // Download audio
    const audioBuffer = await downloadAudio(audioUrl);

    const title = info.title.replace(/[<>:"/\\|?*]/g, '');
    const artist = info.artist;
    const duration = info.duration;
    const thumbnail = info.thumbnail;

    console.log(`📝 "${title}" by ${artist} (${duration}s)`);

    // Upload to storage
    const trackId = crypto.randomUUID();
    const filePath = `${userId}/${trackId}.mp3`;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log('☁️ Uploading to storage...');
    const { error: uploadError } = await supabaseAdmin.storage
      .from('music-files')
      .upload(filePath, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Failed to upload audio file' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Save metadata
    console.log('💾 Saving metadata...');
    const { error: dbError } = await supabaseAdmin
      .from('tracks')
      .insert({
        id: trackId,
        user_id: userId,
        title,
        artist,
        duration,
        file_path: filePath,
        cover_url: thumbnail,
        last_synced: new Date().toISOString(),
      });

    if (dbError) {
      await supabaseAdmin.storage.from('music-files').remove([filePath]);
      console.error('DB error:', dbError);
      return new Response(
        JSON.stringify({ error: 'Failed to save track metadata' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get signed URL
    const { data: urlData } = await supabaseAdmin.storage
      .from('music-files')
      .createSignedUrl(filePath, 3600);

    console.log(`✅ Imported: "${title}"`);

    return new Response(
      JSON.stringify({
        success: true,
        track: {
          id: trackId,
          title,
          artist,
          duration,
          cover_url: thumbnail,
          file_path: filePath,
          signed_url: urlData?.signedUrl,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('YouTube to MP3 error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: `Import failed: ${errorMessage}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
