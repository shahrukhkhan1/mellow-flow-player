import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_GENRES = [
  "Pop", "Rock", "Hip-Hop", "R&B", "Electronic", "Classical", "Jazz",
  "Country", "Latin", "Bollywood", "K-Pop", "Metal", "Reggae", "Folk",
  "Lofi", "Indie", "Afrobeats", "Dancehall", "Punk", "Blues", "Soul",
  "Funk", "Ambient", "Synthwave", "Trap", "Drill", "Reggaeton", "Other"
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tracks } = await req.json();

    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
      return new Response(
        JSON.stringify({ error: "tracks array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build prompt with track list
    const trackList = tracks.map((t: { id: string; title: string; artist: string }, i: number) => 
      `${i + 1}. "${t.title}" by ${t.artist}`
    ).join("\n");

    const prompt = `Classify each song into exactly ONE genre from this list: ${VALID_GENRES.join(", ")}.

Songs:
${trackList}

Return ONLY a JSON array of objects with "id" and "genre" fields. No markdown, no explanation.
Example: [{"id":"abc","genre":"Pop"},{"id":"def","genre":"Rock"}]

Use the track IDs: ${tracks.map((t: { id: string }) => t.id).join(", ")}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are a music genre classifier. Return only valid JSON arrays." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse the JSON from the response (handle markdown code blocks)
    let classifications: { id: string; genre: string }[];
    try {
      const jsonStr = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      classifications = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", content);
      // Fallback: assign "Other" to all
      classifications = tracks.map((t: { id: string }) => ({ id: t.id, genre: "Other" }));
    }

    // Validate genres
    classifications = classifications.map(c => ({
      id: c.id,
      genre: VALID_GENRES.includes(c.genre) ? c.genre : "Other",
    }));

    return new Response(
      JSON.stringify({ classifications }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("classify-genres error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Classification failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
