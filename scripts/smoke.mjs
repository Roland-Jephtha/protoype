/**
 * Browser smoke test for the production build.
 *
 *   npm run build && npm run smoke
 *
 * Starts `vite preview`, drives the game in a locally installed Chrome/Edge
 * (playwright-core, no browser download), and checks: title renders, the 3D
 * world loads, keyboard movement/jump/sprint work, the pause menu works,
 * return-to-title and re-entry work, and on an emulated touch device the
 * stick + look pad work simultaneously and release cleanly on touchend and
 * touchcancel. Screenshots go to SMOKE_OUT (default: ./smoke-output).
 *
 * This is emulation in desktop Chrome — NOT a substitute for physical
 * mobile-device testing.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const PORT = 4179;
// SMOKE_URL lets you target an already-running server (e.g. the dev server).
const BASE = process.env.SMOKE_URL ?? `http://localhost:${PORT}/?test`;
const OUT = process.env.SMOKE_OUT ?? path.resolve('smoke-output');
mkdirSync(OUT, { recursive: true });

const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
if (!executablePath) {
  console.error('No Chrome/Edge found. Set CHROME_PATH.');
  process.exit(2);
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startServer() {
  const proc = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/`);
      if (res.ok) return proc;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  proc.kill();
  throw new Error('vite preview did not start');
}

const state = (page) =>
  page.evaluate(() => {
    const k = window.__krypton;
    if (!k) return null;
    const r = k.runtime;
    return {
      ready: k.ready,
      pos: { x: r.playerPosition.x, y: r.playerPosition.y, z: r.playerPosition.z },
      vel: { x: r.playerVelocity.x, y: r.playerVelocity.y, z: r.playerVelocity.z },
      state: r.playerState,
      grounded: r.grounded,
      yaw: r.cameraYaw,
      pitch: r.cameraPitch,
      fps: r.fps,
      draws: r.drawCalls,
      move: k.input.getMove(),
      held: k.input.debugSnapshot().held,
      hero: r.heroModel,
    };
  });

async function waitForReady(page, timeout = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await state(page);
    if (s?.ready && s.grounded) return s;
    await sleep(250);
  }
  return state(page);
}

const hspeed = (s) => Math.hypot(s.vel.x, s.vel.z);

async function desktopRun(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

  await page.goto(BASE);
  check('title screen renders', await page.getByText('Shadow over').isVisible());
  await page.screenshot({ path: path.join(OUT, '01-title.png') });

  await page.getByRole('button', { name: 'Free roam' }).click();
  const s0 = await waitForReady(page);
  check('world loads and player is grounded', !!s0?.ready && !!s0?.grounded, s0 ? `pos y=${s0.pos.y.toFixed(2)}` : 'no state');
  // The rigged GLB hero streams in after the world; give it a moment.
  let hero = s0?.hero;
  for (let i = 0; i < 40 && hero !== 'ual' && hero !== 'hatch'; i++) {
    await sleep(250);
    hero = (await state(page)).hero;
  }
  check('rigged hero model loaded (not the placeholder)', hero === 'ual' || hero === 'hatch', `hero=${hero}`);
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, '02-game.png') });

  // Move forward (W) — camera yaw 0 → forward is -Z.
  const before = await state(page);
  await page.keyboard.down('KeyW');
  await sleep(1500);
  const running = await state(page);
  await page.keyboard.up('KeyW');
  check('W moves the player forward (-Z)', running.pos.z < before.pos.z - 4, `dz=${(running.pos.z - before.pos.z).toFixed(2)}`);
  check('reaches run speed', hspeed(running) > 5, `${hspeed(running).toFixed(2)} m/s, state=${running.state}`);
  await page.screenshot({ path: path.join(OUT, '03-running.png') });

  await sleep(600);
  const stopped = await state(page);
  check('decelerates to a stop after release', hspeed(stopped) < 0.5, `${hspeed(stopped).toFixed(2)} m/s`);

  // Jump.
  const yGround = stopped.pos.y;
  await page.keyboard.down('Space');
  let peak = yGround;
  for (let i = 0; i < 12; i++) {
    await sleep(50);
    peak = Math.max(peak, (await state(page)).pos.y);
  }
  await page.keyboard.up('Space');
  await sleep(1200);
  const landed = await state(page);
  check('Space jumps', peak > yGround + 1, `peak +${(peak - yGround).toFixed(2)} m`);
  check('lands back on the ground', landed.grounded && Math.abs(landed.pos.y - yGround) < 0.3);

  // Pause.
  await page.keyboard.press('Escape');
  await sleep(200);
  const pausedVisible = await page.getByRole('dialog', { name: 'Paused' }).isVisible();
  check('Escape opens the pause menu', pausedVisible);
  const p1 = await state(page);
  await sleep(500);
  const p2 = await state(page);
  check('simulation is frozen while paused', Math.abs(p1.pos.x - p2.pos.x) + Math.abs(p1.pos.y - p2.pos.y) < 1e-6);
  await page.screenshot({ path: path.join(OUT, '04-paused.png') });

  await page.getByRole('button', { name: 'Settings' }).click();
  check('pause → settings opens', await page.getByText('Mouse sensitivity').isVisible());
  await page.keyboard.press('Escape');
  await sleep(150);
  check('Escape in settings returns to pause menu', await page.getByRole('button', { name: 'Resume' }).isVisible());

  await page.getByRole('button', { name: 'Restart checkpoint' }).click();
  await sleep(600);
  const respawned = await state(page);
  check('restart checkpoint respawns at spawn', Math.abs(respawned.pos.x) < 0.5 && Math.abs(respawned.pos.z - 8) < 0.5, `pos ${respawned.pos.x.toFixed(2)},${respawned.pos.z.toFixed(2)}`);

  // Sprint from spawn toward +Z (S = backwards relative to the camera): a clear street.
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyS');
  // Short burst: at 80 km/h a longer one reaches the buildings across the street.
  await sleep(1100);
  const sprint = await state(page);
  await page.keyboard.up('KeyS');
  await page.keyboard.up('ShiftLeft');
  check('Shift sprints', hspeed(sprint) > 18, `${hspeed(sprint).toFixed(2)} m/s, state=${sprint.state}`);
  await page.screenshot({ path: path.join(OUT, '04b-sprint.png') });

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Return to title' }).click();
  await page.getByRole('button', { name: 'Return to title' }).click();
  await sleep(300);
  check('return to title works', await page.getByText('Shadow over').isVisible());

  await page.getByRole('button', { name: 'Free roam' }).click();
  const again = await waitForReady(page);
  check('can re-enter the game after returning to title', !!again?.ready && !!again?.grounded);
  await sleep(1500);
  const perf = await state(page);
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  console.log(`      info: headless fps≈${perf.fps.toFixed(0)}, draw calls=${perf.draws}, renderer=${gpu} (headless — not a performance benchmark)`);

  check('no page errors (desktop)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}

async function touchRun(browser) {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  const cdp = await context.newCDPSession(page);

  await page.goto(BASE);
  await page.getByRole('button', { name: 'Free roam' }).tap();
  const s0 = await waitForReady(page);
  check('touch: world loads', !!s0?.ready);
  await sleep(500);

  const stick = await page.locator('.touch-stick').boundingBox();
  const jumpBtn = await page.getByRole('button', { name: 'Jump' }).boundingBox();
  check('touch: stick and buttons are shown', !!stick && !!jumpBtn);
  if (!stick || !jumpBtn) return;
  await page.screenshot({ path: path.join(OUT, '05-touch.png') });

  const sc = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 };
  const look = { x: 600, y: 120 };
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });

  // Finger 1 on the stick, push up-right (diagonal = proves analog 360°).
  await touch('touchStart', [{ x: sc.x, y: sc.y, id: 1 }]);
  await touch('touchMove', [{ x: sc.x + 40, y: sc.y - 40, id: 1 }]);
  await sleep(100);
  const diag = await state(page);
  check('touch: stick gives analog diagonal input', diag.move.x > 0.3 && diag.move.y > 0.3, `move ${diag.move.x.toFixed(2)},${diag.move.y.toFixed(2)}`);
  await touch('touchMove', [{ x: sc.x, y: sc.y - 80, id: 1 }]);

  // Finger 2 on the look pad while finger 1 keeps holding the stick.
  const yaw0 = (await state(page)).yaw;
  await touch('touchStart', [
    { x: sc.x, y: sc.y - 80, id: 1 },
    { x: look.x, y: look.y, id: 2 },
  ]);
  for (let i = 1; i <= 10; i++) {
    await touch('touchMove', [
      { x: sc.x, y: sc.y - 80, id: 1 },
      { x: look.x + i * 12, y: look.y, id: 2 },
    ]);
    await sleep(30);
  }
  await sleep(600);
  const both = await state(page);
  check('touch: move + look simultaneously', hspeed(both) > 5 && Math.abs(both.yaw - yaw0) > 0.3, `speed ${hspeed(both).toFixed(2)}, dyaw ${(both.yaw - yaw0).toFixed(2)}`);

  // Finger 3 taps jump while the other two stay down.
  const jc = { x: jumpBtn.x + jumpBtn.width / 2, y: jumpBtn.y + jumpBtn.height / 2 };
  const y0 = both.pos.y;
  await touch('touchStart', [
    { x: sc.x, y: sc.y - 80, id: 1 },
    { x: look.x + 120, y: look.y, id: 2 },
    { x: jc.x, y: jc.y, id: 3 },
  ]);
  await sleep(250);
  const jumping = await state(page);
  check('touch: jump button works during move + look', jumping.pos.y > y0 + 0.5, `dy ${(jumping.pos.y - y0).toFixed(2)}`);
  // CDP can only release all touches at once (touchEnd carries no points).
  await touch('touchEnd', []);
  await sleep(900);
  const released = await state(page);
  check('touch: touchend releases the jump button', !released.held.includes('jump'));
  check('touch: touchend returns stick to neutral', released.move.x === 0 && released.move.y === 0 && hspeed(released) < 0.5, `speed ${hspeed(released).toFixed(2)}`);

  // touchcancel mid-hold (e.g. incoming call / system gesture).
  const sprintBtn = await page.getByRole('button', { name: 'Sprint' }).boundingBox();
  await touch('touchStart', [
    { x: sc.x, y: sc.y - 80, id: 4 },
    { x: sprintBtn.x + sprintBtn.width / 2, y: sprintBtn.y + sprintBtn.height / 2, id: 5 },
  ]);
  await sleep(300);
  const held = await state(page);
  await touch('touchCancel', []);
  await sleep(900);
  const cancelled = await state(page);
  check('touch: sprint held before cancel', held.held.includes('sprint'));
  check('touch: touchcancel releases stick and buttons', cancelled.move.y === 0 && !cancelled.held.includes('sprint') && hspeed(cancelled) < 0.5);

  // Pause button.
  const pauseBtn = await page.getByRole('button', { name: 'Pause' }).boundingBox();
  await touch('touchStart', [{ x: pauseBtn.x + 24, y: pauseBtn.y + 24, id: 6 }]);
  await touch('touchEnd', []);
  await sleep(200);
  check('touch: pause button opens pause menu', await page.getByRole('dialog', { name: 'Paused' }).isVisible());
  await page.screenshot({ path: path.join(OUT, '06-touch-paused.png') });

  check('no page errors (touch)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}

async function portraitRun(browser) {
  // Phone held upright: the app must present the game in landscape.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const cdp = await context.newCDPSession(page);
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Free roam' }).tap();
  const s0 = await waitForReady(page);
  check('portrait: world loads', !!s0?.ready);
  await sleep(1500);
  const frame = await page.evaluate(() => {
    const f = document.querySelector('.app-frame');
    const c = document.querySelector('canvas');
    return { rotated: f?.classList.contains('rotated'), w: c?.clientWidth, h: c?.clientHeight };
  });
  check('portrait: frame rotated to landscape', !!frame.rotated && frame.w > frame.h, `canvas ${frame.w}x${frame.h}`);
  await page.screenshot({ path: path.join(OUT, '07-portrait-rotated.png') });

  // In the rotated frame "forward" on the stick is toward the screen's right edge.
  const stick = await page.locator('.touch-stick').boundingBox();
  const c = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x + 80, y: c.y, id: 1 }] });
  await sleep(150);
  const fwd = await state(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check('portrait: stick maps to game-forward in rotated frame', fwd.move.y > 0.8 && Math.abs(fwd.move.x) < 0.2, `move ${fwd.move.x.toFixed(2)},${fwd.move.y.toFixed(2)}`);
  check('no page errors (portrait)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}

const server = process.env.SMOKE_URL ? null : await startServer();
const browser = await chromium.launch({
  executablePath,
  headless: true,
  // SMOKE_GPU=swiftshader forces software rendering (CI without a GPU).
  args:
    process.env.SMOKE_GPU === 'swiftshader'
      ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
      : ['--ignore-gpu-blocklist', '--enable-gpu'],
});
try {
  await desktopRun(browser);
  await touchRun(browser);
  await portraitRun(browser);
} catch (e) {
  check('smoke run completed without exceptions', false, e.message);
} finally {
  await browser.close();
  server?.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${OUT}`);
process.exit(failed.length ? 1 : 0);
