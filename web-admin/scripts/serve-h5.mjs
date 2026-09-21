// 本地预览 web-admin H5 构建产物（/guanli/ hash 路由），并代理 /admin-api → localhost:3000
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'build', 'h5');
const PORT = Number(process.env.PORT || 5280);
const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = Number(process.env.API_PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/admin-api')) {
    const proxy = http.request(
      { host: API_HOST, port: API_PORT, method: req.method, path: req.url, headers: { ...req.headers, host: `${API_HOST}:${API_PORT}` } },
      (pres) => {
        res.writeHead(pres.statusCode, pres.headers);
        pres.pipe(res);
      },
    );
    proxy.on('error', (e) => { res.writeHead(502); res.end('proxy error: ' + e.message); });
    req.pipe(proxy);
    return;
  }
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  // /guanli 仅是 hash 路由 base 前缀，映射到构建产物根
  if (p.startsWith('/guanli')) p = p.slice('/guanli'.length) || '/';
  if (p === '/' ) p = '/index.html';
  const fp = path.normalize(path.join(ROOT, p));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.stat(fp, (err, st) => {
    let target = fp;
    if (!err && st.isDirectory()) target = path.join(fp, 'index.html');
    fs.readFile(target, (err2, data) => {
      if (err2) { res.writeHead(404); res.end('not found: ' + p); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream' });
      res.end(data);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`web-admin preview: http://localhost:${PORT}/guanli/ (root ${ROOT})`);
});
