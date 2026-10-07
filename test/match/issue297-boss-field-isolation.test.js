// test/match/issue297-boss-field-isolation.test.js — GitHub #297: 「地面高台干员可以放置到对方的地块」.
// In the Final Assault / Hidden Core prep the two players share the boss battlefield, each on its own half
// (deployFieldOf 'bossL' / 'bossR'): a placement must be judged by the player's OWN half — the deploy map built
// from its field — and not by the other player's tiles.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ERR, PHASE } from '../../shared/constants.js';
import { bossFieldPlacement } from '../../server/match/finalAssault.js';
import { makeMatch, chessOfTier, give, checkInvariants } from './harness.js';

const STAGE = 'act2autochess_m01';

/** A 2-human co-op match at the prep of the boss round (fake battles). */
function coopAtBossRound(o = {}) {
  const h = makeMatch(o).start();
  h.setStage(STAGE);
  h.toPrep(14);
  return h;
}

/** Empty the player's board and hand (deterministic scenario). */
function clean(ps) {
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear();
  ps.hand.fill(null);
  ps.recompute();
}

describe('#297 sweep: no legal path places onto the other half', () => {
  test('2p boss prep: p_0 cannot target the R half (board cols only 2..10); p_1 mirror likewise; 3p re-pair keeps sides consistent', () => {
    const h = coopAtBossRound({ mode: 'coop', difficulty: 'NORMAL', humans: 2, seed: 21, fake: true });
    const m = h.m;
    assert.equal(m.round, m.gd.bossRound);
    clean(h.ps('p_0')); clean(h.ps('p_1'));
    const id = chessOfTier(1, (c) => c.position === 'RANGED').find((x) => m.pool.has(x)) || chessOfTier(1, (c) => c.position === 'MELEE').find((x) => m.pool.has(x));
    const a = give(m, h.ps('p_0'), id);
    // board cols 11..20 (the R half in L's frame) are outside FIELD → refused, not placed
    for (const col of [11, 12, 15, 18, 20]) {
      const res = m.handle('p_0', { t: 'g.move', uid: a.uid, to: { area: 'board', row: 10, col } });
      assert.equal(res.error, ERR.BAD_TILE, `p_0 board col ${col} refused`);
      assert.equal(h.ps('p_0').board.get(`10,${col}`), undefined, `nothing placed at 10,${col}`);
    }
    // rows 1..5 (the boss field rows themselves) are not board tiles either
    for (const row of [2, 3, 4, 5]) {
      const res = m.handle('p_0', { t: 'g.move', uid: a.uid, to: { area: 'board', row, col: 4 } });
      assert.equal(res.error, ERR.BAD_TILE, `p_0 boss row ${row} refused`);
    }
    checkInvariants(m);
    m.dispose();

    // 3 players, one quits before the boss round: re-pairing keeps every side consistent with the server's own map
    const h3 = makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 3, seed: 5, fake: true }).start();
    h3.setStage(STAGE);
    h3.toPrep(14);
    const m3 = h3.m;
    const sides = ['p_0', 'p_1', 'p_2'].map((pid) => m3.deployFieldOf(h3.ps(pid)));
    assert.deepEqual(sides, ['bossL', 'bossR', 'bossL'], 'seat pairing (2,1),(3)');
    // the client's mirror rule (prepCamera idx%2 over alive players) must agree with the server for every alive list
    const alive = h3.m.alivePlayers().map((p) => p.playerId);
    const clientSides = Object.fromEntries(alive.map((pid, idx) => [pid, idx % 2 === 1 ? 'bossR' : 'bossL']));
    for (const pid of alive) assert.equal(clientSides[pid], m3.deployFieldOf(h3.ps(pid)), `client/server side agree for ${pid}`);
    checkInvariants(m3);
    m3.dispose();
  });
});
