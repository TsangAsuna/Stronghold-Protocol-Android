// GitHub #232 再部署之后的干员无法阻挡破隐被冰冻的隐身怪.
// A frozen / stunned enemy never reaches the walk loop (ai.js updateEnemy) and its block re-check ran behind the
// stun exit — so it stayed unblocked for the whole freeze and an operator redeployed into its block radius could
// never take the block over (Battle._checkBlock runs for every unblocked enemy, moving or not).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const BLOCKER = 'chess_char_2_17_a'; // 折桠: 阻挡数 3

/** The blocker parked out of contact; a speed-0 enemy 0.7 from tile (9,5)'s centre — inside the ground block radius. */
function frozenScene() {
  return makeBattle({
    seed: 3, timeLimit: 60, autoFinish: false, content: 'none',
    units: [{ chessId: BLOCKER, row: 10, col: 2 }],
    defs: { enemies: { walker: enemyRec({ key: 'walker', hp: 4000, speed: 0, blockCnt: 1 }) } },
    enemies: [{ key: 'walker', pos: [9, 4.3] }],
  });
}

function freezeAt(h, { reveal }) {
  h.step();
  const e = h.enemies()[0];
  h.b.applyStatus(e, 'stealth', { duration: 999, source: e }); // 隐身怪
  if (reveal) h.b.applyStatus(e, 'reveal', { duration: 999 }); // 破隐
  h.b.applyStatus(e, 'freeze', { duration: 999 });             // 冰冻
  h.run(0.3);
  assert.ok(e.s.flags.freeze && e.s.flags.stealth, 'the enemy is frozen');
  assert.ok(!e.blockedBy, 'nothing in contact yet');
  return e;
}

test('an operator redeployed next to a revealed, frozen 隐匿 enemy takes the block over (GitHub #232)', () => {
  const h = frozenScene();
  const e = freezeAt(h, { reveal: true });
  const u = h.unit(BLOCKER);
  h.b.retreat(u, { reason: 'retreat' });
  assert.ok(h.b.redeploy(u, { tile: [9, 5] }), 'the operator redeploys next to the frozen enemy');
  h.run(0.3);
  assert.equal(e.blockedBy, u, 'the frozen enemy is blocked again');
  assert.ok(h.b.blockedTargets(u, u.profile).includes(e), 'and its blocker may target it');
  checkInvariants(h.b);
});

test('contact blocking ignores 隐匿: a still-stealthed frozen enemy is blocked too', () => {
  const h = frozenScene();
  const e = freezeAt(h, { reveal: false });
  const u = h.unit(BLOCKER);
  h.b.retreat(u, { reason: 'retreat' });
  assert.ok(h.b.redeploy(u, { tile: [9, 5] }));
  h.run(0.3);
  assert.equal(e.blockedBy, u, 'an invisible enemy standing in the radius is blocked (contact rule)');
  checkInvariants(h.b);
});
