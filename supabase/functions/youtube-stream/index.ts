import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videoId } = await req.json();
    if (!videoId || typeof videoId !== "string" || videoId.length !== 11) {
      return new Response(
        JSON.stringify({ error: "Invalid videoId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("RAPIDAPI_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "RAPIDAPI_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`🎵 Getting stream URL for: ${videoId}`);

    // Poll RapidAPI: it can return "processing" while extracting; retry a few times.
    const MAX_ATTEMPTS = 6;
    const DELAY_MS = 1500;
    let data: any = null;
    let lastStatus = "";
    let lastMsg = "";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const response = await fetch(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`, {
        headers: {
          "X-RapidAPI-Key": apiKey,
          "X-RapidAPI-Host": "youtube-mp36.p.rapidapi.com",
        },
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`RapidAPI HTTP ${response.status} (attempt ${attempt}): ${text.slice(0, 200)}`);
        if (attempt === MAX_ATTEMPTS) {
          return new Response(
            JSON.stringify({ error: "Failed to get stream URL" }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        await new Promise((r) => setTimeout(r, DELAY_MS));
        continue;
      }

      data = await response.json();
      lastStatus = data?.status || "";
      lastMsg = data?.msg || "";

      if (data?.status === "ok" && data?.link) {
        break;
      }

      // "processing" / "in process" — wait and retry
      if (data?.status === "processing" || /process/i.test(lastMsg)) {
        console.log(`⏳ Attempt ${attempt}/${MAX_ATTEMPTS}: still processing, retrying…`);
        await new Promise((r) => setTimeout(r, DELAY_MS));
        continue;
      }

      // Hard failure (e.g. fail status) — break early
      break;
    }

    if (!data || data.status !== "ok" || !data.link) {
      console.error(`RapidAPI final status: ${lastStatus}, msg: ${lastMsg}`);
      return new Response(
        JSON.stringify({
          error: lastStatus === "processing"
            ? "Track is still being prepared. Please try again in a few seconds."
            : (lastMsg || "Could not get audio URL"),
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ Stream URL ready for: "${data.title}"`);

    return new Response(
      JSON.stringify({
        audioUrl: data.link,
        title: (data.title || `YouTube-${videoId}`).replace(/[<>:"/\\|?*]/g, ""),
        artist: "YouTube",
        duration: data.duration || null,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("youtube-stream error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
