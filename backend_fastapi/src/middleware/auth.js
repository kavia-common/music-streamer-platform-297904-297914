'use strict';
/**
 * Simple middleware to extract Authorization: Bearer <token>
 * and fetch current user profile from Supabase.
 * For demo, token is a UUID user id we issued on login as a pseudo-token.
 */
const { supabase } = require('../lib/supabase');

async function authRequired(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'Missing bearer token' });
    }
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    // Our minimal pseudo-auth: token is actually users.id.
    const { data, error } = await supabase.from('users').select('*').eq('id', token).single();
    if (error || !data) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = data;
    next();
  } catch (e) {
    console.error('authRequired error:', e);
    return res.status(500).json({ error: 'Auth middleware error' });
  }
}

module.exports = {
  authRequired,
};
