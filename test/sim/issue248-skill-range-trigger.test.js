// GitHub #248: a melee skill with its own expanded rangeGrid auto-fires as soon as an enemy is inside the
// SKILL range — the normal attack range must not gate the cast (Gavial the Invincible S2: skill rows ±1,
// cols +1/+2 while the normal range is only the own tile and the one ahead).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';

const REAL = { skip: !hasGeneratedData() };

test('#248: an enemy inside the expanded skill range (outside the normal range) triggers the auto cast', REAL, () => {
  const h = makeBattle({
    units: [{ chessId: 'chess_char_5_18_a', row: 10, col: 4, skillIndex: 1 }], // 百炼嘉维尔 S2 链锯强袭
    enemies: [{ key: 'e_dummy', pos: [11, 6] }],   // inside the skill grid ([1,2]), outside [[0,0],[0,1]]
    defs: { enemies: { e_dummy: { key: 'e_dummy', hp: 1e9, speed: 0, def: 0, res: 0 } } },
    autoFinish: false, timeLimit: 60,
  });
  h.step();
  const u = h.unit('chess_char_5_18_a');
  u.skill.gainSp(100);                              // skip the charge wait: the test is about the trigger condition
  assert.ok(h.runUntil(() => u.skill.active, 2), 'the cast fires on the skill-range enemy');
  checkInvariants(h.b);
});
