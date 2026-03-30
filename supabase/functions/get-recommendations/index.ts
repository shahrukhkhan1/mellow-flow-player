import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claims, error: claimsError } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.claims.sub;

    // Get user's tracks with genres
    const { data: tracks, error: tracksError } = await supabase
      .from("tracks")
      .select("id, title, artist, genre")
      .eq("user_id", userId);

    if (tracksError) throw tracksError;

    if (!tracks || tracks.length < 5) {
      return new Response(
        JSON.stringify({ 
          recommendations: [], 
          threshold: 5, 
          currentCount: tracks?.length || 0,
          genres: {} 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build genre profile from classified tracks
    const genreCounts: Record<string, number> = {};
    let classifiedCount = 0;
    for (const track of tracks) {
      if (track.genre) {
        genreCounts[track.genre] = (genreCounts[track.genre] || 0) + 1;
        classifiedCount++;
      }
    }

    // If not enough tracks are classified yet, return early
    if (classifiedCount < 3) {
      return new Response(
        JSON.stringify({
          recommendations: [],
          genres: genreCounts,
          message: "Still classifying your library...",
          needsClassification: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sort genres by count, take top 3
    const sortedGenres = Object.entries(genreCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    const totalClassified = sortedGenres.reduce((sum, [, count]) => sum + count, 0);

    // Collect popular artists from the user's library for "more like this" queries
    const artistCounts: Record<string, number> = {};
    for (const track of tracks) {
      if (track.artist && track.artist !== 'Unknown Artist') {
        artistCounts[track.artist] = (artistCounts[track.artist] || 0) + 1;
      }
    }
    const topArtists = Object.entries(artistCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([artist]) => artist);

    // Generate search queries weighted by genre + artist similarity
    const searchQueries: string[] = [];
    const genreSearchTerms: Record<string, string[]> = {
      "Pop": ["top pop songs 2025", "popular pop music new", "best pop hits"],
      "Rock": ["best rock songs", "new rock music 2025", "rock anthems"],
      "Hip-Hop": ["new hip hop songs 2025", "best rap music", "hip hop hits"],
      "R&B": ["best r&b songs", "new r&b 2025", "smooth r&b"],
      "Electronic": ["best electronic music", "edm hits 2025", "electronic dance"],
      "Classical": ["best classical music", "classical masterpieces", "modern classical"],
      "Jazz": ["best jazz songs", "modern jazz music", "jazz classics"],
      "Country": ["top country songs 2025", "best country music", "new country"],
      "Latin": ["latin music hits", "reggaeton 2025", "latin pop"],
      "Bollywood": ["bollywood hits 2025", "new hindi songs", "bollywood music"],
      "K-Pop": ["kpop songs 2025", "best kpop", "new kpop releases"],
      "Metal": ["best metal songs", "heavy metal music", "new metal 2025"],
      "Reggae": ["best reggae songs", "reggae music", "modern reggae"],
      "Folk": ["folk music songs", "indie folk", "modern folk"],
      "Lofi": ["lofi hip hop", "lofi beats", "chill lofi music"],
      "Indie": ["indie music 2025", "best indie songs", "indie rock"],
      "Afrobeats": ["afrobeats 2025", "best afrobeats", "new afrobeats"],
      "Synthwave": ["synthwave music", "retrowave", "best synthwave"],
      "Trap": ["trap music 2025", "best trap beats", "trap hits"],
      "Other": ["trending music 2025", "viral songs", "new music"],
    };

    // Add artist-based "similar to" queries first (most personalized)
    for (const artist of topArtists) {
      searchQueries.push(`songs similar to ${artist}`);
      searchQueries.push(`${artist} best songs`);
    }

    // Then add genre-based queries
    for (const [genre, count] of sortedGenres) {
      const weight = Math.ceil((count / totalClassified) * 3);
      const terms = genreSearchTerms[genre] || genreSearchTerms["Other"];
      for (let i = 0; i < Math.min(weight, terms.length); i++) {
        searchQueries.push(terms[i]);
      }
    }

    // Deduplicate and limit
    const uniqueQueries = [...new Set(searchQueries)].slice(0, 4);

    // Helper to parse duration string to seconds
    const parseDuration = (dur: string): number => {
      if (!dur) return 0;
      const parts = dur.split(':').map(Number);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      return parts[0] || 0;
    };

    // Search YouTube for each query
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const existingTitles = new Set(tracks.map(t => t.title.toLowerCase()));
    const allResults: any[] = [];
    const seenVideoIds = new Set<string>();

    for (const query of uniqueQueries) {
      try {
        const searchResp = await fetch(`${supabaseUrl}/functions/v1/youtube-search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${anonKey}`,
          },
          body: JSON.stringify({ query }),
        });

        if (searchResp.ok) {
          const searchData = await searchResp.json();
          const results = searchData.results || [];
          
          for (const r of results) {
            if (seenVideoIds.has(r.videoId)) continue;
            if (existingTitles.has(r.title.toLowerCase())) continue;
            
            // Filter out videos longer than 10 minutes
            const durationSecs = parseDuration(r.duration);
            if (durationSecs > 600) continue;
            
            seenVideoIds.add(r.videoId);
            allResults.push(r);
          }
        }
      } catch (e) {
        console.error(`Search failed for query "${query}":`, e);
      }
    }

    // Return top 12 recommendations
    const recommendations = allResults.slice(0, 12);

    return new Response(
      JSON.stringify({
        recommendations,
        genres: genreCounts,
        topGenres: sortedGenres.map(([genre, count]) => ({
          genre,
          count,
          percentage: Math.round((count / classifiedCount) * 100),
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("get-recommendations error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to get recommendations" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
