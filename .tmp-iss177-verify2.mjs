// Scratch: load the REAL qiubai front skeleton (.skel 3.8) and inspect eye slots + Die/Idle attachment timelines.
import { readFileSync } from 'node:fs';
import { AttachmentType } from '@pixi-spine/base';
import {
  SkeletonBinary, RegionAttachment, MeshAttachment,
} from '@pixi-spine/runtime-3.8';

/** Stub attachment loader: every attachment name resolves to a named placeholder (no atlas needed). */
class StubLoader {
  newRegionAttachment(skin, name, path) { const a = new RegionAttachment(name, path ?? name); a.type = AttachmentType.Region; return a; }
  newMeshAttachment(skin, name, path) { const m = new MeshAttachment(name, path ?? name); m.type = AttachmentType.Mesh; return m; }
  newBoundingBoxAttachment(skin, name) { return { name, type: 3 }; }
  newPathAttachment(skin, name) { return { name, type: 4 }; }
  newPointAttachment(skin, name) { return { name, type: 5 }; }
  newClippingAttachment(skin, name) { return { name, type: 6 }; }
}

const load = (p) => {
  const bin = new SkeletonBinary(new StubLoader());
  bin.scale = 1;
  return bin.readSkeletonData(readFileSync(p));
};

const data = load('public/assets/spine/op/char_4082_qiubai/front/char_4082_qiubai.skel');
console.log('== qiubai front ==');
console.log('slots with Eye/Eyeclose/Eyew/Eyelash:');
for (const s of data.slots) {
  if (/eye|Eyeclose|Eyew|Eyelash|Eye/i.test(s.name)) console.log('  slot', s.index, s.name, 'setup=', JSON.stringify(s.attachmentName));
}
console.log('skins:', data.skins.map((s) => s.name));
const anim = (n) => data.animations.find((a) => a.name === n);
for (const name of ['Die', 'Idle']) {
  const a = anim(name);
  console.log(`-- ${name} (${a.duration}s) attachment timelines on eye slots:`);
  for (const tl of a.timelines) {
    const si = tl.slotIndex;
    if (si == null || tl.attachmentNames == null) continue;
    const slot = data.slots[si];
    if (!/eye/i.test(slot.name)) continue;
    const frames = tl.frames;
    const keys = frames.map((t, i) => `${t.toFixed(2)}:${JSON.stringify(tl.attachmentNames[i])}`).join(' ');
    console.log(`  slot ${si} ${slot.name}: ${keys}`);
  }
}
