'use strict';
// The SDK helper owns authorization and session tokens. Only public friend data crosses this pipe.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const { createInterface } = require('node:readline');
const { randomBytes } = require('node:crypto');
const validId = (id) => typeof id === 'string' && /^\d{15,22}$/.test(id);

const ERRORS = {
  authorization_error: 'Discord authorization failed. Check the application’s Social SDK setup and callback URL.',
  token_error: 'Discord could not finish sign-in. Check that Public Client is enabled for this application.',
  connection_error: 'Discord’s social connection was interrupted. Connect again to retry.',
  session_expired: 'Your Discord session needs a new sign-in. Connect again to continue.'
};

function createSocial({ executable, getClientId, onState = () => {}, spawnImpl = spawn, exists = fs.existsSync, authTimeout = 120000 }) {
  let processHandle = null, timer = null;
  let state = { phase: 'disconnected', friends: [], error: '' };
  let serial = 0, historyRequest = 0, refreshTimer = null, pending = new Map(), cooldown = 0;
  function patch(next) { return publish({ ...state, ...next }); }
  function write(command) {
    if (state.phase !== 'ready' || !processHandle?.stdin?.writable) return false;
    try { processHandle.stdin.write(command + '\n'); return true; } catch { return false; }
  }
  function request(operation, args, details = {}) {
    const id = ++serial;
    if (!write(operation + ' ' + id + (args ? ' ' + args : ''))) return 0;
    const timeout = setTimeout(() => operationResult({ event: 'error', operation, request: id, timeout: true }), 20000);
    timeout.unref?.(); pending.set(id, { operation, ...details, timeout }); return id;
  }
  function operationResult(data) {
    if (data.event === 'voice_audio') return patch({ voiceAudio: state.phase === 'ready' && !!state.voice?.active && !state.voice?.deaf && data.audible === true });
    if (data.event === 'voice') {
      return patch({ voiceAudio: !!data.active && !data.deaf && !!state.voiceAudio, voice: { active: !!data.active, joining: !!state.voice?.joining && !data.active,
        code: state.voice?.code || '', status: String(data.status || '').slice(0, 40), muted: !!data.muted, deaf: !!data.deaf,
        participants: Array.isArray(data.participants) ? data.participants.slice(0, 100).filter((p) => p && validId(p.id)).map((p) => ({ id: p.id, name: String(p.name || 'Discord user').slice(0, 200) })) : [] } });
    }
    if (data.event === 'changed') {
      if (data.recipient === state.conversation?.recipient) {
        clearTimeout(refreshTimer); refreshTimer = setTimeout(() => openConversation(data.recipient, true), 400);
      }
      return;
    }
    const call = pending.get(data.request);
    if (!call || (data.event !== 'error' && data.event !== ({ history: 'history', send: 'sent', summaries: 'summaries' })[call.operation])) return;
    clearTimeout(call.timeout); pending.delete(data.request);
    if (data.event === 'error') {
      let error = data.timeout ? 'Discord did not confirm this request. Check Discord before retrying a message.'
        : data.http === 429 ? 'Discord rate limited this request. Wait before trying again.'
        : call.operation === 'history' && data.http === 404 ? 'No conversation history is available to Astrum yet. The SDK may require both people to have used Astrum.'
        : 'Discord could not complete this ' + call.operation + ' request' + (Number.isInteger(data.code) && data.code ? ' (' + data.code + ')' : '') + '.';
      if (data.http === 429) cooldown = Date.now() + Math.max(1000, Math.min(7200000, (+data.retry || 30) * 1000));
      if (call.operation === 'history') { if (data.request === historyRequest) patch({ conversation: { ...state.conversation, loading: false, error } }); }
      else if (call.operation === 'send') patch({ sending: false, sendError: error });
      else if (call.operation === 'room') patch({ voice: { ...state.voice, joining: false, error } });
      else patch({ actionError: error });
      return;
    }
    if (data.event === 'history' && data.request === historyRequest && data.recipient === state.conversation?.recipient) {
      const messages = (Array.isArray(data.messages) ? data.messages : []).slice(0, 200).filter((m) => m && validId(m.id)).map((m) => ({
        id: m.id, author: String(m.author || 'Discord user').slice(0, 200), content: String(m.content || '').slice(0, 10000), time: Number.isFinite(m.time) ? m.time : 0, canOpen: !!m.canOpen
      }));
      patch({ conversation: { recipient: data.recipient, messages, loading: false, error: '' } });
    } else if (data.event === 'sent') {
      patch({ sending: false, sendError: '', sent: (state.sent || 0) + 1, sentRecipient: call.recipient });
      if (call.recipient === state.conversation?.recipient) openConversation(call.recipient, true);
    } else if (data.event === 'summaries') patch({ conversations: (Array.isArray(data.conversations) ? data.conversations : []).slice(0, 2000).filter((c) => c && validId(c.id)).map((c) => ({ id: c.id, name: String(c.name || 'Discord user').slice(0, 200) })), actionError: '' });
  }
  function allowedRecipient(id) { return validId(id) && (state.friends.some((f) => f.id === id) || state.conversations?.some((c) => c.id === id)); }
  function openConversation(id, preserve = false) {
    if (!allowedRecipient(id) || Date.now() < cooldown || state.phase !== 'ready') return state;
    // Switching conversations never moves messages or drafts to a different recipient.
    patch({ conversation: { recipient: id, messages: preserve ? state.conversation?.messages || [] : [], loading: true, error: '' } });
    historyRequest = request('history', id); return state;
  }
  function sendMessage(id, text) {
    if (!allowedRecipient(id) || state.conversation?.recipient !== id || typeof text !== 'string' || !text.trim() || text.length > 2000 || state.phase !== 'ready' || state.sending) return { ok: false, error: 'Choose a conversation and enter a message of up to 2,000 characters.' };
    if (Date.now() < cooldown) return { ok: false, error: 'Discord rate limited requests. Please wait before sending again.' };
    patch({ sending: true, sendError: '' });
    const sent = request('send', id + ' ' + Buffer.from(text, 'utf8').toString('hex'), { recipient: id });
    if (!sent) patch({ sending: false, sendError: 'Discord is disconnected.' });
    return { ok: !!sent };
  }
  function voice(action, value) {
    if (state.phase !== 'ready') return state;
    if (action === 'create' || action === 'join') {
      if (state.voice?.active || state.voice?.joining || Date.now() < cooldown) return state;
      const code = action === 'create' ? 'astrum-' + randomBytes(24).toString('hex') : value;
      if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(code)) return patch({ voice: { error: 'Enter a valid Astrum voice room code.' } });
      patch({ voice: { active: false, joining: true, code, muted: true, deaf: false, participants: [], status: 'Joining' } });
      request('room', code); return state;
    }
    if (!state.voice?.active) return state;
    if (action === 'leave') { write('leave 0'); return patch({ voice: { active: false, joining: false, participants: [], code: '', muted: true, deaf: false, status: 'Disconnected' } }); }
    if ((action === 'mute' || action === 'deaf') && typeof value === 'boolean') write(action + ' 0 ' + Number(value));
    return state;
  }
  function publish(next) { state = next; onState(state); return state; }
  function stop() {
    clearTimeout(timer); timer = null;
    clearTimeout(refreshTimer); refreshTimer = null;
    for (const call of pending.values()) clearTimeout(call.timeout);
    pending.clear(); historyRequest = 0; cooldown = 0;
    const child = processHandle; processHandle = null;
    if (child) {
      // Kill only our session helper: its tokens are memory-only.
      child.kill();
    }
    return publish({ phase: 'disconnected', friends: [], error: '' });
  }
  function fail(error) {
    stop(); return publish({ phase: 'error', friends: [], error });
  }
  function connect() {
    if (processHandle) return state;
    const id = String(getClientId() || '');
    if (!/^\d{15,22}$/.test(id)) return fail('Add your Discord Application ID in setup first.');
    if (!executable || !exists(executable)) return fail('The Discord Social SDK helper has not been built for this installation.');
    publish({ phase: 'authorizing', friends: [], error: '' });
    let child;
    try { child = spawnImpl(executable, [id], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch { return fail('Could not start the Discord Social SDK helper.'); }
    processHandle = child;
    child.stdin.on('error', () => { if (processHandle === child) fail('Discord’s social session closed. Connect again to retry.'); });
    timer = setTimeout(() => { if (processHandle === child) fail('Discord sign-in timed out. Connect again to retry.'); }, authTimeout);
    timer.unref?.();
    // Read bounded newline-delimited JSON; ignore runtime diagnostics and never forward raw output.
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    let unframed = 0;
    child.stdout.on('data', (part) => {
      unframed += part.length;
      if (unframed > 1024 * 1024 && processHandle === child) fail('Discord returned an oversized response.');
      if (part.includes(10)) unframed = 0;
    });
    lines.on('line', (line) => {
      if (processHandle !== child || line.length > 1024 * 1024) return;
      let data;
      try { data = JSON.parse(line); } catch { return; }
      if (!data || typeof data !== 'object') return;
      if (data.event) {
        if (data.event === 'voice' && data.active) {
          for (const [id, call] of pending) if (call.operation === 'room') { clearTimeout(call.timeout); pending.delete(id); }
        }
        return operationResult(data);
      }
      if (ERRORS[data.phase]) return fail(ERRORS[data.phase] + (Number.isInteger(data.code) && data.code ? ' (Discord ' + data.code + ')' : ''));
      if (!['authorizing', 'exchanging', 'connecting', 'ready'].includes(data.phase)) return;
      if (data.phase === 'ready') { clearTimeout(timer); timer = null; }
      const friends = data.phase === 'ready' ? (Array.isArray(data.friends) ? data.friends.slice(0, 2000).filter((f) => f && /^\d{15,22}$/.test(f.id) && typeof f.name === 'string').map((f) => ({
        id: f.id, name: f.name.slice(0, 200), status: Number.isInteger(f.status) && f.status >= 0 && f.status <= 7 ? f.status : 7
      })) : state.friends) : [];
      if (data.phase !== 'ready') patch({ conversation: null, conversations: [], voice: null });
      patch({ phase: data.phase, friends, error: '' });
    });
    // Consume diagnostics without storing or exposing any SDK log contents.
    child.stderr.resume();
    child.on('error', () => { if (processHandle === child) fail('Could not start the Discord Social SDK helper.'); });
    child.on('exit', () => { lines.close(); if (processHandle === child) fail('Discord’s social session closed. Connect again to retry.'); });
    return state;
  }
  return { connect, stop, state: () => state, openConversation, sendMessage, voice,
    conversations: () => { if (state.phase === 'ready' && Date.now() >= cooldown && !Array.from(pending.values()).some((p) => p.operation === 'summaries')) request('summaries'); return state; },
    openMessage: (id) => { if (state.conversation?.messages?.some((m) => m.id === id && m.canOpen)) write('open 0 ' + id); }
  };
}

module.exports = { createSocial };
