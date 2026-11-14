const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const UUID = process.env.UUID;
if (!UUID) { console.error('Missing UUID env'); process.exit(1); }
const WSPATH = (process.env.WSPATH || '/api/v1/sync');
if (!WSPATH.startsWith('/')) { console.error('WSPATH must start with /'); process.exit(1); }
const PORT = parseInt(process.env.PORT || '8080', 10);
const BIN = './web-worker';
const README = 'services are healthy';
const CFG = {
  log: { loglevel: 'warning' },
  inbounds: [
    {
      port: 10086,
      listen: '127.0.0.1',
      protocol: 'vless',
      settings: { clients: [{ id: UUID }], decryption: 'none' },
      streamSettings: { network: 'ws', wsSettings: { path: WSPATH } }
    }
  ],
  outbounds: [{ protocol: 'freedom', tag: 'direct' }]
};

// Pxxl runtime filesystem is read-only except the temp dir:
// write the generated xray config to os.tmpdir() instead of the app dir.
const CFG_PATH = path.join(os.tmpdir(), 'config.json');
fs.writeFileSync(CFG_PATH, JSON.stringify(CFG));
const x = spawn(BIN, ['run', '-c', CFG_PATH], { stdio: 'inherit' });
x.on('error', (e) => { console.error('xray spawn failed:', e.message); process.exit(1); });

http.createServer((req, res) => {
  if (req.url === '/') return res.end(README);
  if (req.url !== WSPATH) return res.writeHead(404).end('not found');
  // Xray serves VLESS over WS at http://127.0.0.1:10086${WSPATH}; proxy Upgrade requests to it.
  const u = 'http://127.0.0.1:10086' + WSPATH;
  const proxy = http.request(u, {
    method: req.method,
    headers: { ...req.headers, host: '127.0.0.1:10086', connection: 'Upgrade', upgrade: 'websocket' }
  });
  proxy.on('upgrade', (pres, socket) => {
    res.writeHead(101, pres.headers);
    socket.pipe(res.socket); res.socket.pipe(socket);
  });
  proxy.on('response', (pres) => {
    res.writeHead(pres.statusCode, pres.headers);
    pres.pipe(res);
  });
  proxy.on('error', (e) => res.writeHead(502).end('bad gateway: ' + e.message));
  req.pipe(proxy);
}).listen(PORT, '0.0.0.0', () => {
  console.log('listening on http://0.0.0.0:' + PORT + ' WSPATH=' + WSPATH);
});
x.on('exit', (c) => { console.error('xray exited', c); process.exit(c ?? 1); });
