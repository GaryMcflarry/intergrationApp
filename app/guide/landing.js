/* The landing page can also be hosted as static files. Account setup always stays on loopback. */
(function () {
  'use strict';
  var $ = IA.$;
  var local = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
  if (local) {
    $('sp-link').href = 'spotify.html';
    $('yt-link').href = 'http://localhost:' + location.port + '/guide/youtube.html';
    $('dc-link').href = 'discord.html';
  }
  [['i-sp', 'sp'], ['i-yt', 'yt'], ['i-dc', 'dc'], ['preview-yt', 'yt'], ['preview-dc', 'dc']].forEach(function (icon) {
    $(icon[0]).innerHTML = IA.ICON[icon[1]];
  });

  var download = $('download'), downloadNote = $('download-note');
  fetch(download.href, { method: 'HEAD' }).then(function (response) {
    if (!response.ok || !/^application\/(?:octet-stream|vnd\.microsoft\.portable-executable)\b/i.test(response.headers.get('Content-Type') || '')) throw new Error();
    var bytes = Number(response.headers.get('Content-Length'));
    download.hidden = false;
    downloadNote.textContent = 'Windows installer' + (bytes > 0 ? ' · ' + Math.round(bytes / 1048576) + ' MB' : '');
  }).catch(function () {
    downloadNote.textContent = local ? 'This copy of Astrum does not include the installer.' : 'The Windows download is temporarily unavailable.';
    $('download-fallback').hidden = false;
  });

  if (!local) return;
  function status(id, connected, message) {
    var el = $(id);
    el.classList.toggle('connected', connected);
    el.textContent = message;
  }
  IA.status().then(function (state) {
    status('s-sp', state.spotify.connected, state.spotify.connected ? 'Connected' : state.spotify.client ? 'Ready to sign in' : 'Setup needed');
    var library = state.youtube.library;
    status('s-yt', !!library, library ? 'Connected' : 'Setup needed');
    var discord = state.discord;
    var discordReady = !!(discord.appId || discord.bot || discord.webhook);
    status('s-dc', discordReady, discordReady ? 'Set up' : 'Setup needed');
    var login = $('login');
    login.checked = !!state.app.openAtLogin;
    $('preferences').hidden = false;
    login.addEventListener('change', function () {
      var requested = login.checked;
      login.disabled = true;
      IA.api('/api/app', { openAtLogin: requested }).then(function () { IA.say($('msg'), 'Saved.', true); }, function (error) {
        login.checked = !requested; IA.say($('msg'), error.message);
      }).finally(function () { login.disabled = false; });
    });
  }, function () {
    ['s-sp', 's-yt', 's-dc'].forEach(function (id) { status(id, false, 'Open Astrum to connect'); });
  });
})();
