#!/usr/bin/env node
/**
 * Local preview: builds the site, serves dist/ on http://localhost:4000 and rebuilds when src/ changes.
 * Usage: npm run dev   (then open http://localhost:4000)
 */
import http from 'node:http';
import { promises as fs, watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 4000);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4',
};

await build();

let timer;
watch(path.join(ROOT, 'src'), { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(() => build().catch((e) => console.error('✖', e.message)), 120);
});

http.createServer(async (req, res) => {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  let file = path.join(DIST, urlPath);
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  try {
    let stat = await fs.stat(file).catch(() => null);
    if (!stat && !path.extname(file)) { file += '.html'; stat = await fs.stat(file).catch(() => null); } // pretty URLs like GitHub Pages
    if (!stat) { file = path.join(DIST, '404.html'); res.statusCode = 404; }
    const data = await fs.readFile(file);
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.writeHead(500); res.end('server error');
  }
}).listen(PORT, () => console.log(`▶ preview on http://localhost:${PORT}  (watching src/ — Ctrl+C to stop)`));
