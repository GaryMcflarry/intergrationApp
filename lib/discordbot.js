'use strict';
/* Discord messages for the island: a Discord bot of your own, added to your server, reads the latest messages in the
   channels you pick. (Discord does not let apps read your personal messages or DMs; a bot only sees servers it is in,
   and needs the Message Content intent switched on in the developer portal to see what messages say.) */
const API = 'https://discord.com/api/v10';

function avatarUrl(u) {
  if (!u) return '';
  if (u.avatar) return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`;
  const n = u.discriminator && u.discriminator !== '0' ? Number(u.discriminator) % 5 : Number((BigInt(u.id || 0) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${n}.png`;
}
// mentions, channels and custom emoji as people read them
function readable(content, m, channels) {
  const names = {}; (m.mentions || []).forEach((u) => { names[u.id] = u.global_name || u.username; });
  return String(content || '')
    .replace(/<@!?(\d+)>/g, (_, id) => '@' + (names[id] || 'someone'))
    .replace(/<#(\d+)>/g, (_, id) => '#' + ((channels[id] && channels[id].name) || 'channel'))
    .replace(/<a?:(\w+):\d+>/g, ':$1:')
    .replace(/<@&\d+>/g, '@role');
}
function mapMessage(m, ch, channels = {}) {
  const text = readable(m.content, m, channels);
  return {
    id: m.id, channel: ch.id, channelName: ch.name, guild: ch.guild_id || '', guildName: ch.guildName || '',
    author: { name: (m.author && (m.author.global_name || m.author.username)) || 'Someone', avatar: avatarUrl(m.author), bot: !!(m.author && m.author.bot) },
    content: text || (m.attachments && m.attachments.length ? '📎 ' + m.attachments.length + ' attachment' + (m.attachments.length > 1 ? 's' : '') : m.embeds && m.embeds.length ? '(embed)' : ''),
    ts: Date.parse(m.timestamp) || 0,
    url: `https://discord.com/channels/${ch.guild_id || '@me'}/${ch.id}/${m.id}`
  };
}

function createBot({ getToken, getChannels, onFeed = () => {}, fetchImpl = fetch, every = 20000 }) {
  const info = {}; let timer = null, feed = { configured: false, messages: [], channels: [], error: '' }, me = null;
  async function call(path) {
    const token = getToken(); if (!token) throw Object.assign(new Error('no bot token'), { code: 'NOTOKEN' });
    for (let i = 0; i < 3; i++) {
      const r = await fetchImpl(API + path, { headers: { Authorization: 'Bot ' + token, 'User-Agent': 'integrationApp (desktop, 1.0)' } });
      if (r.status === 429) { const j = await r.json().catch(() => ({})); await new Promise((res) => setTimeout(res, Math.min(10, j.retry_after || 2) * 1000)); continue; }
      const j = await r.json().catch(() => null);
      if (!r.ok) throw Object.assign(new Error((j && j.message) || ('Discord answered ' + r.status)), { status: r.status });
      return j;
    }
    throw new Error('Discord is busy: try again soon');
  }
  async function whoami() { me = await call('/users/@me'); return me; }
  async function channelInfo(id) {
    if (info[id]) return info[id];
    const ch = await call('/channels/' + id);
    if (ch.guild_id) { try { const g = await call('/guilds/' + ch.guild_id); ch.guildName = g.name; } catch { ch.guildName = ''; } }
    info[id] = ch; return ch;
  }
  // the servers the bot is in, and their text channels (for picking which to follow)
  async function listChannels() {
    const guilds = await call('/users/@me/guilds');
    const out = [];
    for (const g of guilds.slice(0, 20)) {
      try {
        const chans = await call('/guilds/' + g.id + '/channels');
        out.push({ id: g.id, name: g.name, channels: chans.filter((c) => c.type === 0 || c.type === 5).sort((a, b) => a.position - b.position).map((c) => ({ id: c.id, name: c.name })) });
      } catch (e) { out.push({ id: g.id, name: g.name, channels: [], error: e.message }); }
    }
    return out;
  }
  async function refresh() {
    const ids = (getChannels() || []).slice(0, 8);
    if (!getToken()) { feed = { configured: false, messages: [], channels: [], error: '' }; onFeed(feed); return feed; }
    const all = [], chans = [], errors = [];
    for (const id of ids) {
      try {
        const ch = await channelInfo(id);
        chans.push({ id: ch.id, name: ch.name, guild: ch.guild_id || '', guildName: ch.guildName || '' });
        const msgs = await call('/channels/' + id + '/messages?limit=15');
        msgs.forEach((m) => all.push(mapMessage(m, ch, info)));
      } catch (e) { errors.push(e.status === 403 ? 'the bot cannot read one of the channels (its permissions)' : e.message); }
    }
    all.sort((a, b) => b.ts - a.ts);
    const blank = all.length && all.every((m) => !m.content);
    feed = { configured: true, channels: chans, messages: all.slice(0, 60), error: errors[0] || (blank ? 'Messages arrive without their text: switch on the Message Content intent for your bot' : ''), bot: me ? me.username : '' };
    onFeed(feed); return feed;
  }
  function start() { stop(); refresh().catch(() => {}); timer = setInterval(() => refresh().catch(() => {}), every); }
  function stop() { clearInterval(timer); timer = null; }
  return { start, stop, refresh, listChannels, whoami, feed: () => feed };
}

module.exports = { createBot, mapMessage, avatarUrl, readable };
