# music-streamer-platform-297904-297914

Backend (Express) runs on port 3001 by default.
Environment variables required:
- SUPABASE_URL
- SUPABASE_KEY

Endpoints (prefix /api):
- POST /auth/signup {email}
- POST /auth/signin {email}
- POST /auth/signout (Bearer token)
- GET /me
- GET /playlists
- POST /playlists {name, description}
- GET /playlists/:id
- PUT /playlists/:id
- DELETE /playlists/:id
- POST /playlists/:id/tracks {track_id, track_title, artist_name, artwork_url}
- DELETE /playlists/:id/tracks/:trackId
- GET /recently-played
- POST /recently-played {track_id, track_title, artist_name}
- GET /stats/summary
- GET /search?q=
- GET /tracks/:id/stream

CORS allows requests from any origin during development.