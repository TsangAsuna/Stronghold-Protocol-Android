// Unit tests of the client data module's language overlay (public/js/data.js): with the default language
// the accessors return the zh records untouched (byte-identical to the pre-i18n behaviour); with `lang: 'en'`
// they return a view whose name / trait.desc / skills[].desc / desc come from the data-en overlay
// (tools/build-data-en.mjs output shape) when present, staying zh otherwise; 'ja' (no overlay) falls back zh.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createDataStore, applyTextOverlay } from '../../public/js/data.js';

// --- fixtures: tiny zh data + the EN overlay files (the store's fetch is injected) ------------------

const ZH = {
  chess: {
    c1: {
      chessId: 'c1', name: '干员甲',
      trait: { desc: '特性甲', descRaw: '特性甲R', bb: {} },
      skill: { skillId: 's1', index: 0, name: '技能一', desc: '描述一', descRaw: '描述一R' },
      skills: [
        { skillId: 's1', index: 0, name: '技能一', desc: '描述一', descRaw: '描述一R' },
        { skillId: 's2', index: 1, name: '技能二', desc: '描述二', descRaw: '描述二R' },
      ],
    },
    c2: { chessId: 'c2', name: '干员乙', trait: { desc: '特性乙', descRaw: '特性乙R', bb: {} }, skill: null, skills: [] },
  },
  bonds: { b1: { bondId: 'b1', name: '盟约一', desc: '盟约描述', descRaw: '盟约描述R' } },
  items: { i1: { id: 'i1', name: '道具一', desc: '道具描述', descRaw: '道具描述R' } },
  enemies: { e1: { key: 'e1', name: '敌一', desc: '敌描述', descRaw: '敌描述R' } },
};

const EN = {
  chess: {
    c1: {
      nameEn: 'Op A',
      descEn: {
        trait: { desc: 'Trait A', descRaw: 'Trait A R' },
        // one entry per rec.skills element, same order; {} = no EN text for that entry → zh stays
        skills: [
          { name: 'Skill One', desc: 'Desc One', descRaw: 'Desc One R' },
          {},
        ],
      },
    },
  },
  enemies: { e1: { nameEn: 'Enemy One', descEn: { desc: 'Enemy desc', descRaw: 'Enemy desc R' } } },
  // bonds / items: no overlay yet (no EN source) → the client keeps the zh texts
  bonds: {},
  items: {},
};

/** A store whose fetch serves the fixtures: /data/*.json and the overlay /data-en/*.json. */
function makeStore({ serveOverlay = true } = {}) {
  const urls = [];
  const doFetch = async (url) => {
    urls.push(String(url));
    const file = /\/data-en\/([a-z]+)\.json$/.exec(String(url));
    if (file) {
      if (!serveOverlay) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => EN[file[1]] };
    }
    const base = /\/data\/([a-z]+)\.json$/.exec(String(url));
    if (base && ZH[base[1]]) return { ok: true, status: 200, json: async () => ZH[base[1]] };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const store = createDataStore({ fetch: doFetch, retryDelays: [] });
  return { store, urls };
}

describe('data language overlay', () => {
  test('default (zh): the accessors return the loaded records untouched', async () => {
    const { store } = makeStore();
    await store.load('chess');
    await store.load('enemies');
    assert.equal(store.lang, 'zh');
    assert.equal(store.lookup('chess', 'c1'), ZH.chess.c1, 'the very record object, not a copy');
    assert.equal(store.lookup('chess', 'c1').name, '干员甲');
    assert.equal(store.lookup('enemies', 'e1').name, '敌一');
    assert.equal(store.lookup('chess', 'missing'), null);
  });

  test('en: name / trait.desc / skills[].desc / desc come from the overlay, zh where it has no entry', async () => {
    const { store, urls } = makeStore();
    await Promise.all(Object.keys(ZH).map((n) => store.load(n)));
    store.setLang('en');
    assert.equal(store.lang, 'en');
    await Promise.all(['chessEn', 'bondsEn', 'itemsEn', 'enemiesEn'].map((n) => store.load(n)));
    assert.ok(urls.some((u) => /\/data\/\.\.\/data-en\/chess\.json$/.test(u)), 'the overlay is fetched beside /data/');

    const c1 = store.lookup('chess', 'c1');
    assert.equal(c1.name, 'Op A');
    assert.equal(c1.trait.desc, 'Trait A');
    assert.equal(c1.trait.descRaw, 'Trait A R');
    assert.equal(c1.skills[0].name, 'Skill One');
    assert.equal(c1.skills[0].desc, 'Desc One');
    assert.equal(c1.skills[0].descRaw, 'Desc One R');
    assert.equal(c1.skill.name, 'Skill One', 'the default skill mirrors its entry in skills[]');
    assert.equal(c1.skill.desc, 'Desc One');
    assert.equal(c1.skills[1].name, '技能二', 'an overlay entry without texts keeps the zh skill');
    assert.equal(c1.skills[1].desc, '描述二');
    assert.equal(c1.trait.bb, ZH.chess.c1.trait.bb, 'language-neutral fields pass through');
    assert.equal(c1.chessId, 'c1');

    assert.equal(store.lookup('chess', 'c2'), ZH.chess.c2, 'no overlay record → the untouched zh record');
    const e1 = store.lookup('enemies', 'e1');
    assert.equal(e1.name, 'Enemy One');
    assert.equal(e1.desc, 'Enemy desc');
    assert.equal(e1.descRaw, 'Enemy desc R');
    assert.equal(store.lookup('bonds', 'b1').name, '盟约一', 'bonds have no overlay yet — zh stays');
    assert.equal(store.lookup('bonds', 'b1'), ZH.bonds.b1);
    assert.equal(store.lookup('items', 'i1').desc, '道具描述', 'items have no overlay yet — zh stays');
  });

  test('en: the accessors never mutate the zh records or the overlay', async () => {
    const { store } = makeStore();
    await Promise.all(Object.keys(ZH).map((n) => store.load(n)));
    store.setLang('en');
    await store.load('chessEn');
    store.lookup('chess', 'c1');
    assert.equal(ZH.chess.c1.name, '干员甲');
    assert.equal(ZH.chess.c1.trait.desc, '特性甲');
    assert.equal(ZH.chess.c1.skills[0].name, '技能一');
    assert.equal(ZH.chess.c1.skill.name, '技能一');
    assert.equal(EN.chess.c1.descEn.skills[0].name, 'Skill One');
  });

  test('ja (no overlay table yet) and back to zh: the records stay / return untouched', async () => {
    const { store, urls } = makeStore();
    await store.load('chess');
    store.setLang('ja'); // TODO(ja): falls back to zh, nothing is fetched
    assert.equal(store.lang, 'ja');
    assert.equal(store.lookup('chess', 'c1'), ZH.chess.c1);
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(!urls.some((u) => u.includes('data-en')), 'no overlay is fetched for ja');
    store.setLang('en');
    await store.load('chessEn');
    assert.equal(store.lookup('chess', 'c1').name, 'Op A');
    store.setLang('zh');
    assert.equal(store.lookup('chess', 'c1'), ZH.chess.c1, 'back to zh: the untouched records again');
  });

  test('setLang re-notifies loaded files so useData consumers re-render', async () => {
    const { store } = makeStore();
    await store.load('chess');
    const seen = [];
    const unsub = store.subscribe((n) => seen.push(n));
    store.setLang('en');
    await store.load('chessEn');
    await store.load('chessEn'); // idempotent
    assert.ok(seen.includes('chess'), 'the loaded file is re-notified');
    assert.ok(seen.includes('chessEn'), 'the overlay file announces itself');
    unsub();
  });

  test('a missing overlay file (404) degrades to the zh texts', async () => {
    const { store } = makeStore({ serveOverlay: false });
    await store.load('chess');
    store.setLang('en');
    await store.load('chessEn');
    assert.equal(store.status('chessEn'), 'missing');
    assert.equal(store.lookup('chess', 'c1'), ZH.chess.c1, 'the zh record stays');
  });

  test('applyTextOverlay: pure merge, shape contract, and pass-through for empty input', () => {
    const rec = ZH.chess.c1;
    const view = applyTextOverlay(rec, EN.chess.c1);
    assert.equal(view.name, 'Op A');
    assert.equal(view.skill.desc, 'Desc One');
    assert.notEqual(view, rec);
    assert.equal(applyTextOverlay(rec, null), rec, 'no overlay record → the same record');
    assert.equal(applyTextOverlay(rec, undefined), rec);
    assert.equal(applyTextOverlay(null, EN.chess.c1), null);
    // bonds / items / enemies shape: a plain { desc, descRaw } pair
    const enemy = applyTextOverlay(ZH.enemies.e1, EN.enemies.e1);
    assert.equal(enemy.name, 'Enemy One');
    assert.equal(enemy.desc, 'Enemy desc');
    assert.equal(enemy.descRaw, 'Enemy desc R');
    // an overlay with only a name leaves the descriptions alone
    const nameOnly = applyTextOverlay(ZH.enemies.e1, { nameEn: 'Only Name' });
    assert.equal(nameOnly.name, 'Only Name');
    assert.equal(nameOnly.desc, '敌描述');
  });
});
