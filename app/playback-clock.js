(function (root) {
  'use strict';
  function position(state, at, now) {
    if (!state || !state.item) return 0;
    var duration = Number(state.item.duration_ms) || 0;
    var progress = Math.max(0, (Number(state.progress_ms) || 0) + (state.is_playing ? Math.max(0, now - at) : 0));
    if (!duration) return progress;
    return state.is_playing && state.repeat_state === 'track' ? progress % duration : Math.min(progress, duration);
  }
  function reconcile(previous, at, next, now, stale, lagged) {
    var progress = next && Number(next.progress_ms) || 0;
    if (!previous || !previous.item || !next || !next.item || !previous.is_playing || !next.is_playing ||
        (previous.item.id || previous.item.uri) !== (next.item.id || next.item.uri) ||
        (previous.device && next.device && previous.device.id !== next.device.id)) return { progress: progress, lagged: false };
    var predicted = (Number(previous.progress_ms) || 0) + Math.max(0, now - at);
    var duration = Number(next.item.duration_ms) || 0;
    var edge = Math.min(3000, duration * .2);
    var restarted = duration > 0 && predicted >= duration - edge && progress < edge &&
      (!stale || next.timestamp > previous.timestamp || next.repeat_state === 'track');
    if (restarted) return { progress: progress, lagged: false };
    var back = predicted - progress;
    if (stale || (back > 0 && back < 12000 && !(back > 1500 && lagged))) {
      return { progress: position(previous, at, now), lagged: !stale && back > 1500 };
    }
    return { progress: progress, lagged: false };
  }
  var clock = { position: position, reconcile: reconcile };
  if (typeof module === 'object' && module.exports) module.exports = clock;
  else root.PlaybackClock = clock;
})(typeof window === 'object' ? window : globalThis);
