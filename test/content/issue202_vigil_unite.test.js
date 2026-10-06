// GitHub #202 — 伺夜 in 联防 (unite): "上场伺夜后，不部署狼，狼群会在战斗开始时自动部署。而且联防阶段狼群会重新
// 部署，部署位置也会发生改变". The official rule (kits/tier3.js 伺夜): the pack comes only through the player's
// deployment — the 狼群 piece placed in the prep phase. A unite phase carries the board's summon pieces beside the
// operators (server/match/unite.js "召唤物仅修改技力"), so the pack re-deploys on the very tile the player chose and
// with no placement nothing appears at all (a fresh battle of any kind must never auto-deploy it on a tactical point).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { TOKEN_IDS } from '../../server/sim/content/tokens.js';

const REAL = { skip: !hasGeneratedData() };
const VIGIL = 'chess_char_3_19_a';
const WOLF = TOKEN_IDS.wolfPack;
const BOARD = [{ chessId: VIGIL, row: 10, col: 3, uid: 1 }, { kind: 'token', tokenId: WOLF, ownerUid: 1, row: 10, col: 5, uid: 2 }];

test('#202 联防: the placed 狼群 re-deploys on the tile the player chose — the same tile as in the player’s own combat, never a drifted tactical point', REAL, () => {
  // the player's own combat (the round's normal battle): the pack stands on the placed tile
  const own = makeBattle({ units: BOARD, autoFinish: false, timeLimit: 10 });
  own.step();
  const piece0 = own.unit(2);
  assert.ok(piece0.alive, 'the pack deploys in the player’s own combat');
  assert.deepEqual([piece0.tileR, piece0.tileC], [10, 5], 'on the tile the player chose');
  assert.equal(own.unit(1).trait.reinforcement, piece0, 'it is 伺夜’s 援军');
  done(own);

  // the 联防 phase: a fresh unite battle from the same board — the pack comes back on the very same tile
  const unite = makeBattle({ kind: 'unite', units: BOARD, autoFinish: false, timeLimit: 10 });
  unite.step();
  const piece = unite.unit(2);
  assert.ok(piece.alive, 'the pack re-deploys in the unite phase');
  assert.deepEqual([piece.tileR, piece.tileC], [10, 5], 'same position as its own combat — no drift');
  assert.equal(unite.unit(1).trait.reinforcement, piece, 'still 伺夜’s 援军 there');
  assert.equal(unite.b.allyUnits.filter((u) => u.kind === 'token' && u.defId === WOLF && u.alive).length, 1,
    'no second pack on a fresh tactical point');
  done(unite);
});

test('#202 联防: with no 狼群 placed the unite phase sees no pack either — nothing auto-deploys at the battle start', REAL, () => {
  const unite = makeBattle({ kind: 'unite', units: [{ chessId: VIGIL, row: 10, col: 3, uid: 1 }], autoFinish: false, timeLimit: 10 });
  unite.run(2);
  assert.equal(unite.b.allyUnits.filter((u) => u.defId === WOLF).length, 0,
    'no pack auto-deployed at the battle start of a 联防 phase');
  assert.ok(!unite.unit(1).trait.reinforcement, 'and the tactician has no 援军');
  done(unite);
});

const done = (h) => { assert.deepEqual(h.b.errors.map((e) => `${e.label} ${e.message}`), []); checkInvariants(h.b); };
