// test/render/aura-ring.test.js — 敌方增益光环无人机的范围外圈（render/units.js AURA_RING）对 headless fake PIXI：
// 御4（enemy_1017_defdrn，半径读 bb 的 defup.range_radius）与 护障 / 护障·P（enemy_1355_mrfly/_2，半径读
// stats.rangeRadius）在脚下地面上画一圈蓝色描边（外接圆轮廓，非填充），取值链与 sim kit 一致（回退 2.5）；
// 其他敌人——包括 stats.rangeRadius 是攻击距离的远程飞行敌人（暴鸰）——、笔中预览敌人、阵亡后不画。
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';

let fake, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const cam = () => presetCamera('normal', { width: 1280, height: 720 });

/** lookupDef 的敌人记录桩：与 data/enemies.json 的真实形状一致（stats.rangeRadius / talents.bb）。 */
const RECORDS = {
  enemy_1017_defdrn: { stats: { rangeRadius: 2.5 }, talents: { bb: { 'defup.def': 300, 'defup.range_radius': 2.5 } } },
  enemy_1355_mrfly: { stats: { rangeRadius: 2.5 }, talents: { bb: { 'magdef_add.magic_resistance': 30 } } },
  enemy_1355_mrfly_2: { stats: { rangeRadius: 2.5 }, talents: { bb: { 'magdef_add.magic_resistance': 30 } } },
  enemy_1040_bombd: { stats: { rangeRadius: 2 }, talents: { bb: {} } },   // 暴鸰：远程飞行敌人，rangeRadius 是攻击距离
};

function ctxFor(over = {}) {
  return fakeViewCtx(fake.P, { cam, lookupDef: (info) => RECORDS[info.defId] ?? null, ...over });
}

const view = (info, ctxOver) => new UnitView(
  ctxFor(ctxOver),
  { id: 1, side: 'enemy', kind: 'enemy', defId: 'enemy_1017_defdrn', x: 5, y: 10, maxHp: 1000, motion: 'FLY', ...info },
);

describe('光环无人机的外圈（御4 / 护障）', () => {
  test('御4：半径取 bb 的 defup.range_radius（2.5），脚下 groundFx 里建 Graphics', () => {
    const v = view({});
    assert.equal(v.auraRange, 2.5);
    assert.equal(v.auraRing, null);                 // 惰性：首次 update 才建
    v.update(1 / 60, cam(), 0);
    assert.ok(v.auraRing, 'ring built on first update');
    assert.equal(v.auraRing.parent, v.ctx.layers.groundFx);
    assert.ok(v.auraRing.visible);
    assert.ok(v.auraRing.alpha > 0);
  });

  test('护障 / 护障·P：半径取 stats.rangeRadius（bb 无半径键）', () => {
    const a = view({ defId: 'enemy_1355_mrfly' });
    const b = view({ defId: 'enemy_1355_mrfly_2' });
    assert.equal(a.auraRange, 2.5);
    assert.equal(b.auraRange, 2.5);
    a.update(1 / 60, cam(), 0);
    b.update(1 / 60, cam(), 0);
    assert.ok(a.auraRing.visible && b.auraRing.visible);
  });

  test('取值链与 sim kit 同源：御4 只认 bb、护障只认 stats.rangeRadius，缺键回退 2.5', () => {
    // 御4：bb 缺半径键 → sim 回退 2.5（stats.rangeRadius 不是它的来源）
    const d = view({}, { lookupDef: () => ({ stats: { rangeRadius: 9 }, talents: { bb: { 'defup.def': 300 } } }) });
    assert.equal(d.auraRange, 2.5);
    // 御4：bb 给了别的半径 → 跟随 bb
    const d3 = view({}, { lookupDef: () => ({ stats: { rangeRadius: 9 }, talents: { bb: { 'defup.range_radius': 3 } } }) });
    assert.equal(d3.auraRange, 3);
    // 护障：stats.rangeRadius 是唯一来源（bb 里即使写了半径键也不认）
    const m = view({ defId: 'enemy_1355_mrfly' }, { lookupDef: () => ({ stats: { rangeRadius: 3 }, talents: { bb: { 'defup.range_radius': 9 } } }) });
    assert.equal(m.auraRange, 3);
    // 护障：stats 缺 / 为 0 → 回退 2.5
    const m0 = view({ defId: 'enemy_1355_mrfly_2' }, { lookupDef: () => ({ stats: { rangeRadius: 0 }, talents: { bb: {} } }) });
    assert.equal(m0.auraRange, 2.5);
  });

  test('非光环敌人不画：远程飞行敌人（暴鸰）的 rangeRadius 是攻击距离', () => {
    const v = view({ defId: 'enemy_1040_bombd' });
    assert.equal(v.auraRange, 0);
    v.update(1 / 60, cam(), 0);
    assert.equal(v.auraRing, null);
    // groundFx 里只有既有资源（阻挡图标等 Sprite），没有任何新建 Graphics（外圈是唯一的 Graphics 落点）
    assert.equal(v.ctx.layers.groundFx.children.filter((ch) => ch.geometry).length, 0);
  });

  test('笔中预览敌人（preview）不画', () => {
    const v = view({ preview: true });
    assert.equal(v.auraRange, 0);
    v.update(1 / 60, cam(), 0);
    assert.equal(v.auraRing, null);
  });

  test('阵亡后外圈隐藏（光环服务端同样随死亡消失）', () => {
    const v = view({});
    v.update(1 / 60, cam(), 0);
    assert.ok(v.auraRing.visible);
    v.die();
    v.update(1 / 60, cam(), 0.1);
    assert.equal(v.auraRing.visible, false);
  });

  test('外圈随位置重画，投影半径 ≈ 2.5 格（外接圆轮廓）', () => {
    const v = view({});
    v.update(1 / 60, cam(), 0);
    let drawn = null;
    const orig = v.auraRing.drawPolygon.bind(v.auraRing);
    v.auraRing.drawPolygon = (pts) => { drawn = pts; orig(pts); };
    v.x = 6;                                        // 位置变化 → 下帧重画
    v.update(1 / 60, cam(), 1 / 60);
    assert.ok(Array.isArray(drawn) && drawn.length === 72, '36 段外接圆轮廓');
    // 每个落点都应落在世界半径 2.5 格的圆的投影上（720 点密采样参照；与 36 段绘制的弦差 ≈ 1 px，
    // 容差 2.5 px——半径或圆心错了会整体偏离参照）
    const C = cam(), ref = { x: 0, y: 0, s: 0, depth: 0 };
    const refs = [];
    for (let k = 0; k < 720; k++) {
      const a = (k / 720) * Math.PI * 2;
      C.project(6 + Math.cos(a) * 2.5, 10 + Math.sin(a) * 2.5, 0.01, ref);
      refs.push([ref.x, ref.y]);
    }
    for (let k = 0; k < drawn.length; k += 2) {
      let off = Infinity;
      for (const [rx, ry] of refs) off = Math.min(off, Math.hypot(drawn[k] - rx, drawn[k + 1] - ry));
      assert.ok(off < 2.5, `ring point ${k / 2} on the projected r=2.5 circle (off ${off.toFixed(2)} px)`);
    }
  });

  test('高台上的外圈归入该行的 surface 层（placeOnGround，同阴影 / 地面楔形）', () => {
    const surf = new fake.P.Container();
    const v = view({}, { surfaceLayer: () => surf });
    v.z = 0.5;                                      // > RAISED_Z (0.12)
    v.update(1 / 60, cam(), 0);
    assert.equal(v.auraRing.parent, surf);
  });
});
