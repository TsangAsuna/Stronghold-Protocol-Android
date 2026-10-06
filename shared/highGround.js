// shared/highGround.js — which MELEE chess may stand on a 高台 (a ranged deploy tile).
//
// Data-driven (GitHub #153 / #195): a variant whose own branch trait says 「可以放置于远程位」 deploys
// on a ranged tile — 崖心, 见行者, 歌蕾蒂娅, normal and golden records alike (merging preserves the
// trait). The 2026-10-04 whitelist (elite 歌蕾蒂娅 with module HOK-Y only) fought the trait text on
// every 钩索师 / 推击手 variant and is gone; a record without the text stays ground-only.

/**
 * @param {object|null} rec a chess record (normal or golden); the branch trait lives on `rec.trait.desc`
 * @param {string|null|undefined} [moduleId] unused since the data-driven rule (kept for call compatibility)
 * @returns {boolean}
 */
export function meleeOnHighGround(rec, moduleId) {
  return !!(rec && typeof rec.trait?.desc === 'string' && rec.trait.desc.includes('可以放置于远程位'));
}

/** char_474_glady — 歌蕾蒂娅. */
export const GLADIIA_CHAR_ID = 'char_474_glady';
/** HOK-Y 淡金坠饰 (data/chess.json chess_char_4_12_b.modules, typeName HOK-Y). */
export const GLADIIA_HOK_Y = 'uniequip_003_glady';
