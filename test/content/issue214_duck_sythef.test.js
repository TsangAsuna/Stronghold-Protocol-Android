// test/content/issue214_duck_sythef.test.js — GitHub #214: the 鸭爵 strategy's swapped-in 流泪小子 walked the blue
// gate 隐匿 with no operator able to pick it. The strategy's special version (enemy_2034_sythef_2, the swap's only
// source — server/sim/content/bands/meta.js duckReplace) now spawns WITHOUT 隐匿 (content/enemies.js): a ranged
// operator damages and kills it on an unblocked lane. The original rogue-like enemy_2034_sythef keeps its 隐匿.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';

const BIG = [];
for (let dr = -4; dr <= 4; dr++) for (let dc = -12; dc <= 12; dc++) BIG.push([dr, dc]);
const GUN = (id) => chessRec({ id, profession: 'SNIPER', projectile: 'none', stats: { atk: 5000, maxHp: 1e7, bat: 1, blockCnt: 0 }, rangeGrid: BIG, skill: null });

function arena(enemies) {
  return makeBattle({
    content: 'generic', extraContent: [enemiesMod], seed: 7, timeLimit: 600,
    defs: { chess: { t_gun: GUN('t_gun') } },
    units: [{ chessId: 't_gun', row: 10, col: 5 }],
    enemies,
  });
}

test('#214 the 鸭爵 strategy swap of 流泪小子 (enemy_2034_sythef_2) is no 隐匿: a ranged operator kills it on an unblocked lane', () => {
  const h = arena([{ key: 'enemy_2034_sythef_2', time: 0, route: 0 }]);
  h.step();
  const e = h.enemy('enemy_2034_sythef_2');
  assert.ok(e, 'spawned');
  assert.ok(!e.s.flags.stealth, 'the strategy copy carries no 隐匿');
  // it walks the lane through the sniper's range and dies before the blue gate (pre-fix: never targeted, always leaked)
  const r = h.runToEnd(60);
  assert.ok(e.hp <= 0, 'killed by the sniper');
  assert.ok(!h.hooksOf('enemyLeak').some((c) => c.enemy.defId === 'enemy_2034_sythef_2'), 'no leak');
  assert.equal(r.reason, 'cleared');
  checkInvariants(h.b);
});

test('#214 the original 流泪小子 (enemy_2034_sythef) keeps its 隐匿 — untouched official behaviour', () => {
  const h = arena([{ key: 'enemy_2034_sythef', time: 0, route: 0 }]);
  h.step();
  const e = h.enemy('enemy_2034_sythef');
  assert.ok(e && e.s.flags.stealth, 'the original spawns 隐匿');
  assert.equal(e.stats.taken, 0, 'the sniper cannot pick a stealthed enemy');
  checkInvariants(h.b);
});
