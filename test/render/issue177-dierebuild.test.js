// test/render/issue177-dierebuild.test.js — GitHub issue #177 「部分干员闭眼时眼球没有被完全遮住（倒地 / 眨眼）」,
// client side. A knocked-out operator facing UP has its model REBUILT (render/units.js _acquireSpine via _syncModel:
// the Back skeleton has no Die clip, so the Front one plays the fall, issue #25) while it is already dead, and the
// rebuild replayed the death with a live die() plus one update(at) — skipped entirely when `at` was 0, so the fresh
// skeleton sat on its SETUP pose (on the eye slots: open eyeballs, no eyelids — their attachments exist only inside
// the clips, both eye structures of the report: the same-slot O_Eye ⇄ C_Eye swap and the separate Eyeclose
// overlays) — and mixed the constructor's idle stand-in in on top. SpineActor.dieAt now resumes the clip at the
// restored time, with no mix, and applies the state at once. Verified two ways: headless fake PIXI
// (test/render/fakepixi.js) with the real manifest entries, and the REAL pixi-spine runtime
// (@pixi-spine/runtime-3.8, what public/vendor/pixi-spine.js bundles for 3.8 skeletons) driving SpineActor over a
// synthetic skeleton whose eye slots are attachment-driven like the report's models.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { spineEntry, hasBackSpine } from '../../public/js/assets.js';
import { SkeletonData, BoneData, SlotData, Skin, Animation, AttachmentTimeline, Skeleton, AnimationState, AnimationStateData, Spine } from '@pixi-spine/runtime-3.8';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const M = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const CAPER = 'char_4100_caper';   // 跃跃: the issue #25 operator — an UP-facing one rebuilds with its Front model

let fake, UnitView, DOWN_STATE, SpineActor;
before(async () => {
  fake = installFakePixi();
  ({ UnitView, DOWN_STATE } = await import('../../public/js/render/units.js'));
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
});
after(() => fake.restore());

const tick = () => new Promise((r) => setImmediate(r));
const settle = async () => { await tick(); await tick(); };
const cam = () => presetCamera('normal', { width: 1280, height: 720 });
let clockT = 0;
const frames = (v, n, dt = 1 / 60) => { for (let i = 0; i < n; i++) { clockT += dt; v.update(dt, cam(), clockT); } };
const front = (id) => M.chars[id].spine.front;
const back = (id) => M.chars[id].spine.back;
const DOWN = (t = 1) => [5, t + 60, 60, DOWN_STATE.COUNTING, 10, 5];

/** The real manifest behind the asset store's helpers; acquire resolves immediately (a cached skeleton). */
function store() {
  const refs = new Map();
  return {
    refs,
    picture: () => null,
    image: async () => null,
    hasBack: (id) => hasBackSpine(M, id),
    spineEntry: (id, o) => spineEntry(M, id, o),
    spine: {
      acquire: async (e) => ({ animations: Object.keys(e.animations || {}).map((name) => ({ name })) }),
      release: (e) => { refs.set(e.skel, (refs.get(e.skel) || 0) - 1); },
    },
  };
}

/** Every spine.update dt, tagged by the spine instance (fakepixi's Spine.update is a no-op — safe to wrap). */
function spySpineUpdates() {
  const log = [];
  const orig = fake.P.spine.Spine.prototype.update;
  fake.P.spine.Spine.prototype.update = function (dt) { log.push([this, dt]); return orig.call(this, dt); };
  return { log, restore: () => { fake.P.spine.Spine.prototype.update = orig; } };
}
const updatesOf = (log, spine) => log.filter(([sp]) => sp === spine).map(([, dt]) => dt);

describe('SpineActor.dieAt — the death clip resumed at the restored time (a rebuilt model)', () => {
  const fakeEntry = (id) => ({ ...M.chars[id].spine.front, anims: M.chars[id].spine.front.anims });
  const fakeActor = (entry) => new SpineActor({ animations: Object.keys(entry.animations).map((name) => ({ name })) }, entry);

  test('it resumes the Die clip where it would be, with no mix, and applies it at once', () => {
    const entry = fakeEntry(CAPER);
    const d = entry.animations.Die;
    const spy = spySpineUpdates();
    try {
      const a = fakeActor(entry);
      a.update(0.04);                        // the constructor's idle played a little before the rebuild
      const n = updatesOf(spy.log, a.spine).length;
      const c0 = a.clock;
      const at = Math.min(0.3, d);
      assert.equal(a.dieAt(at), d, 'returns the die clip duration, like die()');
      assert.equal(a.current, 'Die');
      assert.equal(a.mode, 'die');
      assert.equal(a.dead, true);
      assert.equal(a.spine.state.tracks[0].mixDuration, 0, 'no mix: the constructor idle is not a pose to blend through');
      const ups = updatesOf(spy.log, a.spine).slice(n);
      assert.equal(ups.length, 1, 'the resumed state is applied exactly once');
      assert.ok(Math.abs(ups[0] - at) < 1e-9, `the spine advanced to the restored time (${ups[0]} = ${at})`);
      assert.ok(Math.abs(a.clock - c0 - at) < 1e-9, "the actor's clock advanced to where the fall is");
    } finally { spy.restore(); }
  });

  test('at 0 it still applies the state once — a fresh skeleton must never sit on its setup pose (issue #177)', () => {
    const entry = fakeEntry(CAPER);
    const spy = spySpineUpdates();
    try {
      const a = fakeActor(entry);
      a.dieAt(0);
      assert.equal(a.current, 'Die');
      assert.equal(a.spine.state.tracks[0].mixDuration, 0);
      assert.deepEqual(updatesOf(spy.log, a.spine), [0], 'applied (the old replay skipped the apply when at was 0)');
    } finally { spy.restore(); }
  });

  test('a NaN or negative time is guarded to 0; past the end it holds the last pose', () => {
    const entry = fakeEntry(CAPER);
    const d = entry.animations.Die;
    const spy = spySpineUpdates();
    try {
      const a = fakeActor(entry);
      a.dieAt(NaN);
      assert.deepEqual(updatesOf(spy.log, a.spine), [0]);
      const b = fakeActor(entry);
      b.dieAt(-3);
      assert.deepEqual(updatesOf(spy.log, b.spine), [0]);
      const c = fakeActor(entry);
      c.dieAt(30);                           // 联防 / a field joined late: already down, holds the end
      assert.deepEqual(updatesOf(spy.log, c.spine), [d]);
      assert.ok(Math.abs(c.clock - d) < 1e-9);
    } finally { spy.restore(); }
  });

  test('a skeleton without a Die clip applies its held idle once (it used to stay on the setup pose)', () => {
    const spy = spySpineUpdates();
    try {
      const a = new SpineActor({ animations: [{ name: 'Idle' }, { name: 'Attack' }] }, back(CAPER));
      a.attack(1);
      assert.equal(a.dieAt(5), 0, 'no clip to time');
      assert.equal(a.current, 'Idle');
      assert.equal(a.spine.state.tracks[0].timeScale, 0, 'held still');
      assert.deepEqual(updatesOf(spy.log, a.spine), [0], 'the held idle is applied');
    } finally { spy.restore(); }
  });

  test('a live death keeps die() as it was (the mix is only dropped on the rebuild)', () => {
    const entry = fakeEntry(CAPER);
    const a = fakeActor(entry);
    a.die();
    assert.equal(a.spine.state.tracks[0].mixDuration, 0.05, 'the live transition blends, as before');
  });
});

describe('the model rebuild of a knocked-out operator (units.js _acquireSpine)', () => {
  test('the Front model that replaces the Back one resumes the fall where the death was — no setup pose, no mix', async () => {
    const s = store();
    const v = new UnitView(fakeViewCtx(fake.P, { assets: s, cam }), { id: 5, side: 'ally', kind: 'chess', defId: CAPER, spine: CAPER, tier: 1, x: 5, y: 10, maxHp: 1000, dir: 'UP' });
    await settle();                        // the Back model in
    frames(v, 2);
    assert.equal(v.actor.entry, back(CAPER));
    const spy = spySpineUpdates();
    try {
      v.setDown(DOWN(), 1);                // knocked out: the Back model holds, the swap is asked this frame
      frames(v, 1);                        // dieT = 1/60 when the cached Front model arrives
      await settle();
      assert.equal(v.actor.entry, front(CAPER), 'the Front model in place');
      assert.equal(v.actor.current, 'Die');
      assert.equal(v.actor.dead, true);
      assert.equal(v.actor.spine.state.tracks[0].mixDuration, 0, 'no mix from the fresh skeleton');
      const ups = updatesOf(spy.log, v.actor.spine);
      assert.ok(ups.length >= 1, 'the rebuilt model applied its state (it used to skip it when at was 0)');
      assert.ok(Math.abs(ups[0] - 1 / 60) < 1e-9, `the fall resumed where the death was (${ups[0]})`);
    } finally { spy.restore(); }
    v.destroy();
    await settle();
  });

  test('an instant knock-out (联防 / a field joined late) holds the end of the fall on the rebuilt model', async () => {
    const v = new UnitView(fakeViewCtx(fake.P, { assets: store(), cam }), { id: 5, side: 'ally', kind: 'chess', defId: CAPER, spine: CAPER, tier: 1, x: 5, y: 10, maxHp: 1000, dir: 'UP' });
    v.setDown(DOWN(30), 30, true);         // made for one already down: dieT = 30
    frames(v, 1);
    const spy = spySpineUpdates();
    try {
      await settle();
      assert.equal(v.actor.entry, front(CAPER));
      assert.equal(v.actor.current, 'Die');
      const d = front(CAPER).animations.Die;
      assert.deepEqual(updatesOf(spy.log, v.actor.spine), [d], 'straight to the held end');
      assert.ok(v.actor.clock >= d, "the actor's clock is past the end of the fall");
    } finally { spy.restore(); }
    v.destroy();
    await settle();
  });
});

// ---- the eye slots under the REAL pixi-spine runtime ----------------------------------------------------------------------

/** A synthetic skeleton like the report's two eye structures: an Eye slot whose open / closed attachments the clips
 *  swap (琳琅诗怀雅's O_Eye ⇄ C_Eye), and a separate Lid overlay slot hidden in the setup pose (仇白's Eyeclose),
 *  blinked by the Idle only — the Die clip closes via the Eye swap and never drives the Lid. */
function eyeSkeleton() {
  const sd = new SkeletonData();
  sd.name = 'eyes';
  const root = new BoneData(0, 'root');
  sd.bones.push(root);
  const eye = new SlotData(0, 'Eye', root); eye.attachmentName = 'O_Eye'; sd.slots.push(eye);
  const lid = new SlotData(1, 'Lid', root); lid.attachmentName = null; sd.slots.push(lid);
  const skin = new Skin('default');
  skin.setAttachment(0, 'O_Eye', { name: 'O_Eye' });
  skin.setAttachment(0, 'C_Eye', { name: 'C_Eye' });
  skin.setAttachment(1, 'Lid', { name: 'Lid' });
  sd.skins.push(skin);
  sd.defaultSkin = skin;
  const tl = (slot, f) => { const t = new AttachmentTimeline(f.length); t.slotIndex = slot; f.forEach(([time, att], i) => t.setFrame(i, time, att)); return t; };
  sd.animations.push(
    new Animation('Idle', [tl(0, [[0, 'O_Eye'], [0.1, 'C_Eye'], [0.2, 'O_Eye']]), tl(1, [[0.1, 'Lid'], [0.2, null]])], 0.21),   // a looping blink
    new Animation('Die', [tl(0, [[0, 'C_Eye']])], 0.8),   // closes at once, holds it; the eyeball never comes back
  );
  return sd;
}
const EYE_ANIMS = { anims: { idle: 'Idle', die: 'Die' }, animations: { Idle: 0.21, Die: 0.8 }, hits: {}, bounds: { height: 380 } };
const eyeOf = (skeleton) => skeleton.slots[0].attachment?.name ?? null;
const lidOf = (skeleton) => skeleton.slots[1].attachment?.name ?? null;

describe('the eye slots under the real pixi-spine runtime (@pixi-spine/runtime-3.8)', () => {
  let realSpine;
  before(() => { realSpine = fake.P.spine.Spine; fake.P.spine.Spine = Spine; });
  after(() => { fake.P.spine.Spine = realSpine; });

  test('the rebuilt pose is the clip\'s: the eye swap is closed at once, the lid hidden, at any restored time', () => {
    const data = eyeSkeleton();
    const a = new SpineActor(data, EYE_ANIMS);
    a.dieAt(0);
    assert.equal(eyeOf(a.spine.skeleton), 'C_Eye', 'the Die clip\'s frame-0 attachment — not the setup open eye');
    assert.equal(lidOf(a.spine.skeleton), null, 'the separate lid slot stays hidden (the ctor idle never dressed it)');
    const b = new SpineActor(eyeSkeleton(), EYE_ANIMS);
    b.dieAt(0.15);                         // inside where the idle's blink would be
    assert.equal(eyeOf(b.spine.skeleton), 'C_Eye');
    assert.equal(lidOf(b.spine.skeleton), null, 'no idle bleed-through without the mix');
    const c = new SpineActor(eyeSkeleton(), EYE_ANIMS);
    c.dieAt(0.9);                          // past the end: the held last pose
    assert.equal(eyeOf(c.spine.skeleton), 'C_Eye');
  });

  test('the old replay really did leave the fresh skeleton on its setup pose (open eye, no lid) until the next frame', () => {
    // the shipped sequence, exactly: ctor idle queued, die() queued, `at` was 0 so no update ran at all
    const sd = eyeSkeleton();
    const stateData = new AnimationStateData(sd);
    stateData.defaultMix = 0.12;
    const state = new AnimationState(stateData);
    const skeleton = new Skeleton(sd);
    state.setAnimation(0, 'Idle', true);
    const e = state.setAnimation(0, 'Die', false);
    e.mixDuration = 0.05;                  // SpineActor.die()'s mix — with nothing applied it changes nothing
    assert.equal(eyeOf(skeleton), 'O_Eye', 'the setup pose stands in for the death pose: the open eye of the report');
    assert.equal(lidOf(skeleton), null);
    // and dieAt(0) fixes it in one apply:
    const a = new SpineActor(eyeSkeleton(), EYE_ANIMS);
    a.dieAt(0);
    assert.equal(eyeOf(a.spine.skeleton), 'C_Eye');
    assert.equal(lidOf(a.spine.skeleton), null);
  });

  test('the death pose holds after the clip ends (the track clears; the attachments stay)', () => {
    const a = new SpineActor(eyeSkeleton(), EYE_ANIMS);
    a.dieAt(0);
    for (let i = 0; i < 120; i++) a.update(1 / 60);   // 2 s down, the clip is 0.8 s
    assert.equal(eyeOf(a.spine.skeleton), 'C_Eye', 'the closed swap is held');
    assert.equal(lidOf(a.spine.skeleton), null);
  });
});
