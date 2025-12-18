# Supabase Integration

This backend uses Supabase for:
- Users table (email-only demo auth)
- Playlists and playlist tracks
- Recently played logs

Configuration:
- Set SUPABASE_URL and SUPABASE_KEY in backend_fastapi/.env
- Do not expose SUPABASE_KEY to the frontend

Schema (dev bootstrap):
- The backend attempts lightweight bootstrap using an RPC `exec_sql` to run DDL. If your project doesn't have this RPC enabled, please create the following tables via SQL in Supabase:

```sql
create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamp with time zone default now()
);

create table if not exists playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamp with time zone default now()
);

create table if not exists playlist_tracks (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references playlists(id) on delete cascade,
  track_id text not null,
  track_title text,
  artist_name text,
  artwork_url text,
  created_at timestamp with time zone default now()
);

create table if not exists plays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  track_id text not null,
  track_title text,
  artist_name text,
  played_at timestamp with time zone default now()
);
```

Auth Notes:
- For this vertical slice, we issue a pseudo-token equal to the `users.id` UUID.
- The frontend stores the token in localStorage and sends it as a Bearer token.
- Replace with Supabase Auth in a future iteration if desired.
