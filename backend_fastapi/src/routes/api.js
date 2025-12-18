'use strict';
const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { authRequired } = require('../middleware/auth');
const { search, getTrackStreamUrl } = require('../services/audius');

/**
 * Auth endpoints
 * Minimal email-based auth storing users table. Returns a pseudo-token (user id).
 */

// PUBLIC_INTERFACE
router.post('/auth/signup', async (req, res) => {
  /** Signup user.
   * body: { email: string, username?: string }
   * returns: { token: string, user: { user_id, username } }
   */
  try {
    if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });
    const { email, username } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email is required' });

    // For demo, profile user_id is pseudo-generated: use uuid from Supabase via RPC if available, else random
    const { data: existing } = await supabase.from('profiles').select('*').eq('user_id', email).maybeSingle();
    if (existing) {
      return res.status(200).json({ token: existing.user_id, user: existing });
    }
    // In absence of auth, use email as a deterministic UUID surrogate for demo (NOT for production)
    const fakeUuid = Buffer.from(email).toString('hex').slice(0, 32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
    const profile = {
      user_id: fakeUuid,
      username: username || email.split('@')[0],
      display_name: username || email.split('@')[0],
      avatar_url: null,
    };
    const { data, error } = await supabase.from('profiles').insert([profile]).select('*').single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ token: data.user_id, user: data });
  } catch (e) {
    console.error('signup error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// PUBLIC_INTERFACE
router.post('/auth/signin', async (req, res) => {
  /** Signin user.
   * body: { token?: string, user_id?: string, email?: string }
   * returns: { token: string, user: { user_id, username } }
   */
  try {
    if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });
    const { token, user_id, email } = req.body || {};
    const id = token || user_id || (email ? Buffer.from(email).toString('hex').slice(0, 32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5') : null);
    if (!id) return res.status(400).json({ error: 'Provide token, user_id or email' });
    const { data, error } = await supabase.from('profiles').select('*').eq('user_id', id).single();
    if (error || !data) return res.status(401).json({ error: 'Invalid credentials' });
    return res.status(200).json({ token: data.user_id, user: data });
  } catch (e) {
    console.error('signin error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// PUBLIC_INTERFACE
router.post('/auth/signout', authRequired, async (req, res) => {
  /** Signout clears client-side token; server stateless */
  return res.status(200).json({ ok: true });
});

// PUBLIC_INTERFACE
router.get('/me', authRequired, async (req, res) => {
  /** Get current user profile */
  return res.status(200).json({ user: req.user });
});

/**
 * Playlists CRUD and tracks
 */

// PUBLIC_INTERFACE
router.get('/playlists', authRequired, async (req, res) => {
  /** List current user's playlists */
  try {
    const { data, error } = await supabase
      .from('playlists')
      .select('*')
      .eq('owner_id', req.user.user_id || req.user.id)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    const items = (data || []).map(r => ({
      id: r.id,
      played_at: r.listened_at,
      seconds_listened: r.seconds_listened,
      track_id: r.track?.id,
      track_title: r.track?.title,
      artist_name: r.track?.artist_name,
      audius_track_id: r.track?.audius_track_id
    }));
    res.json({ items });
  } catch (e) {
    console.error('playlists list', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// PUBLIC_INTERFACE
router.post('/playlists', authRequired, async (req, res) => {
  /** Create playlist: body { name, description } */
  try {
    const { name, description } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { data, error } = await supabase
      .from('playlists')
      .insert([{ owner_id: req.user.user_id || req.user.id, name, description }])
      .select('*')
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) {
    console.error('playlist create', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// PUBLIC_INTERFACE
router.get('/playlists/:id', authRequired, async (req, res) => {
  /** Get playlist and tracks */
  try {
    const pid = req.params.id;
    const { data: playlist, error } = await supabase
      .from('playlists')
      .select('*')
      .eq('id', pid)
      .eq('owner_id', req.user.user_id || req.user.id)
      .single();
    if (error || !playlist) return res.status(404).json({ error: 'Not found' });

    const { data: items, error: terr } = await supabase
      .from('playlist_items')
      .select('id, added_at, track:tracks(id,title,artist_name,audius_track_id)')
      .eq('playlist_id', pid)
      .order('added_at', { ascending: false });
    if (terr) return res.status(500).json({ error: terr.message });

    const tracks = (items || []).map(it => ({
      id: it.track?.id,
      track_title: it.track?.title,
      artist_name: it.track?.artist_name,
      audius_track_id: it.track?.audius_track_id,
      added_at: it.added_at,
    }));
    res.json({ ...playlist, tracks });
  } catch (e) {
    console.error('playlist get', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// PUBLIC_INTERFACE
router.put('/playlists/:id', authRequired, async (req, res) => {
  /** Update playlist: body { name?, description? } */
  try {
    const pid = req.params.id;
    const patch = {};
    if (typeof req.body?.name === 'string') patch.name = req.body.name;
    if (typeof req.body?.description === 'string') patch.description = req.body.description;
    const { data, error } = await supabase
      .from('playlists')
      .update(patch)
      .eq('id', pid)
      .eq('owner_id', req.user.user_id || req.user.id)
      .select('*')
      .single();
    if (error || !data) return res.status(404).json({ error: 'Not found or not updated' });
    res.json(data);
  } catch (e) {
    console.error('playlist update', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// PUBLIC_INTERFACE
router.delete('/playlists/:id', authRequired, async (req, res) => {
  /** Delete playlist */
  try {
    const pid = req.params.id;
    const { error } = await supabase.from('playlists').delete().eq('id', pid).eq('owner_id', req.user.user_id || req.user.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error('playlist delete', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// PUBLIC_INTERFACE
router.post('/playlists/:id/tracks', authRequired, async (req, res) => {
  /** Add track: body { track_id, track_title, artist_name, artwork_url } */
  try {
    const pid = req.params.id;
    const { data: pl, error: plErr } = await supabase
      .from('playlists').select('id,user_id').eq('id', pid).single();
    if (plErr || !pl || pl.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    const { track_id, track_title, artist_name, artwork_url } = req.body || {};
    if (!track_id) return res.status(400).json({ error: 'track_id required' });
    const { data, error } = await supabase.from('playlist_tracks').insert([{
      playlist_id: pid, track_id, track_title, artist_name, artwork_url
    }]).select('*').single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) {
    console.error('playlist add track', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// PUBLIC_INTERFACE
router.delete('/playlists/:id/tracks/:trackId', authRequired, async (req, res) => {
  /** Remove track from playlist by audius_track_id or track uuid */
  try {
    const pid = req.params.id;
    const trackId = req.params.trackId;
    const { data: pl, error: plErr } = await supabase
      .from('playlists').select('id,owner_id').eq('id', pid).single();
    const ownerId = req.user.user_id || req.user.id;
    if (plErr || !pl || pl.owner_id !== ownerId) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    let trackUuid = trackId;
    if (trackId.length < 36) {
      const t = await supabase.from('tracks').select('id').eq('audius_track_id', trackId).maybeSingle();
      if (t?.data?.id) trackUuid = t.data.id;
    }
    const { error } = await supabase.from('playlist_items')
      .delete()
      .eq('playlist_id', pid)
      .eq('track_id', trackUuid);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error('playlist remove track', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * Recently played and stats
 */

// PUBLIC_INTERFACE
router.get('/recently-played', authRequired, async (req, res) => {
  /** Returns recent plays for current user */
  try {
    const uid = req.user.user_id || req.user.id;
    const { data, error } = await supabase
      .from('listening_history')
      .select('id, listened_at, seconds_listened, track:tracks(id,title,artist_name,audius_track_id)')
      .eq('user_id', uid)
      .order('listened_at', { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ items: data || [] });
  } catch (e) {
    console.error('recently played list', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// PUBLIC_INTERFACE
router.post('/recently-played', authRequired, async (req, res) => {
  /** Log play: body { audius_track_id, track_title, artist_name, seconds_listened? } */
  try {
    const { audius_track_id, track_title, artist_name, seconds_listened } = req.body || {};
    const aId = audius_track_id || req.body?.track_id;
    if (!aId) return res.status(400).json({ error: 'audius_track_id required' });

    // ensure track exists
    let { data: track } = await supabase.from('tracks').select('*').eq('audius_track_id', aId).maybeSingle();
    if (!track) {
      const ins = await supabase.from('tracks').insert([{
        title: track_title || 'Unknown title',
        artist_name: artist_name || '',
        audius_track_id: aId
      }]).select('*').single();
      if (ins.error) return res.status(500).json({ error: ins.error.message });
      track = ins.data;
    }

    const uid = req.user.user_id || req.user.id;
    const { data, error } = await supabase.from('listening_history').insert([{
      user_id: uid,
      track_id: track.id,
      listened_at: new Date().toISOString(),
      seconds_listened: seconds_listened || null
    }]).select('*').single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) {
    console.error('recently played create', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// PUBLIC_INTERFACE
router.get('/stats/summary', authRequired, async (req, res) => {
  /** Returns a simple summary: total plays from listening_history */
  try {
    const uid = req.user.user_id || req.user.id;
    const { count, error } = await supabase
      .from('listening_history')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ totalPlays: count || 0 });
  } catch (e) {
    console.error('stats summary', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * Audius proxy: search and stream
 */

// PUBLIC_INTERFACE
router.get('/search', authRequired, async (req, res) => {
  /** Search Audius tracks: query param q */
  try {
    const q = req.query.q || '';
    if (!q) return res.json({ items: [] });
    const results = await search(q);
    // normalize small subset for frontend
    const items = results.map(t => ({
      id: t.id,
      title: t.title,
      artist: (t.user && t.user.name) || '',
      artwork: t.artwork && (t.artwork['150x150'] || t.artwork['480x480'] || t.artwork['1000x1000']) || '',
      duration: t.duration
    }));
    res.json({ items });
  } catch (e) {
    console.error('audius search', e);
    res.status(500).json({ error: 'Audius search failed' });
  }
});

// PUBLIC_INTERFACE
router.get('/tracks/:id/stream', authRequired, async (req, res) => {
  /** Returns a redirect to the Audius streaming URL (proxy-friendly) */
  try {
    const trackId = req.params.id;
    const streamUrl = await getTrackStreamUrl(trackId);
    // Option 1: redirect so browser streams from Audius, CORS ok
    res.set('Cache-Control', 'no-store');
    return res.redirect(streamUrl);
  } catch (e) {
    console.error('audius stream', e);
    res.status(500).json({ error: 'Audius stream failed' });
  }
});

module.exports = router;
