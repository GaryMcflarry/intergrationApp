/* In the app, the widget (127.0.0.1) and the YouTube sign-in page (localhost) are different addresses, so each has its
   own browser storage. These few values are kept by the app instead and copied into each page, so a sign-in in one
   window reaches the others (like Worlds' database did for Lively). Nothing happens outside the app. */
(function () {
  'use strict';
  var D = window.desktop; if (!D || !D.kv) return;
  var KEYS = ['yt-library-v1', 'yt-client', 'yt-token'], set0 = Storage.prototype.setItem, rem0 = Storage.prototype.removeItem;
  KEYS.forEach(function (k) {
    try {
      var v = D.kv.get(k);
      if (v != null) set0.call(localStorage, k, v);
      else { var mine = localStorage.getItem(k); if (mine != null) D.kv.set(k, mine); }   // this page had it first: share it
    } catch (e) { }
  });
  Storage.prototype.setItem = function (k, v) { set0.call(this, k, v); if (this === localStorage && KEYS.indexOf(k) >= 0) D.kv.set(k, String(v)); };
  Storage.prototype.removeItem = function (k) { rem0.call(this, k); if (this === localStorage && KEYS.indexOf(k) >= 0) D.kv.set(k, null); };
  D.kv.onChange(function (d) {   // changed in another window: take it, and tell the page as the browser would
    try { if (d.value == null) rem0.call(localStorage, d.key); else set0.call(localStorage, d.key, d.value); } catch (e) { }
    try { window.dispatchEvent(new StorageEvent('storage', { key: d.key, newValue: d.value })); } catch (e) { }
  });
})();
