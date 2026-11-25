import http from 'node:http'; import { readFileSync, existsSync } from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright-core';
const S = process.argv[2]; const shots = JSON.parse(process.argv[3]);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' };
const srv = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); const f = u.startsWith('/three/') ? path.join('node_modules', u) : path.join(S, u); if (!existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' }); res.end(readFileSync(f)); }).listen(4190);
const b = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const page = await b.newPage({ viewport: { width: 520, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
for (const s of shots) {
  await page.goto(`http://localhost:4190/lineup.html?m=/dl/${s.m}/model.glb${s.q ?? ''}`);
  await page.waitForFunction(() => window.done, null, { timeout: 60000 }).catch(() => {});
  console.log(s.out, await page.evaluate(() => JSON.stringify(window.done) + ' ' + (window.clipInfo ?? '')));
  await page.screenshot({ path: path.join(S, 'shots', s.out + '.png') });
}
await b.close(); srv.close();
