// Client i18n: `t(key)` over plain module tables — no framework (DESIGN constraint: the client is ES2022
// vanilla modules). The zh table (i18n/zh.js) holds the pre-i18n literals verbatim, so `t()` is the
// identity on the default language; en.js translates the same keys; a key missing in the selected table
// falls back to zh, a key missing everywhere returns the key itself.
//
// The language comes from the player settings (settings.js `lang`, default zh — the same store that
// persists the voice dub language). settings.js calls `setLang()` on store init and on every change;
// the data texts flip separately through public/js/data.js `setLang` (the data-en overlay).
//
// TODO(ja): Japanese has no table yet — `ja` is accepted by the settings sanitize but falls back to zh
// here and in data.js. Do NOT machine-translate the tables; a native ja table should be authored when
// the season ships on the ja_JP client.

import { zh } from './i18n/zh.js';
import { en } from './i18n/en.js';

/** The shipped tables. A language without one ('ja' for now) resolves through the zh fallback. */
export const TABLES = Object.freeze({ zh, en });

let lang = 'zh';

/**
 * Switch the UI language (no-op for unknown values; 'ja' currently falls back to zh — see TODO above).
 * @param {string|undefined} next settings `lang` value
 */
export function setLang(next) {
  lang = TABLES[next] ? next : 'zh';
}

/** The active language ('zh' until setLang is called). */
export function getLang() {
  return lang;
}

/**
 * The UI string for `key` in the active language: the table entry, else the zh entry, else the key.
 * @param {string} key
 * @returns {string}
 */
export function t(key) {
  const v = TABLES[lang]?.[key];
  if (typeof v === 'string') return v;
  const z = zh[key];
  return typeof z === 'string' ? z : String(key);
}
