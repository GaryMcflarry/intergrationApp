'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { probe } = require('../scripts/discord-probe');
const clientId = '123456789012345678';

test('Discord probe discards private data and reports missing authorization without changing activity', async () => {
  const commands = [];
  let closed = false;
  const result = await probe({ clientId, makeClient: () => ({
    connect: async () => {},
    request: async (command) => {
      commands.push(command);
      if (command === 'GET_VOICE_SETTINGS') throw Object.assign(new Error('private error details'), { code: 4006 });
      return { data: { relationships: [{ username: 'private friend' }] } };
    },
    destroy: async () => { closed = true; }
  }) });
  assert.deepEqual(commands, ['GET_RELATIONSHIPS', 'GET_VOICE_SETTINGS']);
  assert.deepEqual(result, { connected: true, capabilities: { friends: { accessible: true }, voiceSettings: { accessible: false, code: 4006 } } });
  assert.equal(closed, true);
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('Discord probe handles a missing app ID, unavailable Discord, and timeout', async () => {
  assert.deepEqual(await probe(), { connected: false, reason: 'missing_application_id' });
  assert.deepEqual(await probe({ clientId, makeClient: () => ({ connect: async () => { throw new Error('secret'); }, destroy: async () => {} }) }), { connected: false, reason: 'discord_not_reachable' });
  let closed = false;
  assert.deepEqual(await probe({ clientId, timeout: 5, makeClient: () => ({ connect: () => new Promise(() => {}), destroy: async () => { closed = true; } }) }), { connected: false, reason: 'timeout' });
  assert.equal(closed, true);
});
