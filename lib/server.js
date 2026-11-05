'use strict';
/* The app's pages are served from this computer only (127.0.0.1 and ::1), on a fixed port.
   Spotify's sign-in only returns to an address registered with it, and for an app on your computer that must be
   http://127.0.0.1:<port>; Google's sign-in wants http://localhost:<port>. Both reach this server. /api/ and /spotify/
   go to the app (lib/api.js); everything else is a file from app/. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 43210;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp'
};

function downloadInstaller(req, res, installer) {
  if (!installer) { res.writeHead(404).end(); return; }
  fs.stat(installer, (err, stat) => {
    if (res.destroyed) return;
    if (err || !stat.isFile() || !stat.size) { res.writeHead(404).end(); return; }
    const headers = {
      'Content-Type': 'application/octet-stream', 'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${path.basename(installer)}"`,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin'
    };
    if (req.method === 'HEAD') { res.writeHead(200, headers).end(); return; }
    const stream = fs.createReadStream(installer);
    stream.once('open', () => { res.writeHead(200, headers); stream.pipe(res); });
    stream.once('error', () => { if (res.headersSent) res.destroy(); else res.writeHead(404).end(); });
    res.once('close', () => stream.destroy());
  });
}

function handler(root, port, api, installer) {
  const base = path.resolve(root);
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
  return (req, res) => {
    // only this app's own addresses (a web page elsewhere cannot use this server through a made-up host name)
    if (!hosts.has(String(req.headers.host || '').toLowerCase())) { res.writeHead(421); res.end(); return; }
    let url, pathname;
    try { url = new URL(req.url, 'http://x'); pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400); res.end(); return; }
    if (api && (pathname.startsWith('/api/') || pathname.startsWith('/spotify/'))) {   // the app's own answers (sign-ins, the guide pages)
      Promise.resolve(api(req, res, url)).then((done) => { if (!done && !res.headersSent) { res.writeHead(404); res.end(); } }, () => { if (!res.headersSent) { res.writeHead(500); res.end(); } });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    if (pathname === '/download/windows') { downloadInstaller(req, res, installer); return; }
    if (pathname === '/' || pathname === '') pathname = '/island.html';
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.resolve(base, '.' + pathname);
    if (file !== base && !file.startsWith(base + path.sep)) { res.writeHead(404); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin'
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  };
}

// listens on 127.0.0.1 (required) and ::1 (when the computer has it); resolves to a close() for both
function start(root, port = PORT, api = null, installer = null) {
  const h = handler(root, port, api, installer);
  const v4 = http.createServer(h), v6 = http.createServer(h);
  return new Promise((resolve, reject) => {
    v4.once('error', reject);
    v4.listen(port, '127.0.0.1', () => {
      v6.once('error', () => { /* no IPv6 loopback: localhost still reaches 127.0.0.1 */ });
      v6.listen(port, '::1');
      resolve({ port, close: () => { v4.close(); try { v6.close(); } catch { /* not listening */ } } });
    });
  });
}

module.exports = { PORT, handler, start };
