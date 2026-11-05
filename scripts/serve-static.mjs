// Serves the built site (out/) the way a static host like Netlify does, for the
// test that checks the deployed files work. Not used in production.
// Usage: node scripts/serve-static.mjs <folder> <port>
import { createServer } from 'node:http';
import { URL } from 'node:url';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'out');
const port = Number(process.argv[3] ?? 3200);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = normalize(decodeURIComponent(url.pathname));
  if (path.includes('..')) {
    res.writeHead(400).end('Bad path');
    return;
  }
  // Like Netlify: a folder without its trailing slash redirects to it.
  const dirIndex = join(root, path, 'index.html');
  if (!path.endsWith('/') && (await isFile(dirIndex))) {
    res.writeHead(301, { Location: `${path}/${url.search}` }).end();
    return;
  }
  for (const candidate of [join(root, path), dirIndex, join(root, `${path}.html`)]) {
    if (await isFile(candidate)) {
      res.writeHead(200, { 'Content-Type': TYPES[extname(candidate)] ?? 'application/octet-stream' });
      res.end(await readFile(candidate));
      return;
    }
  }
  const notFound = join(root, '404.html');
  res.writeHead(404, { 'Content-Type': TYPES['.html'] });
  res.end((await isFile(notFound)) ? await readFile(notFound) : 'Not found');
}).listen(port, () => console.log(`Serving ${root} on http://localhost:${port}`));
