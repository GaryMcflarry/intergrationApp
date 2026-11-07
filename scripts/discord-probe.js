'use strict';
// Read-only local capability check. Never sets presence, posts messages, or logs credentials.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Client } = require('@xhayper/discord-rpc');

async function probe({ clientId, makeClient = (id) => new Client({ clientId: id }), timeout = 8000 } = {}) {
  if (!/^\d{15,22}$/.test(clientId || '')) return { connected: false, reason: 'missing_application_id' };
  const client = makeClient(clientId);
  let timer;
  async function inspect() {
    await client.connect();
    const result = { connected: true, capabilities: {} };
    for (const [name, command] of [['friends', 'GET_RELATIONSHIPS'], ['voiceSettings', 'GET_VOICE_SETTINGS']]) {
      try {
        await client.request(command);
        // Deliberately discard personal information; this check reports access only.
        result.capabilities[name] = { accessible: true };
      } catch (e) {
        result.capabilities[name] = { accessible: false, code: Number.isFinite(Number(e.code)) ? Number(e.code) : null };
      }
    }
    return result;
  }
  try {
    return await Promise.race([
      inspect(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeout); })
    ]);
  } catch (e) {
    return { connected: false, reason: e.message === 'timeout' ? 'timeout' : 'discord_not_reachable' };
  } finally {
    clearTimeout(timer);
    try { await client.destroy(); } catch { /* Discord may already have closed the socket. */ }
  }
}

function savedApplicationId() {
  const base = process.platform === 'win32' ? process.env.APPDATA : process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support') : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  if (!base) return '';
  try { return JSON.parse(fs.readFileSync(path.join(base, 'integrationApp', 'store.json'), 'utf8')).settings?.discordId || ''; }
  catch { return ''; }
}

if (require.main === module) {
  probe({ clientId: savedApplicationId() }).then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.connected ? 0 : 1;
  });
}

module.exports = { probe };
