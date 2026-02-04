import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

// Try YouTube's internal API to get audio stream URL
async function tryYouTubeInternal(videoId: string): Promise<{ audioUrl: string; info: { title: string; artist: string; duration: number | null; thumbnail: string | null } } | null> {
  try {
    console.log('🔄 Trying YouTube internal API...');
    
    // Get video info using YouTube's internal API
    const response = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '19.09.37',
            androidSdkVersion: 30,
            hl: 'en',
            gl: 'US',
          },
        },
        videoId: videoId,
        playbackContext: {
          contentPlaybackContext: {
            signatureTimestamp: 19369,
          },
        },
        racyCheckOk: true,
        contentCheckOk: true,
      }),
    });

    if (!response.ok) {
      console.log(`YouTube internal API returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (data.playabilityStatus?.status !== 'OK') {
      console.log(`Video not playable: ${data.playabilityStatus?.reason || 'Unknown reason'}`);
      return null;
    }

    const formats = data.streamingData?.adaptiveFormats || [];
    
    // Find audio-only format (prefer m4a/mp4a)
    const audioFormats = formats.filter((f: any) => 
      f.mimeType?.startsWith('audio/') && f.url
    );
    
    if (audioFormats.length === 0) {
      console.log('No audio formats found');
      return null;
    }

    // Sort by bitrate and get best quality
    audioFormats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
    const bestAudio = audioFormats[0];
    
    const title = data.videoDetails?.title || `YouTube-${videoId}`;
    const artist = data.videoDetails?.author || 'YouTube';
    const duration = parseInt(data.videoDetails?.lengthSeconds) || null;
    const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    console.log(`✅ Found audio stream: ${bestAudio.mimeType} (${bestAudio.bitrate}bps)`);
    
    return {
      audioUrl: bestAudio.url,
      info: { title, artist, duration, thumbnail },
    };
  } catch (error) {
    console.log(`YouTube internal API failed:`, error);
    return null;
  }
}

// Try Piped API instances
async function tryPipedAPI(videoId: string): Promise<{ audioUrl: string; info: { title: string; artist: string; duration: number | null; thumbnail: string | null } } | null> {
  const pipedInstances = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.r4fo.com',
    'https://pipedapi.syncpundit.io',
    'https://pipedapi.drgns.space',
  ];
  
  for (const instance of pipedInstances) {
    try {
      console.log(`🔄 Trying Piped instance: ${instance}`);
      
      const url = `${instance}/streams/${videoId}`;
      console.log(`Fetching: ${url}`);
      
      const infoResponse = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (!infoResponse.ok) {
        console.log(`${instance} returned ${infoResponse.status}`);
        continue;
      }
      
      const videoInfo = await infoResponse.json();
      
      if (videoInfo.error) {
        console.log(`Piped error: ${videoInfo.message || videoInfo.error}`);
        continue;
      }
      
      console.log(`Got video info: ${videoInfo.title}`);
      
      // Find best audio stream
      const audioStreams = videoInfo.audioStreams || [];
      if (audioStreams.length === 0) {
        console.log('No audio streams found');
        continue;
      }
      
      // Sort by bitrate and get best quality
      audioStreams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      const bestAudio = audioStreams[0];
      
      if (!bestAudio.url) {
        console.log('No audio URL in stream');
        continue;
      }

      console.log(`✅ Found audio: ${bestAudio.mimeType} (${bestAudio.bitrate}bps)`);
      
      return {
        audioUrl: bestAudio.url,
        info: {
          title: videoInfo.title || `YouTube-${videoId}`,
          artist: videoInfo.uploader || 'YouTube',
          duration: videoInfo.duration || null,
          thumbnail: videoInfo.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        },
      };
    } catch (error) {
      console.log(`${instance} failed:`, error);
    }
  }
  
  return null;
}

// Try Invidious API
async function tryInvidiousAPI(videoId: string): Promise<{ audioUrl: string; info: { title: string; artist: string; duration: number | null; thumbnail: string | null } } | null> {
  const invidiousInstances = [
    'https://inv.nadeko.net',
    'https://invidious.fdn.fr',
    'https://inv.tux.pizza',
    'https://invidious.nerdvpn.de',
  ];
  
  for (const instance of invidiousInstances) {
    try {
      console.log(`🔄 Trying Invidious instance: ${instance}`);
      
      const infoResponse = await fetch(`${instance}/api/v1/videos/${videoId}`, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (!infoResponse.ok) {
        console.log(`${instance} returned ${infoResponse.status}`);
        continue;
      }
      
      const contentType = infoResponse.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        console.log(`${instance} returned non-JSON response`);
        continue;
      }
      
      const videoInfo = await infoResponse.json();
      
      // Get audio-only format
      const audioFormats = videoInfo.adaptiveFormats?.filter(
        (f: any) => f.type?.startsWith('audio/')
      ) || [];
      
      if (audioFormats.length === 0) {
        console.log('No audio formats found');
        continue;
      }
      
      // Sort by bitrate and get best quality
      audioFormats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      const bestAudio = audioFormats[0];
      
      if (!bestAudio.url) {
        console.log('No audio URL in format');
        continue;
      }

      console.log(`✅ Found audio: ${bestAudio.type}`);
      
      return {
        audioUrl: bestAudio.url,
        info: {
          title: videoInfo.title || `YouTube-${videoId}`,
          artist: videoInfo.author || 'YouTube',
          duration: videoInfo.lengthSeconds || null,
          thumbnail: videoInfo.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        },
      };
    } catch (error) {
      console.log(`${instance} failed:`, error);
    }
  }
  
  return null;
}

// Main function to get audio stream URL
async function getAudioStreamUrl(videoId: string): Promise<{ audioUrl: string; info: { title: string; artist: string; duration: number | null; thumbnail: string | null } }> {
  // Try YouTube internal API first (most reliable)
  let result = await tryYouTubeInternal(videoId);
  if (result) return result;
  
  // Try Piped API
  console.log('🔄 Trying Piped API...');
  result = await tryPipedAPI(videoId);
  if (result) return result;
  
  // Try Invidious API
  console.log('🔄 Trying Invidious API...');
  result = await tryInvidiousAPI(videoId);
  if (result) return result;
  
  throw new Error('All download methods failed. The video may be unavailable or region-restricted. Please try a different video.');
}

// Download audio from URL
async function downloadAudio(audioUrl: string): Promise<Uint8Array> {
  console.log('📥 Downloading audio...');
  
  const response = await fetch(audioUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status}`);
  }
  
  const buffer = await response.arrayBuffer();
  console.log(`📦 Downloaded: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
  
  return new Uint8Array(buffer);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
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

    // Get user from auth
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;

    // Parse request body
    const { youtubeUrl } = await req.json();
    if (!youtubeUrl) {
      return new Response(
        JSON.stringify({ error: 'YouTube URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract video ID
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      return new Response(
        JSON.stringify({ error: 'Invalid YouTube URL format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📥 Processing YouTube video: ${videoId} for user: ${userId}`);

    // Get audio stream URL with fallbacks
    const { audioUrl, info } = await getAudioStreamUrl(videoId);
    
    // Download the audio
    const audioBuffer = await downloadAudio(audioUrl);
    
    const title = info.title.replace(/[<>:"/\\|?*]/g, ''); // Clean filename
    const artist = info.artist;
    const duration = info.duration;
    const thumbnail = info.thumbnail;

    console.log(`📝 Video info: "${title}" by ${artist} (${duration}s)`);

    // Generate track ID and file path
    const trackId = crypto.randomUUID();
    const filePath = `${userId}/${trackId}.mp3`;

    // Upload to Supabase Storage using service role for storage access
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log('☁️ Uploading to cloud storage...');
    const { error: uploadError } = await supabaseAdmin.storage
      .from('music-files')
      .upload(filePath, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Failed to upload audio file' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Save track metadata to database
    console.log('💾 Saving track metadata...');
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
      // Cleanup uploaded file if DB insert fails
      await supabaseAdmin.storage.from('music-files').remove([filePath]);
      console.error('Database insert error:', dbError);
      return new Response(
        JSON.stringify({ error: 'Failed to save track metadata' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get signed URL for the uploaded file
    const { data: urlData } = await supabaseAdmin.storage
      .from('music-files')
      .createSignedUrl(filePath, 3600); // 1 hour

    console.log(`✅ Successfully imported: "${title}"`);

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