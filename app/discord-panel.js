/* Astrum's custom Discord workspace. All remote text is rendered as text, never HTML. */
window.DiscordPanel = (function () {
  'use strict';
  function mount(root, api) {
    root.innerHTML = '<header class="ds-head"><div><b>Discord</b><p class="ds-status" role="status"></p></div><button class="ds-connect" type="button">Connect account</button></header>' +
      '<div class="ds-work"><aside><label class="ds-find">Find a friend<input type="search" class="ds-filter" placeholder="Search friends" aria-label="Search friends"></label><div class="ds-list"></div><button class="ds-refresh" type="button">Refresh conversations</button></aside>' +
      '<section class="ds-chat" aria-label="Conversation"><header><b class="ds-recipient">Your conversations</b><button type="button" class="ds-reload" hidden>Refresh</button></header><p class="ds-chat-status" role="status">Choose a friend to open a conversation.</p><ol class="ds-messages" aria-label="Messages"></ol><form class="ds-compose"><textarea class="ds-draft" maxlength="2000" rows="2" aria-label="Message" placeholder="Write a message" disabled></textarea><button type="submit" class="ds-send" disabled>Send</button></form><p class="ds-send-status" role="status"></p></section></div>' +
      '<section class="ds-voice" aria-label="Astrum voice room"><div class="ds-room-idle"><b>Voice room</b><span>Join with your microphone muted.</span><button type="button" class="ds-create">Create room</button><form class="ds-join"><input aria-label="Astrum voice room code" placeholder="Paste room code" maxlength="128"><button type="submit">Join</button></form></div>' +
      '<div class="ds-room-active" hidden><b class="ds-call-status"></b><button type="button" class="ds-copy">Copy room code</button><button type="button" class="ds-mute">Unmute</button><button type="button" class="ds-deaf">Deafen</button><button type="button" class="ds-leave">Leave</button><p class="ds-participants"></p></div><p class="ds-voice-status" role="status"></p></section>';
    var state = { phase: 'disconnected', friends: [] }, drafts = Object.create(null), selected = '', sent = 0, listKey = '', messageKey = '', active = false;
    var $ = function (s) { return root.querySelector(s); };
    function node(tag, text) { var e = document.createElement(tag); e.textContent = text; return e; }
    function candidates() {
      var all = new Map();
      (state.conversations || []).concat(state.friends || []).forEach(function (f) { all.set(f.id, f); });
      return Array.from(all.values()).sort(function (a, b) { var offline = function (x) { return x.status === 1 || x.status === 5 || x.status == null; }; return Number(offline(a)) - Number(offline(b)) || a.name.localeCompare(b.name); });
    }
    function recipientName(id) { var f = candidates().find(function (f) { return f.id === id; }); return f ? f.name : 'Discord conversation'; }
    function renderList() {
      var query = $('.ds-filter').value.toLowerCase();
      var people = candidates().filter(function (f) { return f.name.toLowerCase().includes(query); });
      var key = JSON.stringify([people, selected]); if (key === listKey) return; listKey = key;
      var list = $('.ds-list'); list.textContent = '';
      people.forEach(function (f) {
        var button = node('button', ''); button.type = 'button'; button.setAttribute('aria-pressed', String(selected === f.id));
        button.appendChild(node('b', f.name)); button.appendChild(node('small', ['Online', 'Offline', 'Blocked', 'Idle', 'Do not disturb', 'Offline', 'Streaming', 'Unknown'][f.status] || 'Conversation'));
        button.addEventListener('click', function () { select(f.id); }); list.appendChild(button);
      });
      if (!people.length) list.appendChild(node('p', state.phase === 'ready' ? 'No matching friends or conversations.' : 'Connect to see your friends.'));
    }
    function select(id) {
      if (selected) drafts[selected] = $('.ds-draft').value;
      selected = id; $('.ds-draft').value = drafts[id] || ''; messageKey = '';
      $('.ds-recipient').textContent = recipientName(id); renderList(); api.history(id).then(update);
    }
    function update(next) {
      if (!next) return; var wasReady = state.phase === 'ready'; state = next;
      var ready = state.phase === 'ready', busy = ['authorizing', 'exchanging', 'connecting'].includes(state.phase);
      $('.ds-connect').textContent = ready ? 'Disconnect' : busy ? 'Cancel sign-in' : 'Connect account';
      $('.ds-status').textContent = state.error || (ready ? state.friends.length + ' friends · Connected for this session' : busy ? 'Finish the Discord permission prompt.' : 'Connect for friends, messages and Astrum voice rooms.');
      if (!ready) { selected = ''; drafts = Object.create(null); $('.ds-draft').value = ''; messageKey = ''; $('.ds-messages').textContent = ''; sent = 0; }
      if ((state.sent || 0) !== sent) {
        sent = state.sent || 0;
        if (state.sentRecipient) { drafts[state.sentRecipient] = ''; if (selected === state.sentRecipient) $('.ds-draft').value = ''; }
      }
      renderList();
      var chat = state.conversation, current = ready && chat && chat.recipient === selected;
      $('.ds-draft').disabled = !current || !!state.sending;
      $('.ds-send').disabled = !current || !!state.sending;
      $('.ds-reload').hidden = !current;
      $('.ds-reload').disabled = !!(chat && chat.loading);
      $('.ds-chat-status').textContent = current ? chat.loading ? 'Loading conversation…' : chat.error || (!(chat.messages || []).length ? 'No messages available to Astrum yet.' : '') : 'Choose a friend to open a conversation.';
      $('.ds-recipient').textContent = selected ? recipientName(selected) : 'Your conversations';
      $('.ds-send-status').textContent = state.sendError || state.actionError || (state.sending ? 'Sending…' : '');
      var messages = current ? chat.messages || [] : [], key = JSON.stringify([selected, messages]);
      if (key !== messageKey) {
        messageKey = key; var list = $('.ds-messages'), nearBottom = list.scrollHeight - list.clientHeight - list.scrollTop < 60;
        list.textContent = '';
        messages.forEach(function (m) {
          var li = node('li', ''), header = node('header', ''), time = new Date(m.time);
          header.appendChild(node('b', m.author)); if (m.time && !isNaN(time.getTime())) header.appendChild(node('time', time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));
          li.appendChild(header); li.appendChild(node('p', m.content || 'Non-text content'));
          if (m.canOpen) { var open = node('button', 'Open in Discord'); open.type = 'button'; open.addEventListener('click', function () { api.openMessage(m.id); }); li.appendChild(open); }
          list.appendChild(li);
        });
        if (nearBottom || !messages.length) list.scrollTop = list.scrollHeight;
      }
      var voice = state.voice || {}, inRoom = !!(voice.active || voice.joining);
      $('.ds-room-idle').hidden = inRoom; $('.ds-room-active').hidden = !inRoom;
      $('.ds-create').disabled = !ready; $('.ds-join button').disabled = !ready;
      $('.ds-call-status').textContent = voice.status || 'Joining';
      $('.ds-mute').textContent = voice.muted ? 'Unmute' : 'Mute'; $('.ds-mute').disabled = !voice.active;
      $('.ds-deaf').textContent = voice.deaf ? 'Undeafen' : 'Deafen'; $('.ds-deaf').disabled = !voice.active;
      $('.ds-leave').disabled = !voice.active;
      $('.ds-participants').textContent = (voice.participants || []).map(function (p) { return p.name; }).join(' · ');
      $('.ds-voice-status').textContent = voice.error || '';
      if (ready && !wasReady && active) api.conversations().then(update);
    }
    $('.ds-filter').addEventListener('input', renderList);
    $('.ds-connect').addEventListener('click', function () { (state.phase === 'disconnected' || state.phase === 'error' ? api.connect() : api.disconnect()).then(update); });
    $('.ds-refresh').addEventListener('click', function () { api.conversations().then(update); });
    $('.ds-reload').addEventListener('click', function () { if (selected) api.history(selected).then(update); });
    $('.ds-draft').addEventListener('input', function () { if (selected) drafts[selected] = this.value; });
    $('.ds-compose').addEventListener('submit', function (e) {
      e.preventDefault(); if (!selected || state.sending) return;
      // Sending only happens through this explicit form submission.
      api.send(selected, $('.ds-draft').value).then(function (r) { if (!r.ok) $('.ds-send-status').textContent = r.error || 'Message could not be sent.'; });
    });
    $('.ds-create').addEventListener('click', function () { api.voice('create').then(update); });
    $('.ds-join').addEventListener('submit', function (e) { e.preventDefault(); api.voice('join', $('.ds-join input').value.trim()).then(update); });
    $('.ds-mute').addEventListener('click', function () { api.voice('mute', !state.voice.muted).then(update); });
    $('.ds-deaf').addEventListener('click', function () { api.voice('deaf', !state.voice.deaf).then(update); });
    $('.ds-leave').addEventListener('click', function () { api.voice('leave').then(update); });
    $('.ds-copy').addEventListener('click', function () { navigator.clipboard.writeText(state.voice.code || '').then(function () { $('.ds-voice-status').textContent = 'Room code copied. Share it with someone using Astrum.'; }, function () { $('.ds-voice-status').textContent = 'Could not copy the room code.'; }); });
    api.onState(update); api.state().then(update);
    return { update: update, show: function () { if (!active) { active = true; if (state.phase === 'ready') api.conversations().then(update); } }, hide: function () { active = false; } };
  }
  return { mount: mount };
})();
