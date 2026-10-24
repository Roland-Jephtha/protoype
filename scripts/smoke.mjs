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
      mode: r.moveMode,
      region: r.regionId,
      sole: r.heroSoleAboveGround,
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
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message} @ ${(e.stack ?? '').split(String.fromCharCode(10)).slice(1, 6).join(' <- ')}`));
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
  // Short, time-boxed burst (~0.75 s): full speed is reached inside the plaza, then the
  // hero coasts to a stop mid-street. Longer bursts at 90 km/h end in the buildings
  // across the street, which also ruins the flight test that starts from here.
  // Sample the animation weight through the run→sprint switch: it must never fade
  // toward the rest pose (the old "gliding with arms out" bug).
  let minWeight = 1;
  const burstStart = Date.now();
  while (Date.now() - burstStart < 750) {
    await sleep(60);
    minWeight = Math.min(minWeight, await page.evaluate(() => window.__krypton.runtime.heroAnimWeight));
  }
  const sprint = await state(page);
  await page.keyboard.up('KeyS');
  await page.keyboard.up('ShiftLeft');
  check('Shift sprints', hspeed(sprint) > 20, `${hspeed(sprint).toFixed(2)} m/s, state=${sprint.state}`);
  check('sprint keeps the run animation fully applied', minWeight > 0.95, `min weight ${minWeight.toFixed(2)}`);
  await page.screenshot({ path: path.join(OUT, '04b-sprint.png') });

  // --- Flight: we're now standing on the street (z ≈ 28); fly west along it (-X). ---
  await sleep(800);
  const speed3 = (s) => Math.hypot(s.vel.x, s.vel.y, s.vel.z) * 3.6;
  await page.keyboard.press('KeyF');
  await page.keyboard.down('Space');
  await sleep(1000);
  await page.keyboard.up('Space');
  const climbed = await state(page);
  check('F takes off and Space climbs', climbed.mode === 'flight' && climbed.pos.y > 5, `y=${climbed.pos.y.toFixed(1)} state=${climbed.state} x=${climbed.pos.x.toFixed(0)} z=${climbed.pos.z.toFixed(0)}`);
  // West, because the city's west edge has no exit: if timing jitter carries the hero
  // that far it just holds him back. (East is an exit to the desert — overshooting
  // there would start a travel mid-test.)
  await page.keyboard.down('KeyA');
  await sleep(1800);
  const cruise = await state(page);
  check('flight cruises at 60 km/h', Math.abs(speed3(cruise) - 60) < 3 && cruise.state === 'fly', `${speed3(cruise).toFixed(1)} km/h, state=${cruise.state}, x=${cruise.pos.x.toFixed(0)}`);
  await page.screenshot({ path: path.join(OUT, '04c-flying.png') });
  await page.keyboard.down('ShiftLeft');
  await sleep(1350);
  const boost = await state(page);
  check('boost reaches 150 km/h', speed3(boost) > 145 && boost.state === 'flyBoost', `${speed3(boost).toFixed(1)} km/h, state=${boost.state}, x=${boost.pos.x.toFixed(0)}`);
  await page.screenshot({ path: path.join(OUT, '04d-boost.png') });
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyA');
  await sleep(2400);
  const hover = await state(page);
  check('releasing controls brakes to a hover in the air', hover.state === 'hover' && speed3(hover) < 2 && hover.pos.y > 3, `${speed3(hover).toFixed(1)} km/h, y=${hover.pos.y.toFixed(1)}, state=${hover.state}, region=${hover.region}, x=${hover.pos.x.toFixed(0)} z=${hover.pos.z.toFixed(0)}`);
  await page.screenshot({ path: path.join(OUT, '04e-hover.png') });
  await page.keyboard.down('KeyC');
  await sleep(2500);
  await page.keyboard.up('KeyC');
  await sleep(500);
  const landed2 = await state(page);
  check('C descends and lands', landed2.mode === 'ground' && landed2.grounded, `state=${landed2.state} y=${landed2.pos.y.toFixed(2)}`);

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
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message} @ ${(e.stack ?? '').split(String.fromCharCode(10)).slice(1, 6).join(' <- ')}`));
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
  check('touch: move + look simultaneously', hspeed(both) > 3 && Math.abs(both.yaw - yaw0) > 0.3, `speed ${hspeed(both).toFixed(2)}, dyaw ${(both.yaw - yaw0).toFixed(2)}`);

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

  // Fly button: takes off and swaps the buttons to their flight versions.
  const flyBtn = await page.getByRole('button', { name: 'Fly' }).boundingBox();
  await touch('touchStart', [{ x: flyBtn.x + flyBtn.width / 2, y: flyBtn.y + flyBtn.height / 2, id: 7 }]);
  await touch('touchEnd', []);
  await sleep(600);
  const flyingTouch = await state(page);
  const upVisible = await page.getByRole('button', { name: 'Up' }).isVisible();
  const downVisible = await page.getByRole('button', { name: 'Down' }).isVisible();
  check('touch: Fly button takes off and shows Up/Down/Boost', flyingTouch.mode === 'flight' && upVisible && downVisible, `mode=${flyingTouch.mode}`);
  await page.screenshot({ path: path.join(OUT, '05b-touch-flying.png') });

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

/** Outdoor regions: travel, ground contact on terrain, flight + landing, and crossing an edge. */
async function regionRun(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Free roam' }).click();
  await waitForReady(page);

  const waitForRegion = async (id, timeout = 60000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const s = await state(page);
      if (s?.region === id && s.ready && (s.grounded || s.mode === 'flight')) return s;
      await sleep(250);
    }
    return state(page);
  };
  const travel = async (name) => {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Travel' }).click();
    await page.getByRole('button', { name: new RegExp(name) }).click();
  };
  /** Holds keys for `ms`, sampling the lowest sole height while grounded. */
  const moveAndSample = async (keys, ms) => {
    for (const k of keys) await page.keyboard.down(k);
    let minSole = Infinity;
    let maxSpeed = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      await sleep(100);
      const s = await state(page);
      if (s.grounded) minSole = Math.min(minSole, s.sole);
      maxSpeed = Math.max(maxSpeed, hspeed(s));
    }
    for (const k of keys) await page.keyboard.up(k);
    return { minSole, maxSpeed };
  };

  for (const [id, name, shot] of [
    ['desert', 'Red Mesa Desert', '08-desert'],
    ['forest', 'Blackwood Forest', '09-forest'],
  ]) {
    const t0 = Date.now();
    await travel(name);
    const arrived = await waitForRegion(id);
    check(`${id}: travel from the pause menu loads the region`, arrived.region === id && arrived.grounded, `${((Date.now() - t0) / 1000).toFixed(1)} s, y=${arrived.pos.y.toFixed(1)}`);
    await sleep(800);
    await page.screenshot({ path: path.join(OUT, `${shot}.png`) });

    const run = await moveAndSample(['KeyW'], 2000);
    const sprint = await moveAndSample(['ShiftLeft', 'KeyW'], 2000);
    check(`${id}: running and sprinting keep the feet on top of the terrain`, Math.min(run.minSole, sprint.minSole) > -0.01, `min sole ${(Math.min(run.minSole, sprint.minSole) * 100).toFixed(1)} cm, top speed ${(sprint.maxSpeed * 3.6).toFixed(0)} km/h`);

    await page.keyboard.press('KeyF');
    await page.keyboard.down('Space');
    await sleep(1500);
    await page.keyboard.up('Space');
    await page.screenshot({ path: path.join(OUT, `${shot}-aerial.png`) });
    await page.keyboard.down('KeyC');
    await sleep(3500);
    await page.keyboard.up('KeyC');
    await sleep(600);
    const landed = await state(page);
    check(`${id}: descending from flight lands on the terrain`, landed.mode === 'ground' && landed.grounded && landed.sole > -0.01, `state=${landed.state} sole=${(landed.sole * 100).toFixed(1)} cm`);
    const perf = await state(page);
    console.log(`      info: ${id} headless fps≈${perf.fps.toFixed(0)}, draw calls=${perf.draws}`);
  }

  // Edge crossing: from the forest's south arrival point, fly south (+Z) over the trees.
  await page.keyboard.press('KeyF');
  await page.keyboard.down('Space');
  await sleep(1500);
  await page.keyboard.up('Space');
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyS');
  const city = await waitForRegion('metropolis', 30000);
  await page.keyboard.up('KeyS');
  await page.keyboard.up('ShiftLeft');
  check('flying off the forest edge arrives in Metropolis, still flying', city.region === 'metropolis' && city.mode === 'flight', `region=${city.region} mode=${city.mode} pos=${city.pos.x.toFixed(0)},${city.pos.z.toFixed(0)}`);

  check('no page errors (regions)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}

/** Story mode: plays the whole prologue (briefing → forest → crash site → survivors → wreck → complete). */
async function storyRun(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Story mode' }).click();
  await waitForReady(page);
  const briefing = page.getByRole('dialog', { name: 'Mission briefing' });
  check('story: briefing shows before the mission', await briefing.isVisible());
  await page.screenshot({ path: path.join(OUT, '10-briefing.png') });
  await page.getByRole('button', { name: 'Begin' }).click();
  await sleep(300);
  const objective = () => page.locator('.hud-objective-text').textContent();
  check('story: first objective is to fly north', (await objective())?.includes('Fly north') ?? false, await objective());

  const mission = () => page.evaluate(() => window.__krypton.app.getState().mission);
  // Objective 1 is satisfied by arriving in the forest (Travel is quicker than navigating the city in a test).
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Travel' }).click();
  await page.getByRole('button', { name: /Blackwood Forest/ }).click();
  for (let i = 0; i < 80 && !(await state(page))?.ready; i++) await sleep(250);
  await sleep(800);
  check('story: reaching the forest completes objective 1', (await mission()).objectiveIndex === 1, await objective());

  /** Turns the camera so "forward" points at (x, z). */
  const face = (x, z) =>
    page.evaluate(([x, z]) => {
      const r = window.__krypton.runtime;
      const p = r.playerPosition;
      const desired = Math.atan2(-(x - p.x), -(z - p.z));
      let d = r.cameraYaw - desired;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      window.__krypton.input.addLook(d, 0);
    }, [x, z]);
  const distTo = async (x, z) => {
    const s = await state(page);
    return Math.hypot(x - s.pos.x, z - s.pos.z);
  };
  /** Runs on the ground (or flies, if airborne) toward (x, z) until within `within` m. */
  // Straight-line steering plus a player-like detour: if progress stalls (e.g.
  // against the wreckage), side-step along the obstacle for a moment.
  const goTo = async (x, z, within, timeout = 25000) => {
    const t0 = Date.now();
    let lastCheck = Date.now();
    let lastDist = await distTo(x, z);
    let side = 'KeyD';
    await page.keyboard.down('KeyW');
    while (Date.now() - t0 < timeout && (await distTo(x, z)) > within) {
      await face(x, z);
      await sleep(80);
      if (Date.now() - lastCheck > 600) {
        const d = await distTo(x, z);
        if (lastDist - d < 0.5) {
          await page.keyboard.up('KeyW');
          await page.keyboard.down(side);
          await sleep(900);
          await page.keyboard.up(side);
          await page.keyboard.down('KeyW');
          side = side === 'KeyD' ? 'KeyA' : 'KeyD';
        }
        lastDist = await distTo(x, z);
        lastCheck = Date.now();
      }
    }
    await page.keyboard.up('KeyW');
    await sleep(400);
    return distTo(x, z);
  };

  const crash = await page.evaluate(() => {
    const el = document.querySelector('.hud-objective-dist');
    return el?.textContent ?? '';
  });
  check('story: HUD shows distance to the crash site', /Crash site · \d+ m/.test(crash), crash);

  // Fly over the trees to the crash site, then land.
  const site = { x: -450, z: 380 };
  await page.keyboard.press('KeyF');
  await page.keyboard.down('Space');
  await sleep(1500);
  await page.keyboard.up('Space');
  await page.keyboard.down('ShiftLeft');
  await goTo(site.x, site.z, 40, 45000);
  await page.keyboard.up('ShiftLeft');
  await sleep(2500); // brake to a hover
  await page.keyboard.down('KeyC');
  await sleep(3000);
  await page.keyboard.up('KeyC');
  check('story: arriving at the crash site completes objective 2', (await mission()).objectiveIndex === 2, await objective());
  await page.screenshot({ path: path.join(OUT, '11-crash-site.png') });

  // Rescue each survivor: run up to them and press E.
  const rescueTargets = [
    { x: site.x - 28, z: site.z + 18 },
    { x: site.x + 4, z: site.z + 32 },
    { x: site.x + 30, z: site.z - 22 },
  ];
  let promptSeen = false;
  for (const s of rescueTargets) {
    await goTo(s.x, s.z, 2.2);
    promptSeen ||= (await page.locator('.hud-interact').count()) > 0;
    await page.keyboard.press('KeyE');
    await sleep(400);
  }
  check('story: interaction prompt appears near a survivor', promptSeen);
  check('story: all three survivors rescued', (await mission()).objectiveIndex === 3, await objective());
  await page.screenshot({ path: path.join(OUT, '12-rescued.png') });

  await goTo(site.x - 6, site.z - 3, 3);
  await page.keyboard.press('KeyE');
  await sleep(800);
  const done = page.getByRole('dialog', { name: 'Mission complete' });
  check('story: investigating the wreck completes the prologue', await done.isVisible());
  await page.screenshot({ path: path.join(OUT, '13-mission-complete.png') });
  await page.getByRole('button', { name: 'Free roam' }).click();
  await sleep(500);
  const after = await page.evaluate(() => window.__krypton.app.getState().mode);
  check('story: "Free roam" continues in free mode', after === 'free');
  check('no page errors (story)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}

async function portraitRun(browser) {
  // Phone held upright: the app must present the game in landscape.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message} @ ${(e.stack ?? '').split(String.fromCharCode(10)).slice(1, 6).join(' <- ')}`));
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
  await regionRun(browser);
  await storyRun(browser);
} catch (e) {
  check('smoke run completed without exceptions', false, e.message);
} finally {
  await browser.close();
  server?.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${OUT}`);
process.exit(failed.length ? 1 : 0);
