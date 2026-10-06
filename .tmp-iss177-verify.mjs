// Scratch verification for issue #177 — runs the REAL pixi-spine 3.8 runtime under Node with a synthetic
// skeleton carrying both eye structures from the issue, driven the way render/spine.js + render/units.js drive it.
import {
  SkeletonData, BoneData, SlotData, Skin, Skeleton, Animation, AnimationState, AnimationStateData,
  AttachmentTimeline, RegionAttachment,
} from '@pixi-spine/runtime-3.8';

// ---------- build a skeleton with both eye structures ----------
const data = new SkeletonData();
const root = new BoneData(0, 'root', null);
const head = new BoneData(1, 'head', root);
data.bones = [root, head];
const mkSlot = (i, name, attachmentName) => {
  const sd = new SlotData(i, name, head);
  sd.attachmentName = attachmentName ?? null;
  return sd;
};
// 仇白-style separate overlay slots + eyeball slots;  琳琅诗怀雅-style same-slot O_Eye ⇄ C_Eye swap
data.slots = [
  mkSlot(0, 'Eyeball', 'Eyeball'),        // setup: eyeball attached
  mkSlot(1, 'F_L_Eyeclose', null),        // setup: eyelid overlay hidden
  mkSlot(2, 'F_H_L_C_Eye', 'O_Eye'),      // setup: open eye on the shared slot
  mkSlot(3, 'F_H_L_Eyew', 'Eyewhite'),    // eye white (separate slot)
];

const skin = new Skin('default');
const att = (n) => new RegionAttachment(n, n);
skin.setAttachment(0, 'Eyeball', att('Eyeball'));
skin.setAttachment(2, 'O_Eye', att('O_Eye'));
skin.setAttachment(2, 'C_Eye', att('C_Eye'));
skin.setAttachment(3, 'Eyewhite', att('Eyewhite'));
skin.setAttachment(1, 'Eyeclose_L', att('Eyeclose_L'));
data.skins = [skin];
data.defaultSkin = skin;

const attTL = (slotIndex, keys) => {     // keys: [[time, name|null], ...]
  const t = new AttachmentTimeline(keys.length);
  t.slotIndex = slotIndex;
  t.frames = keys.map(([time]) => time);
  t.attachmentNames = keys.map(([, name]) => name);
  return t;
};

// Idle: a blink at 2.9-3.0 s — same-slot swap and the eyelid overlay on/off (issue's measured blink window)
const idle = new Animation('Idle', [
  attTL(2, [[0.0, 'O_Eye'], [2.90, 'C_Eye'], [2.95, 'C_Eye'], [3.00, 'O_Eye']]),
  attTL(1, [[0.0, null], [2.90, 'Eyeclose_L'], [2.95, 'Eyeclose_L'], [3.00, null]]),
], 4.0);
// Die: eyeball + eyewhite hidden from 0.2 s, eyelid overlay attached from 0.23 s (issue's measured Die)
const die = new Animation('Die', [
  attTL(0, [[0.0, 'Eyeball'], [0.20, null]]),
  attTL(3, [[0.0, 'Eyewhite'], [0.20, null]]),
  attTL(1, [[0.0, null], [0.23, 'Eyeclose_L']]),
], 1.0);
data.animations = [idle, die];

const newSkeleton = () => {
  const sk = new Skeleton(data);
  sk.skin = skin;
  sk.setToSetupPose();
  return sk;
};
const newState = () => {
  const sd = new AnimationStateData(data);
  sd.defaultMix = 0.12;                     // spine.js line 96
  return new AnimationState(sd);
};
const snap = (sk) => JSON.stringify({
  eyeball: sk.slots[0].attachment?.name ?? null,
  eyelid: sk.slots[1].attachment?.name ?? null,
  eye: sk.slots[2].attachment?.name ?? null,
  eyewhite: sk.slots[3].attachment?.name ?? null,
});

// ---------- path 1: the rebuild (units.js _acquireSpine dead branch) ----------
// fresh skeleton + state; constructor plays Idle (never applied); die() sets Die; ONE update(at).
console.log('== path 1: rebuild of a dead model — die() then one update(at) ==');
function rebuild(at) {
  const sk = newSkeleton();
  const st = newState();
  st.setAnimation(0, 'Idle', true);          // SpineActor constructor (never applied)
  const e = st.setAnimation(0, 'Die', false); // SpineActor.die() — replaces the never-applied entry
  e.mixDuration = 0.05;
  st.update(at); st.apply(sk);               // one SpineActor.update(at)
  return snap(sk);
}
for (const at of [0.1, 0.22, 0.3, 0.5, 1.0, 30]) console.log('  at=' + at, rebuild(at));

// ---------- path 2: live die(true) — idle for a while (maybe mid-blink), die(), one update(30) ----------
console.log('== path 2: live die(true): idle t, then die() + update(30) in one jump ==');
function liveDie(idleTime) {
  const sk = newSkeleton();
  const st = newState();
  st.setAnimation(0, 'Idle', true);
  st.update(idleTime); st.apply(sk);
  const e = st.setAnimation(0, 'Die', false);
  e.mixDuration = 0.05;
  st.update(30); st.apply(sk);
  return snap(sk);
}
for (const t of [0.5, 2.92, 2.95, 3.2]) console.log('  idle ' + t + 's ->', liveDie(t));

// ---------- path 3: live die played frame by frame (reference, expected good) ----------
console.log('== path 3: reference — live die advancing frame by frame (1/60) ==');
{
  const sk = newSkeleton();
  const st = newState();
  st.setAnimation(0, 'Idle', true);
  st.update(2.95); st.apply(sk);
  const e = st.setAnimation(0, 'Die', false);
  e.mixDuration = 0.05;
  for (const at of [0.1, 0.22, 0.3, 0.5]) {
    st.update(1 / 60); st.apply(sk);
    if (Math.abs(st.tracks[0].trackTime - at) < 1 / 60) console.log('  ~' + at + 's', snap(sk));
  }
  for (let i = 0; i < 130; i++) { st.update(1 / 60); st.apply(sk); }
  console.log('  held end:', snap(sk));
}

// ---------- path 4: a living model rebuilt MID-BLINK (setDir swap / late load), then frames ----------
console.log('== path 4: living model rebuilt mid-blink: new skeleton+state, idle from 0 ==');
function livingRebuild() {
  const sk = newSkeleton();
  const st = newState();
  st.setAnimation(0, 'Idle', true);
  st.update(1 / 60); st.apply(sk);
  return snap(sk);
}
console.log('  after 1 frame:', livingRebuild());

// ---------- path 5: idle re-play mid-blink with mix (setBase re-play / attack end) ----------
console.log('== path 5: idle re-played over itself mid-blink (mix 0.15), advancing frames ==');
{
  const sk = newSkeleton();
  const st = newState();
  st.setAnimation(0, 'Idle', true);
  st.update(2.95); st.apply(sk);
  console.log('  mid-blink:', snap(sk));
  const e = st.setAnimation(0, 'Idle', true);
  e.mixDuration = 0.15;
  for (let i = 0; i < 12; i++) { st.update(1 / 60); st.apply(sk); }
  console.log('  after 0.2s:', snap(sk));
}

// ---------- path 6: die() while idle is MID-BLINK, then frame-by-frame (live fall, mix 0.05) ----------
console.log('== path 6: live die() from mid-blink, frame by frame ==');
{
  const sk = newSkeleton();
  const st = newState();
  st.setAnimation(0, 'Idle', true);
  st.update(2.95); st.apply(sk);
  const e = st.setAnimation(0, 'Die', false);
  e.mixDuration = 0.05;
  for (let i = 0; i < 8; i++) { st.update(1 / 60); st.apply(sk); }
  console.log('  ~0.13s:', snap(sk));
  for (let i = 0; i < 10; i++) { st.update(1 / 60); st.apply(sk); }
  console.log('  ~0.3s:', snap(sk));
  for (let i = 0; i < 200; i++) { st.update(1 / 60); st.apply(sk); }
  console.log('  held end:', snap(sk));
}
