import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

// ─── Primary: RapidAPI youtube-mp36 ───
async function tryRapidAPI(videoId: string): Promise<{ audioUrl: string; title: string; artist: string; duration: number | null } | null> {
  const apiKey = Deno.env.get("RAPIDAPI_KEY");
  if (!apiKey) {
    console.log("⚠️ RAPIDAPI_KEY not configured");
    return null;
  }

  console.log("🔄 Trying RapidAPI youtube-mp36...");

  const response = await fetch(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`, {
    headers: {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": "youtube-mp36.p.rapidapi.com",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    console.log(`RapidAPI HTTP ${response.status}: ${text.slice(0, 200)}`);
    return null;
  }

  const data = await response.json();
  console.log("RapidAPI response:", JSON.stringify(data).slice(0, 300));

  if (data.status !== "ok" || !data.link) {
    console.log(`RapidAPI status: ${data.status}, msg: ${data.msg || "no link"}`);
    return null;
  }

  console.log(`✅ RapidAPI success: "${data.title}"`);
  return {
    audioUrl: data.link,
    title: data.title || `YouTube-${videoId}`,
    artist: "YouTube",
    duration: data.duration || null,
  };
}

// ─── Fallback: Get metadata via oembed ───
async function getVideoMetadata(videoId: string) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${videoId}&format=json`);
    if (res.ok) {
      const data = await res.json();
      return { title: data.title || `YouTube-${videoId}`, artist: data.author_name || "YouTube" };
    }
    await res.text();
  } catch { /* ignore */ }
  return { title: `YouTube-${videoId}`, artist: "YouTube" };
}

// ─── Download audio from URL ───
async function downloadAudio(audioUrl: string): Promise<Uint8Array> {
  console.log("📥 Downloading audio...");
  const response = await fetch(audioUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "*/*",
    },
  });

  if (!response.ok && response.status !== 206) {
    throw new Error(`Download failed: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  console.log(`📦 Downloaded: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

  if (buffer.byteLength < 1000) {
    throw new Error("Downloaded file is too small, likely an error page");
  }

  return new Uint8Array(buffer);
}

// ─── Edge function handler ───
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;

    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const youtubeUrl = body.youtubeUrl || body.url;
    if (!youtubeUrl) {
      return new Response(
        JSON.stringify({ error: "YouTube URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      return new Response(
        JSON.stringify({ error: "Invalid YouTube URL format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📥 Processing: ${videoId} for user: ${userId}`);

    // Try RapidAPI first
    const result = await tryRapidAPI(videoId);
    if (!result) {
      return new Response(
        JSON.stringify({ error: "Could not extract audio. Please check your RapidAPI key or try again later." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { audioUrl, title: rawTitle, artist, duration } = result;
    const audioBuffer = await downloadAudio(audioUrl);

    const title = rawTitle.replace(/[<>:"/\\|?*]/g, "");
    const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    console.log(`📝 "${title}" by ${artist} (${duration}s)`);

    const trackId = crypto.randomUUID();
    const filePath = `${userId}/${trackId}.mp3`;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log("☁️ Uploading to storage...");
    const { error: uploadError } = await supabaseAdmin.storage
      .from("music-files")
      .upload(filePath, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: "Failed to upload audio file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("💾 Saving metadata...");
    const { error: dbError } = await supabaseAdmin
      .from("tracks")
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
      await supabaseAdmin.storage.from("music-files").remove([filePath]);
      console.error("DB error:", dbError);
      return new Response(
        JSON.stringify({ error: "Failed to save track metadata" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: urlData } = await supabaseAdmin.storage
      .from("music-files")
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
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("YouTube to MP3 error:", error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
