'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { createSocial } = require('../lib/discord-social');
const id = '123456789012345678';

function fixture(options = {}) {
  const children = [], states = [];
  const social = createSocial({ executable: '/fixture/helper.exe', getClientId: () => id, exists: () => true, onState: (s) => states.push(s),
    spawnImpl: (file, args, config) => {
      assert.deepEqual(args, [id]); assert.equal(config.windowsHide, true);
      const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill() { this.killed = true; } });
      children.push(child); return child;
    }, ...options });
  return { social, children, states, send: (value) => children.at(-1).stdout.write(JSON.stringify(value) + '\n') };
}

test('social bridge forwards only friend display fields and clears them on disconnect', () => {
  const f = fixture();
  f.social.connect(); f.social.connect();
  assert.equal(f.children.length, 1);
  f.send({ phase: 'ready', accessToken: 'secret', friends: [{ id, name: '<script>friend</script>', status: 0, token: 'secret' }, { id: '../unsafe', name: 'Invalid' }] });
  assert.deepEqual(f.social.state(), { phase: 'ready', error: '', friends: [{ id, name: '<script>friend</script>', status: 0 }] });
  assert.equal(JSON.stringify(f.states).includes('secret'), false);
  f.social.stop();
  assert.equal(f.children[0].killed, true);
  assert.deepEqual(f.social.state(), { phase: 'disconnected', friends: [], error: '' });
  f.send({ phase: 'ready', friends: [{ id, name: 'Late result', status: 0 }] });
  assert.equal(f.social.state().friends.length, 0);
});

test('chat keeps recipients separate, requires explicit sends, handles rejection and never retries messages', () => {
  const f = fixture(); f.social.connect();
  const writes = []; f.children[0].stdin.on('data', (d) => writes.push(String(d)));
  const other = '123456789012345679';
  f.send({ phase: 'ready', friends: [{ id, name: 'Friend', status: 0 }, { id: other, name: 'Other', status: 0 }] });
  assert.equal(writes.length, 0);
  f.social.openConversation(id); const first = Number(writes.at(-1).split(' ')[1]);
  f.social.openConversation(other); const second = Number(writes.at(-1).split(' ')[1]);
  f.send({ event: 'history', request: first, recipient: id, messages: [{ id, content: 'Wrong conversation' }] });
  assert.equal(f.social.state().conversation.recipient, other);
  assert.equal(f.social.state().conversation.messages.length, 0);
  f.send({ event: 'history', request: second, recipient: other, messages: [{ id, author: 'Other', content: '<script>private</script>', time: 1 }] });
  assert.equal(f.social.state().conversation.messages[0].content, '<script>private</script>');
  assert.equal(f.social.sendMessage(id, 'Wrong recipient').ok, false);
  assert.equal(f.social.sendMessage(other, '   ').ok, false);
  assert.equal(f.social.sendMessage(other, 'x'.repeat(2001)).ok, false);
  assert.equal(f.social.sendMessage(other, 'hello\n你好').ok, true);
  const sent = writes.at(-1), request = Number(sent.split(' ')[1]);
  assert.equal(Buffer.from(sent.trim().split(' ')[3], 'hex').toString('utf8'), 'hello\n你好');
  assert.equal(f.social.sendMessage(other, 'duplicate').ok, false);
  f.send({ event: 'error', request, operation: 'send', http: 429, retry: 5 });
  assert.equal(f.social.state().sending, false);
  assert.match(f.social.state().sendError, /rate limited/);
  const count = writes.length;
  assert.equal(f.social.sendMessage(other, 'retry').ok, false);
  assert.equal(writes.length, count);
  f.social.stop();
  assert.equal(f.social.state().conversation, undefined);
});

test('voice rooms start muted, validate codes, and change only through explicit commands', () => {
  const f = fixture(); f.social.connect(); const writes = [];
  f.children[0].stdin.on('data', (d) => writes.push(String(d)));
  f.send({ phase: 'ready', friends: [] });
  f.social.voice('join', 'bad\ncommand'); assert.equal(writes.length, 0);
  f.social.voice('create');
  assert.equal(f.social.state().voice.muted, true);
  assert.match(f.social.state().voice.code, /^astrum-[a-f0-9]{48}$/);
  f.social.voice('create'); assert.equal(writes.length, 1);
  f.send({ event: 'voice', active: true, status: 'Connected', muted: true, deaf: false, participants: [] });
  f.send({ event: 'voice_audio', audible: true }); assert.equal(f.social.state().voiceAudio, true);
  f.send({ event: 'voice', active: true, status: 'Connected', muted: true, deaf: true, participants: [] });
  f.send({ event: 'voice_audio', audible: true }); assert.equal(f.social.state().voiceAudio, false);
  f.send({ event: 'voice', active: false, status: 'Disconnected', participants: [] });
  assert.equal(f.social.state().voiceAudio, false);
  f.send({ event: 'voice', active: true, status: 'Connected', muted: true, deaf: false, participants: [] });
  f.social.voice('mute', false); assert.equal(writes.at(-1), 'mute 0 0\n');
  f.social.voice('deaf', true); assert.equal(writes.at(-1), 'deaf 0 1\n');
  f.social.voice('leave'); assert.equal(writes.at(-1), 'leave 0\n');
  assert.equal(f.social.state().voice.code, ''); f.social.stop();
});

test('social bridge handles missing installation, authorization failures, and stopped helpers', () => {
  const missing = fixture({ exists: () => false });
  assert.match(missing.social.connect().error, /not been built/);
  const f = fixture(); f.social.connect();
  f.send({ phase: 'token_error', code: 5000, message: 'secret' });
  assert.match(f.social.state().error, /Public Client.*5000/);
  assert.equal(JSON.stringify(f.states).includes('secret'), false);
  f.social.connect(); f.children.at(-1).emit('exit', 1);
  assert.match(f.social.state().error, /session closed/);
});

test('social bridge cancels pending authorization after timeout', async () => {
  const f = fixture({ authTimeout: 5 }); f.social.connect();
  await new Promise((r) => setTimeout(r, 15));
  assert.match(f.social.state().error, /timed out/);
  assert.equal(f.children[0].killed, true);
});
