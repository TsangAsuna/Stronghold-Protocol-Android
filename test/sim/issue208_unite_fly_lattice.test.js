// GitHub #208 — 联防阶段，部分飞行波次怪会斜着飞，不走格子. The escaped_single unite template's official FLY
// checkpoints pair waypoints across both axes at once ((9,6)→(12,7), (12,7)→(11,5), (12,4)→(9,3), (9,4)→(12,5),
// (12,9)→(11,8), (11,5)→(12,3) and the extra route's (11,7)→(9,2)), and compileRoute flew each leg straight —
// the flyer crossed the tiles diagonally. FLY legs are now flown lattice-aligned: every leg axis-aligned, the row
// first (along the current column), then the column (along the target row) — the escaped_multi zigzag's order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, flatStage, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { compileRoute } from '../../server/sim/ai.js';
import { normalizeRoute, hasGeneratedData } from '../../server/sim/simdata.js';
import { GEO } from '../../shared/constants.js';
import { DATA } from '../match/harness.js';

const fmt = (legs) => legs.map((l) => `${l.t}:${l.r ?? ''},${l.c ?? ''}${l.final ? '!' : ''}`);

test('#208 compileRoute: a FLY diagonal leg is flown as two axis-aligned legs, row first — WALK keeps the raw leg', () => {
  const n = normalizeRoute({ motion: 'FLY', start: [9, 6], end: [9, 3], checkpoints: [[12, 7]] });
  assert.deepEqual(fmt(compileRoute(n, null, 'FLY')),
    ['move:12,6', 'move:12,7', 'move:9,7', 'move:9,3!'],
    'row first (along the current column), then the column (along the target row)');
  // axis-aligned checkpoints are never expanded, and the route end too
  const straight = normalizeRoute({ motion: 'FLY', start: [11, 7], end: [9, 2], checkpoints: [] });
  assert.deepEqual(fmt(compileRoute(straight, null, 'FLY')), ['move:9,7', 'move:9,2!']);
  // WALK keeps the official leg: its flow field is 4-direction anyway
  assert.deepEqual(fmt(compileRoute(n, null, 'WALK')), ['move:12,7', 'move:9,3!']);
  // the legacy two-argument call (no motion) is unchanged — boss route signature matching stays stable
  assert.deepEqual(fmt(compileRoute(n, null)), ['move:12,7', 'move:9,3!']);
});

test('#208 compileRoute: after a DISAPPEAR the position is unknown — no expansion until the APPEAR', () => {
  const n = normalizeRoute({ motion: 'FLY', start: [9, 5], end: [9, 2], checkpoints: [] });
  const withTeleport = {
    motion: 'FLY', start: [9, 5], end: [9, 2],
    checkpoints: [
      { type: 'DISAPPEAR', pos: [0, 0] },
      { type: 'APPEAR', pos: [12, 8] },
      { type: 'MOVE', pos: [11, 7] },
    ],
  };
  assert.deepEqual(fmt(compileRoute(withTeleport, null, 'FLY')),
    ['disappear:,', 'appear:12,8', 'move:11,8', 'move:11,7', 'move:9,7', 'move:9,2!']);
});

/** Every move leg reaches a tile centre an axis-aligned step away from the previous positional leg. */
const latticeOk = (legs) => {
  let pr = null, pc = null;
  for (const l of legs) {
    if (l.t === 'move' || l.t === 'appear') {
      if (l.t === 'move' && pr != null && l.r !== pr && l.c !== pc) return `diagonal leg ${pr},${pc} → ${l.r},${l.c}`;
      pr = l.r; pc = l.c;
    } else if (l.t === 'disappear') { pr = null; pc = null; }
  }
  return null;
};

test('#208 联防: every FLY route of both escaped templates compiles into axis-aligned legs', { skip: !hasGeneratedData() }, () => {

  for (const id of ['act1autochess_escaped_single', 'act1autochess_escaped_multi']) {
    const tpl = DATA.waves[id];
    for (const [i, r] of (tpl.routes || []).entries()) {
      if (normalizeRoute(r).motion !== 'FLY') continue;
      const legs = compileRoute(normalizeRoute(r), { ...GEO.UNITE_RECT }, 'FLY');
      const bad = latticeOk(legs);
      assert.equal(bad, null, `${id} route ${i}: ${bad}`);
    }
  }
});

test('#208 联防: a leaked flyer on the escaped_single yokai route flies around the corners, never across the tiles', { skip: !hasGeneratedData() }, () => {

  const routes = DATA.waves.act1autochess_escaped_single.routes.map(normalizeRoute);
  const FLY = { flyer: enemyRec({ key: 'flyer', hp: 1e9, speed: 0.6, motion: 'FLY', atk: 0, range: 0 }) };
  const h = makeBattle({
    kind: 'unite', rect: { ...GEO.UNITE_RECT }, stage: flatStage(), routes, seed: 1,
    defs: { chess: {}, enemies: FLY }, players: [{ playerId: 'p1', seat: 0, side: 'L', colOffset: 0, units: [], bonds: {} }],
    enemies: [], autoFinish: false, timeLimit: 120,
  });
  const flyer = h.spawn('flyer', { routeIndex: 0, time: 0 });
  assert.ok(flyer, 'the flyer spawns');
  const bad = latticeOk(flyer.route.legs);
  assert.equal(bad, null, `route legs: ${bad}`);
  // and it actually flies the whole lattice-aligned path to the gate: sampled positions never move on both axes
  // beyond one step's sliver at a corner
  const path = [];
  let slack = 0;
  for (let k = 0; k < 4000 && flyer.alive && !h.b.finished; k++) {
    h.step();
    const [x, y] = [flyer.x, flyer.y];
    const last = path[path.length - 1];
    if (last) {
      const dx = Math.abs(x - last[0]), dy = Math.abs(y - last[1]);
      if (dx > 0.02 && dy > 0.02) slack++;
    }
    path.push([x, y]);
  }
  assert.ok(!flyer.alive || h.b.finished, 'the flyer finishes its route');
  assert.ok(slack <= 1, `diagonal samples beyond corner slivers: ${slack}`);
  assert.deepEqual(h.b.errors.map((e) => `${e.label} ${e.message}`), []);
  checkInvariants(h.b);
});
