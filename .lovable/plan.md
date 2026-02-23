

# Smart Song Recommendations Based on Your Library

## Overview

When a user's library reaches 50+ songs, the app will analyze their music taste and suggest similar songs they might enjoy. This uses AI to detect genres from track titles and artists, then searches for matching music.

## How It Works

1. **Genre Detection**: A backend function uses AI (Gemini) to classify each track's genre based on its title and artist name
2. **Taste Profile**: The system builds a genre distribution (e.g., 40% Pop, 30% Hip-Hop, 20% R&B, 10% Rock)
3. **Smart Search**: It generates search queries weighted by the user's top genres and searches for new songs
4. **Recommendations Panel**: A new UI section appears in the player once the 50-track threshold is met

## Technical Changes

### 1. Database: Add genre column to tracks table

Add a nullable `genre` column to the existing `tracks` table so genres persist across sessions.

```text
ALTER TABLE tracks ADD COLUMN genre text;
```

### 2. New Edge Function: `classify-genres`

- Accepts a batch of track titles + artists
- Uses Lovable AI (Gemini Flash) to classify each into a genre (Pop, Rock, Hip-Hop, R&B, Electronic, Classical, Jazz, Country, Latin, Bollywood, K-Pop, Metal, Reggae, Folk, Other)
- Returns genre labels for each track
- No additional API keys needed -- uses the built-in LOVABLE_API_KEY

### 3. New Edge Function: `get-recommendations`

- Queries the user's tracks to build a genre profile
- If fewer than 50 tracks, returns empty (threshold not met)
- Generates weighted search queries based on top genres
- Calls the existing `youtube-search` logic to find matching songs
- Filters out songs already in the user's library
- Returns 10-15 recommendations

### 4. New Component: `SongRecommendations`

- Appears as a collapsible section in the music player (below the playlist)
- Shows a "Discover Music" button/section when 50+ tracks exist
- Displays recommended songs with thumbnails, title, artist
- One-click "Add" button to import each recommendation (reuses existing YouTube import flow)
- Refreshable -- user can request new recommendations
- Shows the user's top genres as tags/badges

### 5. Integration into MusicPlayer

- After tracks load, check count >= 50
- If threshold met, show the recommendations component
- Genre classification runs in background on tracks that don't have a genre yet

## What Stays the Same

- All existing playback, visualizer, and playlist functionality
- YouTube search and import flow (reused by recommendations)
- Storage architecture and sync system

## Steps

1. Add `genre` column to `tracks` table via migration
2. Create `classify-genres` edge function using Lovable AI
3. Create `get-recommendations` edge function
4. Build `SongRecommendations` UI component
5. Integrate into MusicPlayer with 50-track threshold check
6. Deploy and test end-to-end

