// GitHub #218 余在5本时特性可以获得6本干员.
// 余's 特质 (garrison_37 SERVER_MOST_BOND "进入休整期时…随机获得1名当前人数最多盟约的干员") rolled any tier —
// capped at 6 — so at shop level 5 a 6 本 operator could drop. The grant follows the current shop level now (like
// the item rolls of SERVER_GAIN_RANDOM_EQUIP_CHESS_IN_POOL): 5 本 grants at most a 5 本 chess.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, give, DATA } from '../match/harness.js';
import { createRegistry } from '../../server/match/effectsMeta.js';

const QUIET = { warn() {}, error() {}, info() {} };
const REG = createRegistry({ log: QUIET });
const YU = 'chess_char_6_03_a'; // 余: garrison_37_a (conditionkey character_same_row, 3 in the row)
const MANI = 'maniShip';        // 调和: its only pool member is the 6 本 缪尔赛思 chess_char_6_11_a
const MUSE = 'chess_char_6_11_a';

/** Visible non-golden chess without a prep-side 特质 of their own (row fillers: they must not grant anything). */
const FILLERS = Object.values(DATA.chess)
  .filter((c) => c.visible && !c.isGolden && c.chessId !== YU && !(c.bonds || []).includes(MANI)
    && (c.garrisonIds || []).every((g) => DATA.garrisons[g] && DATA.garrisons[g].eventType === 'IN_BATTLE'))
  .map((c) => c.chessId).sort();
assert.ok(FILLERS.length >= 2, 'trait-free fillers exist');

function setup(seed = 70) {
  const h = makeMatch({ mode: 'solo', seed, registry: REG, fake: true }).start();
  h.toPrep(1);
  const m = h.m;
  const ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear();
  ps.hand.fill(null);
  ps.temp.fill(null);
  ps.offers.length = 0;
  ps.funds = 50;
  ps.layers = {};
  ps.pendingFunds = 0;
  ps.shop.freeRefreshes = 0;
  ps.bandId = null; // isolate from the band's own prep effects
  ps.recompute();
  const roundStart = () => m.dispatch(ps, 'onRoundStart', { round: m.round });
  const handChess = () => [...ps.hand, ...ps.temp].filter((p) => p && p.kind === 'chess').map((p) => p.id);
  return { h, m, ps, roundStart, handChess };
}

/** 余 + two trait-free fillers in the same row; 调和 is strictly the most-member bond (count bonus 9). */
function yuRow(shopLevel, seed) {
  const s = setup(seed);
  give(s.m, s.ps, YU, 'board', [10, 4]);
  give(s.m, s.ps, FILLERS[0], 'board', [10, 6]);
  give(s.m, s.ps, FILLERS[1], 'board', [10, 8]);
  s.ps.bondCountBonus[MANI] = 9;
  s.ps.shop.level = shopLevel;
  s.ps.recompute();
  return s;
}

test('余 特质: the grant follows the shop level — 5 本 never yields the 6 本 缪尔赛思, 6 本 does', () => {
  const five = yuRow(5);
  five.roundStart();
  assert.deepEqual(five.handChess(), [], '5 本: the top bond 调和 has no chess of tier ≤ 5 — nothing granted');

  const six = yuRow(6, 71);
  six.roundStart();
  assert.deepEqual(six.handChess(), [MUSE], '6 本: 缪尔赛思 is granted');
});
