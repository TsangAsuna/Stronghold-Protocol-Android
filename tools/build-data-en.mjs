#!/usr/bin/env node
// tools/build-data-en.mjs — EN TEXT OVERLAY BUILD (multi-language support).
//
// Reads the generated zh data (data/chess.json, data/bonds.json, data/items.json, data/enemies.json) and joins it
// with the official en_US client tables (Kengxxiao/ArknightsGameData_YoStar, the mirror of the zh pipeline's
// Kengxxiao/ArknightsGameData) to emit compact per-id text overlays into data-en/:
//   chess.json   { [chessId]: { nameEn, descEn: { trait: { desc, descRaw }, skills: [{ name, desc, descRaw }] } } }
//   enemies.json { [enemyKey]: { nameEn, descEn: { desc, descRaw } } }
//   bonds.json / items.json — currently empty maps: the YoStar en_US client has not shipped the act2autochess season
//                (its activity_table only carries the older AUTOCHESS_VERIFY1 data, whose ids reuse the season's
//                namespace with different content, and its character_table has no trap records), so no trustworthy EN
//                bond / item text exists yet. The client falls back to the zh texts for them (public/js/data.js).
//
// The overlay is a data-side translation layer ONLY: the main pipeline (tools/build-data.mjs, data/*.json) is not
// touched, every numeric / structural field stays zh-built, and the client merges the two at runtime
// (public/js/data.js applyTextOverlay), falling back to zh wherever an overlay record or field is missing.
//
// Usage:  node tools/build-data-en.mjs [--refresh | --offline] [--out <dir>] [--cache <dir>] [--data <dir>] [--quiet]
//   --refresh  re-download every EN file even if cached
//   --offline  never download; fail when a file is missing from the cache
//   --out      output directory (default: <repo>/data-en)
//   --cache    EN gamedata cache (default: <repo>/.cache/gamedata-en; mirrors en_US/gamedata paths)
//   --data     the zh build output to translate (default: <repo>/data)
//   --quiet    no progress output; the report (.cache/build-data-en-report.json) still lists the counts
// Determinism: keys are emitted sorted, no timestamps; the output depends only on the input files.

import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GAMEDATA_URL = 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData_YoStar/main/en_US/gamedata/';
const USAGE = 'usage: node tools/build-data-en.mjs [--refresh | --offline] [--out <dir>] [--cache <dir>] [--data <dir>] [--quiet]';

// ===== CLI & IO ==================================================================================

function parseArgs(argv) {
  const opts = { refresh: false, offline: false, quiet: false, out: join(ROOT, 'data-en'), cache: join(ROOT, '.cache', 'gamedata-en'), data: join(ROOT, 'data') };
  const flags = { '--refresh': 'refresh', '--offline': 'offline', '--quiet': 'quiet' };
  const dirs = { '--out': 'out', '--cache': 'cache', '--data': 'data' };
  for (let i = 0; i < argv.length; i++) {
    const [name, inline] = argv[i].includes('=') ? [argv[i].slice(0, argv[i].indexOf('=')), argv[i].slice(argv[i].indexOf('=') + 1)] : [argv[i], null];
    if (name === '--help' || name === '-h') { console.log(USAGE); process.exit(0); }
    if (flags[name] && inline === null) { opts[flags[name]] = true; continue; }
    if (dirs[name]) {
      const v = inline ?? argv[++i];
      if (!v || v.startsWith('--')) throw new Error(`${name} needs a path argument\n${USAGE}`);
      opts[dirs[name]] = resolve(v);
      continue;
    }
    throw new Error(`unknown option ${argv[i]}\n${USAGE}`);
  }
  if (opts.refresh && opts.offline) throw new Error(`--refresh and --offline are mutually exclusive\n${USAGE}`);
  return opts;
}

let OPTS;
try {
  OPTS = parseArgs(process.argv.slice(2));
} catch (e) {
  console.error(`build-data-en: ${e.message}`);
  process.exit(2);
}
const log = (...a) => { if (!OPTS.quiet) console.log(...a); };
const warnings = [];
const warn = (msg) => { if (!warnings.includes(msg)) warnings.push(msg); };

/** Make sure an EN gamedata file exists in the cache (download when missing); returns its absolute path. */
async function ensureGamedata(rel) {
  const abs = join(OPTS.cache, rel);
  if (!OPTS.refresh && existsSync(abs)) return abs;
  if (OPTS.offline) {
    if (existsSync(abs)) return abs;
    throw new Error(`missing cached file ${rel} (offline mode)`);
  }
  await mkdir(dirname(abs), { recursive: true });
  const url = GAMEDATA_URL + rel;
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      log(`  download ${rel}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
      const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const text = await res.text();
      JSON.parse(text); // refuse to cache a truncated / invalid file
      const tmp = `${abs}.tmp-${process.pid}`;
      await writeFile(tmp, text);
      await rename(tmp, abs);
      return abs;
    } catch (e) {
      lastErr = e;
      if (attempt < 4) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  if (existsSync(abs)) { warn(`download failed for ${rel}, using stale cache: ${lastErr.message}`); return abs; }
  throw new Error(`cannot obtain ${rel}: ${lastErr && lastErr.message}`);
}

const jsonCache = new Map();
async function loadGamedata(rel) {
  if (jsonCache.has(rel)) return jsonCache.get(rel);
  const abs = await ensureGamedata(rel);
  const obj = JSON.parse(await readFile(abs, 'utf8'));
  jsonCache.set(rel, obj);
  return obj;
}

const loadZh = async (name) => JSON.parse(await readFile(join(OPTS.data, `${name}.json`), 'utf8'));

// ===== text helpers (the subset of tools/build-data.mjs the overlay texts need) ==================

const unescapeNewlines = (s) => (typeof s === 'string' ? s.replace(/\\n/g, '\n') : s);

/** Strip official rich-text markup but keep literal trigger labels — same output contract as the zh build. */
function stripRich(s) {
  if (typeof s !== 'string') return s ?? null;
  return unescapeNewlines(s)
    .replace(/<[@$#][^<>]*>/g, '')
    .replace(/<\/>/g, '')
    .replace(/<\/?color[^<>]*>/gi, '')
    .replace(/<\/?[bi]>/gi, '');
}
const richRaw = (s) => (typeof s === 'string' ? unescapeNewlines(s) : s ?? null);

const cleanNum = (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return v;
  if (Number.isInteger(v) || Math.abs(v) >= 1e6) return v;
  return Math.round(v * 1e6) / 1e6;
};

/** Format a number like the client's C#-style format strings ('0%', '0.0%', '0', '0.0'). */
function formatValue(v, fmt) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return String(v);
  if (!fmt) return String(cleanNum(v));
  const pct = fmt.endsWith('%');
  const core = pct ? fmt.slice(0, -1) : fmt;
  const decimals = core.includes('.') ? core.split('.')[1].length : 0;
  const x = pct ? v * 100 : v;
  const rounded = Math.sign(x) * Math.round(Math.abs(x) * 10 ** decimals + 1e-9) / 10 ** decimals;
  return rounded.toFixed(decimals) + (pct ? '%' : '');
}

/** Resolve {key}, {-key}, {key:0%} placeholders against a flattened blackboard (case-insensitive). */
function resolvePlaceholders(text, bb, bbStr = {}) {
  if (typeof text !== 'string') return text ?? null;
  const lower = new Map(Object.entries(bb || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const lowerStr = new Map(Object.entries(bbStr || {}).map(([k, v]) => [k.toLowerCase(), v]));
  return text.replace(/\{(-?)([^{}:]+)(?::([^{}]+))?\}/g, (m, neg, key, fmt) => {
    const k = key.trim().toLowerCase();
    if (lowerStr.has(k) && (!lower.has(k) || !fmt)) return lowerStr.get(k);
    if (lower.has(k)) return formatValue(neg ? -lower.get(k) : lower.get(k), fmt);
    warn(`unresolved placeholder ${m} (kept verbatim)`);
    return m;
  });
}

/** The {desc, descRaw} pair of an EN rich text with its placeholders resolved against the zh blackboard. */
function textPair(raw, bb, bbStr) {
  const resolved = bb ? resolvePlaceholders(richRaw(raw), bb, bbStr) : richRaw(raw);
  return { desc: stripRich(resolved), descRaw: resolved };
}

const isStr = (v) => typeof v === 'string' && v.length > 0;
const naturalCmp = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });

// ===== chess =====================================================================================

/**
 * The chess overlay: per zh record (charId known, non-DIY) the EN name, trait and every unlocked skill at the
 * chess's skill level. The blackboards are language-neutral, so the EN texts resolve their placeholders against
 * the zh record's already-merged blackboard (trait: rec.trait.bb — the base candidate plus, on golden, the module
 * override values; skills: the record's own bb/bbStr). The EN character_table carries the trait in `description`
 * (no per-phase candidates), so an elite's module trait line stays zh — the client keeps the zh moduleDesc too.
 */
async function buildChessOverlay() {
  const [zhChess, charTable, skillTable] = await Promise.all([
    loadZh('chess'),
    loadGamedata('excel/character_table.json'),
    loadGamedata('excel/skill_table.json'),
  ]);
  const out = {};
  let noChar = 0, noDesc = 0, skills = 0, missingSkill = 0;
  for (const chessId of Object.keys(zhChess).sort(naturalCmp)) {
    const rec = zhChess[chessId];
    if (!rec || rec.isDiy || !isStr(rec.charId)) continue;
    const enChar = charTable[rec.charId];
    if (!enChar) { noChar++; warn(`chess ${chessId}: char ${rec.charId} missing from the EN character_table`); continue; }
    const descEn = {};
    if (isStr(enChar.name)) out[chessId] = { nameEn: enChar.name, descEn };
    else out[chessId] = { descEn };
    if (!isStr(enChar.description)) { noDesc++; warn(`chess ${chessId}: char ${rec.charId} has no EN description (trait stays zh)`); }
    else descEn.trait = textPair(enChar.description, rec.trait?.bb, rec.trait?.bbStr);
    if (Array.isArray(rec.skills)) {
      descEn.skills = rec.skills.map((s) => {
        skills++;
        const en = s && isStr(s.skillId) ? skillTable[s.skillId] : null;
        const levels = Array.isArray(en?.levels) ? en.levels : [];
        if (!levels.length) { missingSkill++; warn(`chess ${chessId}: skill ${s?.skillId} missing from the EN skill_table`); return {}; }
        const lv = levels[Math.max(0, Math.min(s.level || 1, levels.length) - 1)];
        if (!isStr(lv?.description)) { missingSkill++; warn(`chess ${chessId}: skill ${s.skillId} has no EN description at level ${s.level}`); return {}; }
        const pair = textPair(lv.description, { duration: lv.duration, ...s.bb }, s.bbStr);
        return { ...(isStr(lv.name) ? { name: lv.name } : {}), ...pair };
      });
    }
  }
  const stats = { chess: Object.keys(out).length, withoutChar: noChar, withoutTrait: noDesc, skills, skillsWithoutEn: missingSkill };
  return { overlay: out, stats };
}

// ===== enemies ===================================================================================

/** The enemies overlay: name / description from the EN enemy_database at the zh record's level. */
async function buildEnemiesOverlay() {
  const [zhEnemies, enDbRaw] = await Promise.all([
    loadZh('enemies'),
    loadGamedata('levels/enemydata/enemy_database.json'),
  ]);
  const enDb = new Map();
  for (const e of enDbRaw.enemies || []) enDb.set(e.Key, e.Value);
  const out = {};
  let missing = 0;
  for (const key of Object.keys(zhEnemies).sort(naturalCmp)) {
    const rec = zhEnemies[key];
    const levels = enDb.get(key);
    if (!Array.isArray(levels) || !levels.length) { missing++; warn(`enemy ${key} missing from the EN enemy_database`); continue; }
    const at = (lv) => levels.find((l) => l.level === lv)?.enemyData || null;
    // the same level the zh record was built at, else the level-0 base record
    const data = at(rec.level) || at(0) || levels[0].enemyData;
    if (!data) { missing++; warn(`enemy ${key}: the EN enemy_database record has no enemyData`); continue; }
    const name = data.name?.m_value;
    const descRaw = data.description?.m_value;
    if (!isStr(name) && !isStr(descRaw)) { missing++; warn(`enemy ${key}: the EN enemy_database record has neither name nor description`); continue; }
    out[key] = {
      ...(isStr(name) ? { nameEn: name } : {}),
      descEn: {
        ...(isStr(stripRich(descRaw)) ? { desc: stripRich(descRaw) } : {}),
        ...(isStr(richRaw(descRaw)) ? { descRaw: richRaw(descRaw) } : {}),
      },
    };
  }
  const stats = { enemies: Object.keys(out).length, total: Object.keys(zhEnemies).length, withoutEn: missing };
  return { overlay: out, stats };
}

// ===== bonds / items (no EN source yet) ==========================================================

/**
 * Bonds and items have no trustworthy EN source (see the file header): the overlay stays an empty map so the
 * client's fallback keeps the zh texts. The files are still written so the client can fetch them uniformly.
 */
async function buildEmptyOverlay(zhName, why) {
  const zh = await loadZh(zhName);
  warn(why);
  return { overlay: {}, stats: { [zhName]: 0, total: Object.keys(zh).length } };
}

// ===== main ======================================================================================

async function main() {
  const t0 = Date.now();
  log('building the EN text overlay…');
  const chess = await buildChessOverlay();
  const enemies = await buildEnemiesOverlay();
  const bonds = await buildEmptyOverlay('bonds', 'bonds: the en_US client has not shipped this season — no EN bond texts yet');
  const items = await buildEmptyOverlay('items', 'items: the en_US client has not shipped this season (and its character_table has no traps) — no EN item texts yet');
  const files = { chess: chess.overlay, bonds: bonds.overlay, items: items.overlay, enemies: enemies.overlay };

  await mkdir(OPTS.out, { recursive: true });
  let total = 0;
  for (const [name, obj] of Object.entries(files)) {
    const text = JSON.stringify(obj);
    total += Buffer.byteLength(text);
    // Atomic per file: a crash mid-write never leaves a truncated JSON behind.
    const dest = join(OPTS.out, `${name}.json`);
    const tmp = `${dest}.tmp-${process.pid}`;
    await writeFile(tmp, text);
    await rename(tmp, dest);
  }
  const report = { out: OPTS.out, totalBytes: total, counts: { chess: chess.stats, bonds: bonds.stats, items: items.stats, enemies: enemies.stats }, warnings };
  const reportPath = join(ROOT, '.cache', 'build-data-en-report.json');
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2));

  log(`wrote ${Object.keys(files).length} overlay files to ${OPTS.out} (${(total / 1024).toFixed(1)} KB) in ${Date.now() - t0} ms`);
  log(JSON.stringify(report.counts));
  if (warnings.length) {
    log(`${warnings.length} warning(s) (report: ${reportPath});`);
    for (const w of warnings.slice(0, 12)) log(`  - ${w}`);
    if (warnings.length > 12) log(`  … and ${warnings.length - 12} more`);
  }
}

main().catch((e) => {
  console.error(`build-data-en: ${e && e.stack || e}`);
  process.exit(1);
});
