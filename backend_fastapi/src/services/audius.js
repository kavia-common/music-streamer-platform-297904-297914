'use strict';
/**
 * Audius API helper: search and stream proxy.
 * Note: For simplicity we use the public Audius discovery endpoint.
 */
const fetch = require('node-fetch');

const AUDIUS_API = 'https://discovery-provider.audius.co';

async function search(query) {
  const url = `${AUDIUS_API}/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=spotify_clone_demo`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Audius search failed: ${resp.status}`);
  }
  const json = await resp.json();
  return json?.data || [];
}

async function getTrackStreamUrl(trackId) {
  const url = `${AUDIUS_API}/v1/tracks/${encodeURIComponent(trackId)}/stream?app_name=spotify_clone_demo`;
  // We return the URL; callers can redirect/pipe
  return url;
}

module.exports = { search, getTrackStreamUrl };
