// test/match/issue212-shop-packaging-unique.test.js — GitHub #212: a 机密商店 offer set held two 商业包装方案.
// The uniqueness rule (server/match/choices.js ONE_PER_SHOP_SET): one 商业包装方案 per offer set — in the R11 draft
// (choices.json `shopDraft`) and the early 标准 / 险境 shops — while the officially repeated cards keep their repeats
// (盟约之币 ×2, 变形同构体 ×2; the user, 2026-10-03: "机密商店按官方改成可以重复吧"). The 调度中心 has a single item
// slot (gamedata shopSlots), so a draft set is the only place one offer can hold two.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from './harness.js';
import { GameData } from '../../server/match/gamedata.js';
import { generateDraft } from '../../server/match/choices.js';
import { createRng } from '../../server/sim/rng.js';

const PACK = 'chess_item_5_07_e_a'; // 商业包装方案
const COIN = DATA.choices.shopDraft.coin;
const count = (list, pred) => list.filter(pred).length;

test('#212 机密商店 R11 (co-op 绝境): no offer set holds two 商业包装方案; the official repeats survive', () => {
  const gd = new GameData(DATA, 'mode_multi_hard');
  let shops = 0;
  let pack2 = 0;
  let packOffered = 0;
  let coins2 = 0;
  let dupItem = 0;
  for (let seed = 1; shops < 2000 && seed < 20000; seed++) {
    const d = generateDraft(gd, createRng(seed * 104729 + 7), 11, { stageId: 'act2autochess_m01' });
    if (d.family !== 'shop') continue;
    shops++;
    const ids = d.cards.map((c) => c.id);
    assert.ok(count(ids, (id) => id === PACK) <= 1, `seed ${seed}: two 商业包装方案 in one set`);
    if (ids.includes(PACK)) packOffered++;
    if (count(ids, (id) => id === PACK) >= 2) pack2++;
    if (count(ids, (id) => id === COIN) >= 2) coins2++;
    const others = ids.filter((id) => id !== COIN && id !== PACK);
    if (new Set(others).size < others.length) dupItem++;
  }
  assert.equal(shops, 2000);
  assert.equal(pack2, 0, 'no 商业包装方案 twice in a set');
  assert.ok(packOffered > 100, `商业包装方案 still offered (${packOffered} of ${shops} sets)`);
  assert.ok(coins2 / shops > 0.2, `盟约之币 ×2 still happens (${(100 * coins2 / shops).toFixed(0)} %)`);
  assert.ok(dupItem / shops > 0.03, `another item still repeats (${(100 * dupItem / shops).toFixed(0)} %)`);
});

test('#212 机密商店 outside R11 (标准 R3, no screenshot): the fallback draw keeps one 商业包装方案 per set too', () => {
  const gd = new GameData(DATA, 'mode_multi_funny');
  let shops = 0;
  let pack2 = 0;
  for (let seed = 1; shops < 300 && seed < 40000; seed++) {
    const d = generateDraft(gd, createRng(seed * 7717 + 3), 3, { stageId: 'act2autochess_m01' });
    if (d.family !== 'shop') continue;
    shops++;
    const ids = d.cards.map((c) => c.id);
    assert.ok(count(ids, (id) => id === PACK) <= 1, `seed ${seed}: two 商业包装方案 in one set`);
    if (count(ids, (id) => id === PACK) >= 2) pack2++;
  }
  assert.equal(shops, 300);
  assert.equal(pack2, 0);
});
