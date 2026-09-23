// Static server for the mascot prototype. `node chanlytics-mascot-prototype/serve.mjs` (port 3230 by default)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || 3230);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  // dev only: the page posts a canvas as a data URL, a PNG lands in shots/
  if (req.method === 'POST' && url.pathname === '/shot') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 8e6) req.destroy(); });
    req.on('end', () => {
      try {
        const { name, data } = JSON.parse(body);
        const m = /^data:image\/png;base64,(.+)$/.exec(data || '');
        const safe = String(name || 'shot').replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'shot';
        if (!m) throw new Error('bad data url');
        fs.mkdirSync(path.join(ROOT, 'shots'), { recursive: true });
        const file = path.join(ROOT, 'shots', safe + '.png');
        fs.writeFileSync(file, Buffer.from(m[1], 'base64'));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, file }));
      } catch (e) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`orb demo → http://127.0.0.1:${PORT}`));
