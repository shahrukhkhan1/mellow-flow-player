import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SearchResult {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: string;
  views: number;
}

// Use YouTube's internal API (same as youtube.com uses)
async function searchYouTubeInternal(query: string): Promise<SearchResult[]> {
  try {
    console.log("🔍 Trying YouTube internal search...");
    
    // YouTube's internal browse endpoint
    const response = await fetch("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20231219.04.00",
            hl: "en",
            gl: "US",
          },
        },
        query: query,
        params: "EgWKAQIIAQ%3D%3D", // Filter for music/songs
      }),
    });

    if (!response.ok) {
      console.log(`YouTube internal returned ${response.status}`);
      throw new Error(`YouTube returned ${response.status}`);
    }

    const data = await response.json();
    const results: SearchResult[] = [];
    
    // Navigate the complex response structure
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    
    if (!contents) {
      console.log("No contents in response");
      return [];
    }

    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents;
      if (!items) continue;

      for (const item of items) {
        const video = item?.videoRenderer;
        if (!video?.videoId) continue;

        // Extract duration
        let duration = "0:00";
        if (video.lengthText?.simpleText) {
          duration = video.lengthText.simpleText;
        }

        // Extract view count
        let views = 0;
        if (video.viewCountText?.simpleText) {
          const viewStr = video.viewCountText.simpleText.replace(/[^0-9]/g, "");
          views = parseInt(viewStr) || 0;
        }

        results.push({
          videoId: video.videoId,
          title: video.title?.runs?.[0]?.text || "Unknown Title",
          artist: video.ownerText?.runs?.[0]?.text || "Unknown Artist",
          thumbnail: `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`,
          duration,
          views,
        });

        if (results.length >= 20) break;
      }
      if (results.length >= 20) break;
    }

    return results;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.log("YouTube internal search failed:", message);
    return [];
  }
}

// Fallback: Scrape YouTube search results
async function scrapeYouTubeSearch(query: string): Promise<SearchResult[]> {
  try {
    console.log("🔍 Trying YouTube HTML scrape...");
    
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgWKAQIIAQ%253D%253D`;
    
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      throw new Error(`YouTube returned ${response.status}`);
    }

    const html = await response.text();
    
    // Extract the initial data from the HTML
    const dataMatch = html.match(/var ytInitialData = ({.*?});<\/script>/s);
    if (!dataMatch) {
      console.log("Could not find ytInitialData");
      return [];
    }

    const data = JSON.parse(dataMatch[1]);
    const results: SearchResult[] = [];
    
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    
    if (!contents) return [];

    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents;
      if (!items) continue;

      for (const item of items) {
        const video = item?.videoRenderer;
        if (!video?.videoId) continue;

        let duration = "0:00";
        if (video.lengthText?.simpleText) {
          duration = video.lengthText.simpleText;
        }

        let views = 0;
        if (video.viewCountText?.simpleText) {
          const viewStr = video.viewCountText.simpleText.replace(/[^0-9]/g, "");
          views = parseInt(viewStr) || 0;
        }

        results.push({
          videoId: video.videoId,
          title: video.title?.runs?.[0]?.text || "Unknown Title",
          artist: video.ownerText?.runs?.[0]?.text || "Unknown Artist",
          thumbnail: `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`,
          duration,
          views,
        });

        if (results.length >= 20) break;
      }
      if (results.length >= 20) break;
    }

    return results;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.log("YouTube HTML scrape failed:", message);
    return [];
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();

    if (!query || typeof query !== "string") {
      return new Response(
        JSON.stringify({ error: "Query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`🎵 Searching for: ${query}`);

    // Try YouTube internal API first
    let results = await searchYouTubeInternal(query);
    
    // Fallback to HTML scraping
    if (results.length === 0) {
      console.log("Internal API failed, trying HTML scrape...");
      results = await scrapeYouTubeSearch(query);
    }

    console.log(`✅ Found ${results.length} results`);

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Search failed";
    console.error("Search error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
