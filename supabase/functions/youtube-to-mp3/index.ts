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

// Use Cobalt API (open-source, no API key required)
async function downloadAudioFromYouTube(videoId: string): Promise<{ audioBuffer: Uint8Array; info: { title: string; artist: string; duration: number | null; thumbnail: string | null } }> {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  // Try Cobalt API first (cobalt.tools - open source)
  try {
    console.log('🔄 Trying Cobalt API...');
    const cobaltResponse = await fetch('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: youtubeUrl,
        isAudioOnly: true,
        aFormat: 'mp3',
        filenamePattern: 'basic',
      }),
    });

    if (cobaltResponse.ok) {
      const cobaltData = await cobaltResponse.json();
      console.log('Cobalt response:', JSON.stringify(cobaltData));
      
      if (cobaltData.status === 'stream' || cobaltData.status === 'redirect') {
        const audioUrl = cobaltData.url;
        console.log('📥 Downloading audio from Cobalt...');
        
        const audioResponse = await fetch(audioUrl);
        if (!audioResponse.ok) {
          throw new Error(`Failed to download audio: ${audioResponse.status}`);
        }
        
        const audioBuffer = new Uint8Array(await audioResponse.arrayBuffer());
        
        // Extract title from Cobalt or use default
        const title = cobaltData.filename?.replace(/\.[^/.]+$/, '') || `YouTube-${videoId}`;
        
        return {
          audioBuffer,
          info: {
            title,
            artist: 'YouTube',
            duration: null,
            thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          },
        };
      }
    }
  } catch (cobaltError) {
    console.log('Cobalt API failed:', cobaltError);
  }
  
  // Fallback: Use yt-dlp.org API
  try {
    console.log('🔄 Trying yt-dlp.org API...');
    
    // First get video info
    const infoResponse = await fetch(`https://yt-dlp.org/api/info?url=${encodeURIComponent(youtubeUrl)}`);
    
    if (infoResponse.ok) {
      const videoInfo = await infoResponse.json();
      console.log('Got video info:', videoInfo.title);
      
      // Get audio download URL
      const downloadResponse = await fetch(`https://yt-dlp.org/api/download?url=${encodeURIComponent(youtubeUrl)}&format=bestaudio`);
      
      if (downloadResponse.ok) {
        const downloadData = await downloadResponse.json();
        const audioUrl = downloadData.url;
        
        const audioResponse = await fetch(audioUrl);
        if (audioResponse.ok) {
          const audioBuffer = new Uint8Array(await audioResponse.arrayBuffer());
          
          return {
            audioBuffer,
            info: {
              title: videoInfo.title || `YouTube-${videoId}`,
              artist: videoInfo.uploader || 'YouTube',
              duration: videoInfo.duration || null,
              thumbnail: videoInfo.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            },
          };
        }
      }
    }
  } catch (ytdlpError) {
    console.log('yt-dlp.org API failed:', ytdlpError);
  }

  // Final fallback: Use a simpler proxy approach with Invidious
  try {
    console.log('🔄 Trying Invidious API...');
    
    // Get video info from Invidious
    const invidiousInstances = [
      'https://invidious.io',
      'https://vid.puffyan.us',
      'https://inv.riverside.rocks',
    ];
    
    for (const instance of invidiousInstances) {
      try {
        const infoResponse = await fetch(`${instance}/api/v1/videos/${videoId}`);
        if (!infoResponse.ok) continue;
        
        const videoInfo = await infoResponse.json();
        
        // Get audio-only format
        const audioFormats = videoInfo.adaptiveFormats?.filter(
          (f: any) => f.type?.startsWith('audio/')
        ) || [];
        
        if (audioFormats.length === 0) continue;
        
        // Sort by bitrate and get best quality
        audioFormats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
        const bestAudio = audioFormats[0];
        
        console.log(`📥 Downloading from Invidious (${bestAudio.type})...`);
        
        const audioResponse = await fetch(bestAudio.url);
        if (!audioResponse.ok) continue;
        
        const audioBuffer = new Uint8Array(await audioResponse.arrayBuffer());
        
        return {
          audioBuffer,
          info: {
            title: videoInfo.title || `YouTube-${videoId}`,
            artist: videoInfo.author || 'YouTube',
            duration: videoInfo.lengthSeconds || null,
            thumbnail: videoInfo.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          },
        };
      } catch (instanceError) {
        console.log(`${instance} failed:`, instanceError);
        continue;
      }
    }
  } catch (invidiousError) {
    console.log('Invidious failed:', invidiousError);
  }

  throw new Error('All download methods failed. YouTube may be blocking requests.');
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

    // Download audio
    const { audioBuffer, info } = await downloadAudioFromYouTube(videoId);
    
    const title = info.title.replace(/[<>:"/\\|?*]/g, ''); // Clean filename
    const artist = info.artist;
    const duration = info.duration;
    const thumbnail = info.thumbnail;

    console.log(`📝 Video info: "${title}" by ${artist} (${duration}s)`);
    console.log(`📦 Audio size: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`);

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
