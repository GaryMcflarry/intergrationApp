'use strict';
/* Spotify sign-in for a desktop app: it happens in your own browser (Spotify's page, with its Google / Apple / Facebook
   buttons working), then Spotify sends the browser back to this app's local address with a one-time code, which the
   app swaps for the sign-in itself (PKCE: no secret). The sign-in is kept by the app and handed to the island. */
const crypto = require('node:crypto');

const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing user-library-read user-library-modify ' +
  'user-read-recently-played user-top-read playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public streaming user-read-email user-read-private';
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function createSpotifyAuth({ getClientId, redirectUri, saveToken, fetchImpl = fetch, now = Date.now }) {
  const pending = new Map();   // state -> { verifier, t }
  function login() {
    const clientId = getClientId(); if (!clientId) return null;
    for (const [k, v] of pending) if (now() - v.t > 600000) pending.delete(k);
    const verifier = b64url(crypto.randomBytes(48)), state = b64url(crypto.randomBytes(16));
    pending.set(state, { verifier, t: now() });
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    return 'https://accounts.spotify.com/authorize?' + new URLSearchParams({ response_type: 'code', client_id: clientId, scope: SCOPES, redirect_uri: redirectUri, code_challenge_method: 'S256', code_challenge: challenge, state, show_dialog: 'false' });
  }
  async function callback(params) {
    if (params.get('error')) throw new Error('Spotify said: ' + params.get('error'));
    const p = pending.get(params.get('state') || '');
    if (!p || now() - p.t > 600000) throw new Error('That sign-in did not start here (or took too long): start again');
    pending.delete(params.get('state'));
    const r = await fetchImpl('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: params.get('code') || '', redirect_uri: redirectUri, client_id: getClientId(), code_verifier: p.verifier }).toString()
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.error || ('Spotify answered ' + r.status));
    const token = { access: j.access_token, refresh: j.refresh_token, exp: now() + ((j.expires_in || 3600) - 60) * 1000, scope: j.scope || '' };
    saveToken(token);
    return token;
  }
  return { login, callback };
}

module.exports = { createSpotifyAuth, SCOPES };
