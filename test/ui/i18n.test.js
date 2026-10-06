// Unit tests of the client i18n module (public/js/i18n.js): t() over the plain zh/en tables — the zh table
// holds the pre-i18n chrome literals verbatim (the default UI is unchanged), the en table translates the same
// keys, and lookups fall back en → zh → the key itself.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { t, setLang, getLang, TABLES } from '../../public/js/i18n.js';
import { zh } from '../../public/js/i18n/zh.js';
import { en } from '../../public/js/i18n/en.js';

describe('i18n', () => {
  test('defaults to zh and returns the pre-i18n literals verbatim', () => {
    assert.equal(getLang(), 'zh');
    assert.equal(t('ready'), '准备就绪');
    assert.equal(t('meleeGroundOnly'), '近战单位只能部署在地面');
    assert.equal(t('cannotBuy'), '无法购买');
    assert.equal(t('capsulePrep'), '休息一下');
    assert.equal(t('remainingUnits'), '剩余可放置角色：');
  });

  test('en table translates; an en-missing key falls back to zh; a key missing everywhere returns the key', () => {
    setLang('en');
    assert.equal(t('ready'), 'Ready');
    assert.equal(t('meleeGroundOnly'), 'Melee units can only be deployed on the ground');
    assert.equal(t('returnSelf'), 'Back to me');
    // fallback zh → key with a key that exists in neither table
    assert.equal(t('no.such.key'), 'no.such.key', 'an unknown key renders as the key itself');
    // fallback en → zh: drop a key from the en table (restored so later tests keep the full table)
    const lost = en.retreat;
    try {
      delete en.retreat;
      assert.equal(t('retreat'), '撤退', 'a key missing in the active table falls back to the zh value');
    } finally {
      en.retreat = lost;
    }
    setLang('zh');
  });

  test('setLang ignores unknown values (and `ja` — no ja table yet — stays on the zh fallback)', () => {
    setLang('fr');
    assert.equal(getLang(), 'zh');
    setLang('ja'); // TODO(ja) in public/js/i18n.js: falls back to zh, no fabricated Japanese
    assert.equal(getLang(), 'zh');
    assert.equal(t('ready'), '准备就绪');
    setLang('zh');
  });

  test('the tables share one key set, and the zh values are the shipped literals (default UI unchanged)', () => {
    assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort(), 'every zh key is translated and every en key exists');
    assert.equal(zh.ready, '准备就绪');
    assert.equal(zh.freeze, '冻结');
    assert.equal(zh.refresh, '刷新');
    assert.equal(zh.collapse, '收起');
    assert.equal(zh.upgrade, '升级');
    assert.equal(zh.emote, '交流');
    assert.equal(zh.retreat, '撤退');
    assert.equal(zh.sell, '出售');
    assert.equal(zh.confirmBuy, '确认购买');
    assert.equal(zh.readyDone, '已就绪');
    assert.equal(zh.noFunds, '资金不足');
    assert.equal(zh.benchFull, '整备区已满');
    assert.equal(zh.boardFull, '已达到部署上限');
    assert.equal(zh.badDeployTile, '无法部署在该位置');
    assert.equal(zh.shopMaxLevel, '调度中心已达最高等级');
    assert.equal(zh.readyUndoFirst, '已准备就绪，取消准备后才能操作');
    // TABLES is the same pair of objects the t() lookup reads
    assert.equal(TABLES.zh, zh);
    assert.equal(TABLES.en, en);
  });
});
