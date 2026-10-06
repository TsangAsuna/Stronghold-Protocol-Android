// The strategy draft's pre-claims (预定, GitHub issue #247): a communication tool for voiceless teams. A seated player
// without a pick may claim a strategy (also before its turn — that is the point — and any number may claim the same
// one; only a CONFIRMED pick excludes the others) or a bond icon; the room sees the claims in m.public.draft.claims
// ({ [playerId]: { strategy, bond } }, the highlighted strategy of g.bandFocus counts as a claim too); a claim is
// cleared by its player's pick, the end of the draft, or leaving; a confirm dissolves the claims it collides with.
// Client seam: screens/bandDraft.js normalizeClaims / claimersOf (the mask / bubble state derives from them).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ERR, PHASE } from '../../shared/constants.js';
import { validateC2S } from '../../shared/protocol.js';
import { makeMatch, DATA } from './harness.js';
import { normalizeClaims, claimersOf } from '../../public/js/screens/bandDraft.js';

const BAND = 'band_amiya';
const BOND = Object.keys(DATA.bonds)[0];
const LISA = 'band_lisa';
const SARKAZB = 'band_sarkazb';

/** A co-op match in BAND_DRAFT with every human confirmed. */
function draftOf(o = {}) {
  const h = makeMatch({ mode: 'coop', humans: 3, seed: 5, ...o }).start();
  const m = h.m;
  for (const ps of m.players.values()) if (!ps.isBot) m.handle(ps.playerId, { t: 'g.infoReady' });
  h.sched.advance(1);
  assert.equal(m.phase, PHASE.BAND_DRAFT);
  return h;
}

test('protocol: g.draftClaim { kind, id? } validates kind, nullable id and shape', () => {
  assert.equal(validateC2S({ t: 'g.draftClaim', kind: 'strategy', id: BAND }), null);
  assert.equal(validateC2S({ t: 'g.draftClaim', kind: 'bond', id: BOND }), null);
  assert.equal(validateC2S({ t: 'g.draftClaim', kind: 'strategy' }), null, 'id is optional (clears)');
  assert.equal(validateC2S({ t: 'g.draftClaim', kind: 'strategy', id: null }), null);
  assert.equal(typeof validateC2S({ t: 'g.draftClaim', kind: 'chip', id: BAND }), 'string', 'kind is strategy|bond');
  assert.equal(typeof validateC2S({ t: 'g.draftClaim' }), 'string');
  assert.equal(typeof validateC2S({ t: 'g.draftClaim', kind: 'strategy', id: 'has space' }), 'string');
});

test('a claim rides m.public.draft.claims; it needs no turn and the shape is { strategy, bond }', () => {
  const h = draftOf();
  const m = h.m;
  const [first, second] = m.draft.order;
  // `second` is NOT the current picker — that is the point of the feature
  assert.notEqual(m.draftTurn(), second);
  assert.deepEqual(m.handle(second, { t: 'g.draftClaim', kind: 'strategy', id: BAND }), { ok: true });
  const view = m.publicView().draft.claims;
  assert.deepEqual(view[second], { strategy: BAND, bond: null }, 'the claim entry: { strategy, bond }');
  assert.equal(m.draft.picks[second], undefined, 'a claim is not a pick: no checkmark on the server side either');
  // broadcast shape (the throttled channel needs the force)
  m.flush(true);
  assert.deepEqual(h.lastBc('m.public').draft.claims[second], { strategy: BAND, bond: null });
  // the current picker's claim is just as accepted (it is communication, not a move)
  assert.deepEqual(m.handle(first, { t: 'g.draftClaim', kind: 'strategy', id: LISA }), { ok: true });
  assert.equal(m.publicView().draft.claims[first].strategy, LISA);
  m.dispose();
});

test('any number of players may pre-claim the same strategy; a highlighted strategy (g.bandFocus) is a claim too', () => {
  const h = draftOf();
  const m = h.m;
  const [a, b, c] = m.draft.order;
  assert.deepEqual(m.handle(a, { t: 'g.draftClaim', kind: 'strategy', id: BAND }), { ok: true });
  assert.deepEqual(m.handle(b, { t: 'g.draftClaim', kind: 'strategy', id: BAND }), { ok: true }, 'the same claim twice is fine');
  assert.deepEqual(m.handle(c, { t: 'g.bandFocus', bandId: BAND }), { ok: true });
  const claims = m.publicView().draft.claims;
  assert.deepEqual(Object.keys(claims).sort(), [a, b, c].sort(), 'all three show up');
  for (const pid of [a, b, c]) assert.equal(claims[pid].strategy, BAND, `${pid}: explicit claim or highlight`);
  m.dispose();
});

test('a claim is refused outside the draft, with a bad kind / id, on a taken strategy and after the pick', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 5 }).start();
  assert.equal(h.m.handle('p_0', { t: 'g.draftClaim', kind: 'strategy', id: BAND }).error, ERR.WRONG_PHASE, 'INFO_CHECK');
  for (const ps of h.m.players.values()) if (!ps.isBot) h.m.handle(ps.playerId, { t: 'g.infoReady' });
  h.sched.advance(1);
  const m = h.m;
  const cur = m.draftTurn();
  const other = m.draft.order.find((pid) => pid !== cur);
  assert.equal(m.handle(cur, { t: 'g.draftClaim', kind: 'chip', id: BAND }).error, ERR.BAD_MSG);
  assert.equal(m.handle(cur, { t: 'g.draftClaim', kind: 'strategy', id: 'nope' }).error, ERR.BAD_TARGET);
  assert.equal(m.handle(cur, { t: 'g.draftClaim', kind: 'bond', id: 'nope' }).error, ERR.BAD_TARGET);
  // the first confirm: BAND is 队友已选 afterwards — claiming it is refused
  assert.deepEqual(m.handle(cur, { t: 'g.band', bandId: BAND }), { ok: true });
  assert.equal(m.handle(other, { t: 'g.draftClaim', kind: 'strategy', id: BAND }).error, ERR.BAD_TARGET, '队友已选');
  assert.equal(m.handle(other, { t: 'g.draftClaim', kind: 'strategy', id: BAND }).detail, '队友已选');
  // the other one's own pick ends its claiming too
  assert.deepEqual(m.handle(other, { t: 'g.draftClaim', kind: 'strategy', id: 'band_bldsk' }), { ok: true });
  assert.deepEqual(m.handle(other, { t: 'g.band', bandId: 'band_bldsk' }), { ok: true }, 'it is their turn now');
  assert.equal(m.handle(other, { t: 'g.draftClaim', kind: 'strategy', id: LISA }).error, ERR.ALREADY, 'picked ⇒ nothing to claim');
  m.dispose();
});

test('a bond claim publishes the bond id next to the strategy claim (side by side on the avatar)', () => {
  const h = draftOf();
  const m = h.m;
  const [a] = m.draft.order;
  assert.deepEqual(m.handle(a, { t: 'g.draftClaim', kind: 'strategy', id: BAND }), { ok: true });
  assert.deepEqual(m.handle(a, { t: 'g.draftClaim', kind: 'bond', id: BOND }), { ok: true });
  assert.deepEqual(m.publicView().draft.claims[a], { strategy: BAND, bond: BOND });
  // clearing the strategy claim keeps the bond (and vice versa); clearing the last one drops the entry
  assert.deepEqual(m.handle(a, { t: 'g.draftClaim', kind: 'strategy' }), { ok: true });
  assert.deepEqual(m.publicView().draft.claims[a], { strategy: null, bond: BOND });
  assert.deepEqual(m.handle(a, { t: 'g.draftClaim', kind: 'bond', id: null }), { ok: true });
  assert.equal(m.publicView().draft.claims[a], undefined, 'no claim ⇒ no entry');
  m.dispose();
});

test('a confirm dissolves its player\'s claims and the strategy claims it collides with', () => {
  const h = draftOf();
  const m = h.m;
  const [a, b, c] = m.draft.order;
  m.handle(a, { t: 'g.draftClaim', kind: 'strategy', id: BAND });
  m.handle(b, { t: 'g.draftClaim', kind: 'bond', id: BOND });
  m.handle(c, { t: 'g.draftClaim', kind: 'strategy', id: BAND });
  m.handle(c, { t: 'g.draftClaim', kind: 'bond', id: BOND });
  // everyone picks a distinct strategy — c confirms the claimed one when its turn comes
  const pick = { [a]: LISA, [b]: SARKAZB, [c]: BAND };
  for (let i = 0; i < 6 && !m.draft.picks[c]; i++) {
    const cur = m.draftTurn();
    m.handle(cur, { t: 'g.band', bandId: pick[cur] });
  }
  assert.equal(m.draft.picks[c], BAND, 'c confirmed the claimed strategy');
  const claims = m.publicView().draft.claims || {};
  assert.equal(claims[c], undefined, 'the picker\'s own claims are gone');
  assert.equal(claims[a]?.strategy ?? null, null, 'a\'s claim on the now-taken strategy dissolved');
  if (claims[b]) assert.equal(claims[b].bond, BOND, 'an unrelated claim survives a teammate\'s confirm');
  m.dispose();
});

test('leaving clears the claim; the draft\'s end clears them all', () => {
  const h = draftOf();
  const m = h.m;
  const [a, b, c] = m.draft.order;
  m.handle(a, { t: 'g.draftClaim', kind: 'strategy', id: BAND });
  m.handle(b, { t: 'g.draftClaim', kind: 'bond', id: BOND });
  m.onLeave(a);
  assert.equal((m.publicView().draft.claims || {})[a], undefined, 'the departed seat\'s claim is gone');
  assert.ok(m.publicView().draft.claims[b], 'the others\' claims stay');
  m.handle(b, { t: 'g.draftClaim', kind: 'strategy', id: LISA });
  // the rest picks → the draft ends and the claims are cleared with it (the departed seat got the default 华法琳)
  const pick = { [b]: LISA, [c]: SARKAZB };
  for (let i = 0; i < 6 && m.phase === PHASE.BAND_DRAFT && m.draftTurn(); i++) {
    const cur = m.draftTurn();
    m.handle(cur, { t: 'g.band', bandId: pick[cur] });
  }
  h.sched.advance(1); // the finish runs scheduled
  assert.equal(m.phase, PHASE.BATTLE_CHECK);
  assert.equal(m.draft.claims.size, 0, 'the draft is over: no claims left');
  m.dispose();
});

test('a spectator seat cannot claim (it only watches)', () => {
  const h = draftOf({ spectators: ['s_0'] });
  assert.equal(h.m.handle('s_0', { t: 'g.draftClaim', kind: 'strategy', id: BAND }).error, ERR.SPECTATOR);
  h.m.dispose();
});

describe('UI seam: normalizeClaims / claimersOf', () => {
  test('normalizeClaims keeps only players with a claim and nulls the rest', () => {
    const claims = normalizeClaims({
      a: { strategy: 'band_x', bond: null },
      b: { strategy: null, bond: 'raidShip' },
      c: { strategy: null, bond: null },
      d: 'garbage',
      e: null,
    });
    assert.deepEqual([...claims.keys()].sort(), ['a', 'b']);
    assert.deepEqual(claims.get('a'), { strategy: 'band_x', bond: null });
    assert.deepEqual(claims.get('b'), { strategy: null, bond: 'raidShip' });
    assert.equal(normalizeClaims(null).size, 0);
    assert.equal(normalizeClaims(undefined).size, 0);
    assert.equal(normalizeClaims([1, 2]).size, 0, 'arrays are not claims');
  });

  test('claimersOf lists the players of one strategy / bond, several side by side', () => {
    const claims = normalizeClaims({
      a: { strategy: 'band_x', bond: null },
      b: { strategy: 'band_x', bond: 'raidShip' },
      c: { strategy: 'band_y', bond: 'raidShip' },
    });
    assert.deepEqual(claimersOf(claims, 'strategy', 'band_x'), ['a', 'b'], 'both pre-claimers of band_x');
    assert.deepEqual(claimersOf(claims, 'strategy', 'band_y'), ['c']);
    assert.deepEqual(claimersOf(claims, 'strategy', 'band_z'), []);
    assert.deepEqual(claimersOf(claims, 'bond', 'raidShip'), ['b', 'c']);
    assert.deepEqual(claimersOf(null, 'strategy', 'band_x'), []);
  });
});
