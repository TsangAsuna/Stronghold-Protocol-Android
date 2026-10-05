// debug-deploy.mjs — drive the real client: solo sim → prep → buy → place via
// g.move, then burst-screenshot to observe whether the deploy ring fx and the
// model's deploy clip play. SP_E2E=1 node tools/debug-deploy.mjs

import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH || ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => existsSync(p));
const OUT = path.join(ROOT, '.cache');
mkdirSync(OUT, { recursive: true });

const { startServer } = await import(pathToFileURL(path.join(ROOT, 'server/index.js')));
const { default: puppeteer } = await import('puppeteer-core');

const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1600,900', '--lang=zh-CN'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));
await page.goto(`http://127.0.0.1:${srv.port}/`, { waitUntil: 'networkidle2', timeout: 60_000 });
await page.waitForFunction('!!(globalThis.__SP__ && globalThis.__SP__.store)', { timeout: 30_000 });
await new Promise((r) => setTimeout(r, 1500));

// title screen: callsign + 开始
await page.evaluate(() => {
  const input = document.querySelector('input');
  if (input) {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(input, 'Debug');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
});
await page.evaluate(() => {
  for (const el of document.querySelectorAll('button, [role=button], div, span')) {
    if ((el.textContent || '').trim() === '开 始' || /^开始/.test((el.textContent || '').trim())) { el.click(); break; }
  }
});
await new Promise((r) => setTimeout(r, 2000));

// create a solo room through the game's own protocol, then start it
const room = await page.evaluate(async () => {
  const sp = globalThis.__SP__;
  await sp.net.request('room.create', { mode: 'solo', difficulty: 'FUNNY' });
  await new Promise((r) => setTimeout(r, 800));
  await sp.net.request('room.ready', { ready: true });
  await new Promise((r) => setTimeout(r, 500));
  await sp.net.request('room.start', {});
  return 'started';
});
const infoRes = await page.evaluate(() => window.__infoReadyRes);
console.log('[room]', JSON.stringify(room), 'infoReady:', infoRes);
await new Promise((r) => setTimeout(r, 6000));
await page.screenshot({ path: path.join(OUT, 'dd-2-prep.png') });

// buy slot 0 and move it onto the board via the game's own protocol
const moveResult = await page.evaluate(async () => {
  const sp = globalThis.__SP__;
  const st = sp.store.get ? sp.store.get() : sp.store.state;
  const shape = { top: Object.keys(st), matchKeys: st.match ? (typeof st.match.get === 'function' ? Object.keys(st.match.get()) : Object.keys(st.match)) : null };
  const pub = st.match?.public;
  if (!pub) return { err: 'no battle pub', shape };
  const buyRes = await sp.net.request('g.buy', { slot: 0 }).then(() => 'ok').catch((e) => 'buy: ' + e.message);
  await new Promise((r) => setTimeout(r, 1200));
  const st2 = sp.store.get();
  const pub2 = st2.match?.public;
  const priv = st2.match?.private;
  const shape2 = {
    phase: pub2?.phase, buyRes,
    hand: JSON.stringify(priv?.hand ?? []).slice(0, 200),
    shop: JSON.stringify(priv?.shop ?? []).slice(0, 160),
    board: JSON.stringify(priv?.board ?? []).slice(0, 160),
    fieldsSample: JSON.stringify(pub2?.fields ?? null).slice(0, 300),
  };
  const hand = (priv?.chess?.hand ?? priv?.hand ?? []).find((u) => u);
  // find a free board slot: rows of the prep field
  const field = pub2?.stage?.field ?? pub2?.chess?.field ?? pub2?.field;
  let to = null;
  if (Array.isArray(field)) {
    outer: for (let r = 0; r < field.length; r++) {
      for (let c = 0; c < (field[r] ?? []).length; c++) {
        const cell = field[r][c];
        if (cell && (cell.type === 'slot' || cell === 'slot' || cell.place === 'slot')) { to = { row: r, col: c }; break outer; }
      }
    }
  }
  if (!hand || !to) return { err: 'no hand unit or slot', hand: !!hand, to, ...shape2, fieldSample: JSON.stringify(field?.[0] ?? []).slice(0, 120) };
  await sp.net.request('g.move', { uid: hand.uid, to, dir: 'RIGHT' }).catch((e) => ({ err: 'move: ' + e.message }));
  return { ok: true, uid: hand.uid, to };
});
console.log('[move]', JSON.stringify(moveResult));

// burst screenshots right after the placement
for (let i = 0; i < 8; i++) {
  await page.screenshot({ path: path.join(OUT, `dd-3-deploy-${i}.png`) });
  await new Promise((r) => setTimeout(r, 130));
}
console.log('[done] burst saved');
await browser.close();
await srv.close();
process.exit(0);
