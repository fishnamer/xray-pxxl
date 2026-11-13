const https = require('https');
const fs = require('fs');
const { spawnSync } = require('child_process');

const url = 'https://github.com/XTLS/Xray-core/releases/download/v25.10.15/Xray-linux-64.zip';

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'node/setup' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return download(res.headers.location, dest).then(resolve, reject);
      if (res.statusCode !== 200) return reject(new Error('download failed: ' + res.statusCode));
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

(async () => {
  await download(url, 'xray.zip');
  let r = spawnSync('sh', ['-c', 'unzip -o -q xray.zip && mv -f xray web-worker && chmod +x web-worker && rm -f xray.zip LICENSE README.md'], { stdio: 'inherit' });
  if (r.status !== 0 || !fs.existsSync('web-worker')) throw new Error('setup failed: xray binary missing, exit=' + r.status);
  if (!fs.existsSync('geoip.dat') || !fs.existsSync('geosite.dat')) console.error('setup warning: geo files missing');
  console.log('setup ok');
})().catch((e) => { console.error(e); process.exit(1); });
