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

// ─── Method 1: YouTube Internal API with multiple client types ───
async function tryYouTubeInternal(videoId: string): Promise<AudioResult | null> {
  // Try multiple client types - some bypass "sign in" requirements
  const clients = [
    {
      name: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
      clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
      clientVersion: '2.0',
      apiKey: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
      userAgent: 'Mozilla/5.0',
      endpoint: 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
      extraContext: {
        thirdParty: { embedUrl: 'https://www.youtube.com' }
      }
    },
    {
      name: 'IOS',
      clientName: 'IOS',
      clientVersion: '19.45.4',
      apiKey: 'AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc',
      userAgent: 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X;)',
      endpoint: 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
      extraContext: {}
    },
    {
      name: 'ANDROID',
      clientName: 'ANDROID',
      clientVersion: '19.44.38',
      apiKey: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
      userAgent: 'com.google.android.youtube/19.44.38 (Linux; U; Android 14) gzip',
      endpoint: 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
      extraContext: {}
    },
    {
      name: 'ANDROID_MUSIC',
      clientName: 'ANDROID_MUSIC',
      clientVersion: '7.27.52',
      apiKey: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
      userAgent: 'com.google.android.apps.youtube.music/7.27.52 (Linux; U; Android 14) gzip',
      endpoint: 'https://music.youtube.com/youtubei/v1/player?prettyPrint=false',
      extraContext: {}
    },
  ];

  for (const client of clients) {
    try {
      console.log(`🔄 Trying YouTube Internal (${client.name})...`);

      const body: any = {
        context: {
          client: {
            clientName: client.clientName,
            clientVersion: client.clientVersion,
            hl: 'en',
            gl: 'US',
          },
          ...client.extraContext,
        },
        videoId,
        playbackContext: {
          contentPlaybackContext: {
            signatureTimestamp: 20073,
          },
        },
        racyCheckOk: true,
        contentCheckOk: true,
      };

      // Add platform-specific fields
      if (client.clientName.includes('ANDROID')) {
        body.context.client.androidSdkVersion = 34;
        body.context.client.platform = 'MOBILE';
      }
      if (client.clientName === 'IOS') {
        body.context.client.deviceMake = 'Apple';
        body.context.client.deviceModel = 'iPhone16,2';
        body.context.client.platform = 'MOBILE';
      }

      const response = await fetch(client.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': client.userAgent,
          'X-Goog-Api-Key': client.apiKey,
          'X-YouTube-Client-Name': client.clientName === 'TVHTML5_SIMPLY_EMBEDDED_PLAYER' ? '85' : 
                                   client.clientName === 'IOS' ? '5' :
                                   client.clientName === 'ANDROID_MUSIC' ? '21' : '3',
          'X-YouTube-Client-Version': client.clientVersion,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        console.log(`${client.name}: HTTP ${response.status} - ${text.slice(0, 150)}`);
        continue;
      }

      const data = await response.json();

      if (data.playabilityStatus?.status !== 'OK') {
        console.log(`${client.name}: ${data.playabilityStatus?.reason || data.playabilityStatus?.status}`);
        continue;
      }

      const formats = [
        ...(data.streamingData?.adaptiveFormats || []),
        ...(data.streamingData?.formats || []),
      ];
      const audioFormats = formats.filter((f: any) => f.mimeType?.startsWith('audio/') && f.url);

      if (audioFormats.length === 0) {
        // Check for cipher-protected streams
        const cipherFormats = formats.filter((f: any) => f.mimeType?.startsWith('audio/') && (f.signatureCipher || f.cipher));
        if (cipherFormats.length > 0) {
          console.log(`${client.name}: Found ${cipherFormats.length} cipher-protected streams (can't decipher)`);
        } else {
          console.log(`${client.name}: No audio streams found`);
        }
        continue;
      }

      // Sort: prefer m4a, then highest bitrate
      audioFormats.sort((a: any, b: any) => {
        const aIsM4a = a.mimeType?.includes('mp4a') ? 1 : 0;
        const bIsM4a = b.mimeType?.includes('mp4a') ? 1 : 0;
        if (aIsM4a !== bIsM4a) return bIsM4a - aIsM4a;
        return (b.bitrate || 0) - (a.bitrate || 0);
      });

      const best = audioFormats[0];
      console.log(`✅ YouTube Internal (${client.name}): ${best.mimeType} (${best.bitrate}bps)`);

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
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`${client.name} error: ${msg}`);
    }
  }
  return null;
}

// ─── Method 2: Dynamic Invidious instances (fetched from API) ───
async function tryInvidiousAPI(videoId: string): Promise<AudioResult | null> {
  // First, try to get working instances from the Invidious API
  let instances: string[] = [];
  
  try {
    console.log('🔄 Fetching Invidious instances list...');
    const res = await fetch('https://api.invidious.io/instances.json?sort_by=type,health', {
      headers: { 'User-Agent': 'PocketMP3/1.0' },
    });
    if (res.ok) {
      const data = await res.json();
      // Filter for HTTPS instances with API enabled
      instances = data
        .filter((entry: any) => {
          const info = entry[1];
          return info.type === 'https' && info.api === true && info.monitor?.statusClass === 'success';
        })
        .map((entry: any) => entry[1].uri)
        .slice(0, 6); // Try top 6
      console.log(`Found ${instances.length} healthy Invidious instances`);
    }
  } catch (e) {
    console.log('Could not fetch instances list, using fallback');
  }

  // Fallback hardcoded instances (updated Feb 2026)
  if (instances.length === 0) {
    instances = [
      'https://vid.puffyan.us',
      'https://inv.tux.pizza',
      'https://invidious.protokolliansen.no',
      'https://iv.ggtyler.dev',
      'https://invidious.privacyredirect.com',
    ];
  }

  for (const instance of instances) {
    try {
      console.log(`🔄 Trying Invidious: ${instance}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`${instance}/api/v1/videos/${videoId}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'PocketMP3/1.0',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text();
        console.log(`${instance}: ${res.status} - ${text.slice(0, 150)}`);
        continue;
      }

      const ct = res.headers.get('content-type');
      if (!ct?.includes('application/json')) {
        console.log(`${instance}: non-JSON response`);
        await res.text();
        continue;
      }

      const info = await res.json();
      
      if (info.error) {
        console.log(`${instance} error: ${info.error}`);
        continue;
      }

      const audioFormats = (info.adaptiveFormats || []).filter(
        (f: any) => f.type?.startsWith('audio/') && f.url
      );

      if (audioFormats.length === 0) {
        console.log(`${instance}: No audio formats`);
        continue;
      }

      audioFormats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      const best = audioFormats[0];

      console.log(`✅ Invidious (${instance}): ${best.type}`);

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
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`${instance} failed: ${msg}`);
    }
  }
  return null;
}

// ─── Method 3: Piped API (dynamic instances) ───
async function tryPipedAPI(videoId: string): Promise<AudioResult | null> {
  // Fetch working Piped instances
  let instances: string[] = [];
  
  try {
    console.log('🔄 Fetching Piped instances...');
    const res = await fetch('https://piped-instances.kavin.rocks/', {
      headers: { 'User-Agent': 'PocketMP3/1.0' },
    });
    if (res.ok) {
      const data = await res.json();
      instances = data
        .filter((i: any) => i.api_url && !i.cdn)
        .map((i: any) => i.api_url)
        .slice(0, 5);
      console.log(`Found ${instances.length} Piped instances`);
    }
  } catch {
    console.log('Could not fetch Piped instances, using fallback');
  }

  if (instances.length === 0) {
    instances = [
      'https://pipedapi.adminforge.de',
      'https://api.piped.yt',
      'https://pipedapi.darkness.services',
    ];
  }

  for (const instance of instances) {
    try {
      console.log(`🔄 Trying Piped: ${instance}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`${instance}/streams/${videoId}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'PocketMP3/1.0',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text();
        console.log(`${instance}: ${res.status} - ${text.slice(0, 150)}`);
        continue;
      }

      const info = await res.json();
      if (info.error) {
        console.log(`Piped error: ${info.message || info.error}`);
        continue;
      }

      const streams = info.audioStreams || [];
      if (streams.length === 0) {
        console.log(`${instance}: No audio streams`);
        continue;
      }

      streams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      const best = streams[0];
      if (!best.url) continue;

      console.log(`✅ Piped (${instance}): ${best.mimeType} (${best.bitrate}bps)`);

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
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`${instance} failed: ${msg}`);
    }
  }
  return null;
}

// ─── Method 4: Cobalt API (community forks with YouTube support) ───
async function tryCobaltAPI(videoId: string): Promise<AudioResult | null> {
  // Only try the canine.tools fork which has YouTube support
  const instances = [
    'https://cobalt-backend.canine.tools',
    'https://cobalt-api.meowing.de',
  ];

  for (const instance of instances) {
    try {
      console.log(`🔄 Trying Cobalt: ${instance}`);

      const response = await fetch(instance, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'PocketMP3/1.0',
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
        console.log(`Cobalt ${instance}: ${response.status} - ${text.slice(0, 200)}`);
        continue;
      }

      const data = await response.json();
      if (data.status === 'error') {
        console.log(`Cobalt error: ${JSON.stringify(data.error || data)}`);
        continue;
      }

      const audioUrl = data.url;
      if (!audioUrl) {
        console.log('No URL in Cobalt response');
        continue;
      }

      const info = await getVideoMetadata(videoId);
      console.log(`✅ Cobalt success from ${instance}`);
      return { audioUrl, info };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`Cobalt ${instance} failed: ${msg}`);
    }
  }
  return null;
}

// ─── Get video metadata via oembed ───
async function getVideoMetadata(videoId: string): Promise<AudioResult['info']> {
  const fallback = {
    title: `YouTube-${videoId}`,
    artist: 'YouTube',
    duration: null as number | null,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };

  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${videoId}&format=json`
    );
    if (res.ok) {
      const data = await res.json();
      return {
        title: data.title || fallback.title,
        artist: data.author_name || fallback.artist,
        duration: null,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      };
    }
    await res.text();
  } catch { /* ignore */ }

  return fallback;
}

// ─── Main: try all methods with fallback chain ───
async function getAudioStreamUrl(videoId: string): Promise<AudioResult> {
  const methods = [
    { name: 'YouTube Internal', fn: () => tryYouTubeInternal(videoId) },
    { name: 'Invidious', fn: () => tryInvidiousAPI(videoId) },
    { name: 'Piped', fn: () => tryPipedAPI(videoId) },
    { name: 'Cobalt', fn: () => tryCobaltAPI(videoId) },
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
    'Could not extract audio. All extraction services are currently unavailable. Please try again later or try a different video.'
  );
}

// ─── Download audio from URL ───
async function downloadAudio(audioUrl: string): Promise<Uint8Array> {
  console.log('📥 Downloading audio...');

  const response = await fetch(audioUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Range': 'bytes=0-',
    },
  });

  if (!response.ok && response.status !== 206) {
    throw new Error(`Download failed: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  console.log(`📦 Downloaded: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
  
  if (buffer.byteLength < 1000) {
    throw new Error('Downloaded file is too small, likely an error page');
  }
  
  return new Uint8Array(buffer);
}

// ─── Edge function handler ───
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const youtubeUrl = body.youtubeUrl || body.url;
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

    const { audioUrl, info } = await getAudioStreamUrl(videoId);

    const audioBuffer = await downloadAudio(audioUrl);

    const title = info.title.replace(/[<>:"/\\|?*]/g, '');
    const artist = info.artist;
    const duration = info.duration;
    const thumbnail = info.thumbnail;

    console.log(`📝 "${title}" by ${artist} (${duration}s)`);

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
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('YouTube to MP3 error:', error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
