import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT) || 5173;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.wav': 'audio/wav',
  '.ico': 'image/x-icon',
};

/**
 * 支持 Range 的静态服务器。
 * 音视频必须带 Content-Length 和 Accept-Ranges：否则浏览器按 chunked 流处理，
 * MP3 拿不到真实时长（duration 会变成 Infinity），循环和跳转都不可靠。
 */
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.resolve(root, `.${pathname}`);
  if (!file.toLowerCase().startsWith(root.toLowerCase())) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(file, (statError, stat) => {
    if (statError || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const type = types[path.extname(file)] ?? 'application/octet-stream';
    const total = stat.size;
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' };

    const range = parseRange(req.headers.range, total);
    if (range === 'invalid') {
      res.writeHead(416, { 'Content-Range': `bytes */${total}`, 'Accept-Ranges': 'bytes' });
      res.end();
      return;
    }

    if (range) {
      res.writeHead(206, {
        ...headers,
        'Content-Length': range.end - range.start + 1,
        'Content-Range': `bytes ${range.start}-${range.end}/${total}`,
      });
      if (req.method === 'HEAD') { res.end(); return; }
      pipeFile(file, res, range);
      return;
    }

    res.writeHead(200, { ...headers, 'Content-Length': total });
    if (req.method === 'HEAD') { res.end(); return; }
    pipeFile(file, res, null);
  });
});

function pipeFile(file, res, range) {
  const stream = range
    ? fs.createReadStream(file, { start: range.start, end: range.end })
    : fs.createReadStream(file);
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
  stream.pipe(res);
}

/** 返回 { start, end }、null（无 Range）或 'invalid'（请求的区间不合法）。 */
function parseRange(header, total) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!match) return 'invalid';
  const hasStart = match[1] !== '';
  const hasEnd = match[2] !== '';
  if (!hasStart && !hasEnd) return 'invalid';

  let start;
  let end;
  if (!hasStart) {
    // bytes=-N：最后 N 个字节
    const suffix = Number(match[2]);
    if (!suffix) return 'invalid';
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number(match[1]);
    end = hasEnd ? Math.min(Number(match[2]), total - 1) : total - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) return 'invalid';
  return { start, end };
}

const url = `http://127.0.0.1:${port}`;
const shouldOpen = process.argv.includes('--open');

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.log(`端口 ${port} 已经有服务在跑，直接打开 ${url}`);
    if (shouldOpen) openBrowser(url);
    process.exit(0);
  }
  throw error;
});

server.listen(port, '127.0.0.1', () => {
  console.log(`错层 Wrong Floor  ${url}`);
  console.log('关掉这个窗口就会停止游戏服务器。');
  if (shouldOpen) openBrowser(url);
});

function openBrowser(target) {
  const [cmd, args] = process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '', target]]
    : process.platform === 'darwin'
      ? ['open', [target]]
      : ['xdg-open', [target]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
}
