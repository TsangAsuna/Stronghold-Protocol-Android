// GitHub #231 绝食干员吃不到锡人2/魔王/红蒂等的生命恢复效果.
// PRTS: "无法被友方角色治疗" (武者 / 收割者 / 不屈者, flag `noHeal`) refuses 治疗-class heals from OTHER units only;
// an HP-recovery effect (生命恢复 — the 吟游者 trait aura, 锡人's 炼金单元 per-second recovery, 浊心斯卡蒂's 海嗣
// range extension) is "不会被识别为治疗类能力" (the rule damage.js already applied to 禁疗) and reaches them too.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';

const SOULLESS = 'chess_char_2_17_a'; // 折桠 (不屈者): "无法被友方角色治疗", no self heal of its own
const BARD = 'chess_char_5_09_a';     // 魔王 (吟游者): the trait recovers 10 % ATK/s inside its range

function soulless() {
  return makeBattle({
    seed: 7, timeLimit: 60, autoFinish: false, content: 'none',
    units: [
      { chessId: SOULLESS, row: 10, col: 4 },
      { chessId: BARD, row: 10, col: 5 }, // the aura's range covers the left neighbour ([0,-1])
    ],
  });
}

test('noHeal still refuses a 治疗-class heal from another unit; a self heal passes', () => {
  const h = soulless();
  h.step();
  const yu = h.unit(SOULLESS), bard = h.unit(BARD);
  assert.ok(yu.profile.noHeal, '折桠 carries the 绝食 profile');
  yu.hp = 1000;
  assert.equal(h.b.heal(bard, yu, 100), 0, 'another unit 治疗: refused');
  assert.equal(yu.hp, 1000);
  assert.equal(h.b.heal(yu, yu, 100), 100, 'self heal: passes');
  checkInvariants(h.b);
});

test('an HP-recovery effect (regen) from another unit heals the 绝食 ally', () => {
  const h = soulless();
  h.step();
  const yu = h.unit(SOULLESS), bard = h.unit(BARD);
  yu.hp = 1000;
  assert.equal(h.b.heal(bard, yu, 100, { regen: true }), 100, 'regen (生命恢复): passes');
  yu.hp = 1000;
  h.run(2.5); // two aura pulses of 魔王: the trait's per-second recovery reaches the 绝食 ally
  assert.ok(yu.hp > 1000, `the 吟游者 aura recovers the 绝食 ally (1000 → ${yu.hp})`);
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
});
