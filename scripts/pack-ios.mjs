#!/usr/bin/env node
// pack-ios.mjs — prepares everything the iOS shell needs before `xcodegen` + `xcodebuild`:
//
//   ios/third_party/libnode/libnode.a        static libnode for iOS device (arm64)
//   ios/third_party/libnode/include/*.h      node headers for the C++ shim
//   ios/Resources/nodejs-project/            server/ shared/ data/ public/ node_modules/ws package.json
//
// Unlike Android there are no zips: iOS bundles are read-only, so the resources
// ship as a plain folder reference and get copied to Documents on first launch.
//
// Usage: node scripts/pack-ios.mjs [--force]
//   TLS note: if your network MITMs https, run with NODE_USE_SYSTEM_CA=1.

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IOS = join(ROOT, 'ios');
const THIRD = join(IOS, 'third_party');
const RES = join(IOS, 'Resources', 'nodejs-project');
const VERSION = '18.20.4';

const FORCE = process.argv.includes('--force');

function extractZip(zipPath, dest) {
  if (process.platform === 'darwin') {
    execFileSync('ditto', ['-x', '-k', zipPath, dest]);
  } else if (process.platform === 'win32') {
    execFileSync('powershell', ['-NoProfile', '-Command',
      `Expand-Archive -Force -LiteralPath "${zipPath}" -DestinationPath "${dest}"`]);
  } else {
    execFileSync('unzip', ['-q', '-o', zipPath, '-d', dest]);
  }
}

function findLibnode(dir) {
  // the release layout has varied across versions — accept static archives,
  // dylibs and framework/xcframework binaries for the device (non-simulator) slice
  const hits = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (/libnode/i.test(name) && !/simulator|x86_64|iphonesimulator/i.test(full)) {
        if (/\.(a|dylib)$/.test(name) || /framework/i.test(full)) hits.push(full);
      }
    }
  };
  walk(dir);
  return hits[0];
}

function printTree(dir, depth = 3) {
  const walk = (d, level, prefix) => {
    if (level > depth) return;
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      const isDir = statSync(full).isDirectory();
      console.log(`[libnode-ios]   ${prefix}${name}${isDir ? '/' : ''}`);
      if (isDir) walk(full, level + 1, prefix + '  ');
    }
  };
  walk(dir, 1, '  ');
}

function ensureLibnode() {
  const out = join(THIRD, 'libnode');
  if (existsSync(join(out, 'libnode.a')) && existsSync(join(out, 'include', 'node.h')) && !FORCE) {
    console.log('[libnode-ios] already present, skipping');
    return;
  }
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  let src = join(THIRD, `nodejs-mobile-v${VERSION}-ios`);
  const zipPath = join(THIRD, `nodejs-mobile-v${VERSION}-ios.zip`);
  if (!existsSync(src)) {
    const nested = existsSync(src)
      ? readdirSync(src).find((d) => statSync(join(src, d)).isDirectory() && existsSync(join(src, d, 'include')))
      : undefined;
    if (!nested) {
      mkdirSync(THIRD, { recursive: true });
      if (!existsSync(zipPath)) {
        const url = `https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v${VERSION}/nodejs-mobile-v${VERSION}-ios.zip`;
        console.log(`[libnode-ios] downloading ${url}`);
        try {
          execFileSync('curl', ['-sL', '-o', zipPath, url], { stdio: 'inherit' });
        } catch {
          throw new Error('下载失败：手动下载上面的 zip 放到 ios/third_party/ 后重跑');
        }
      }
      console.log('[libnode-ios] extracting …');
      extractZip(zipPath, src);
    }
  }

  const lib = findLibnode(src);
  if (!lib) {
    console.error(`[libnode-ios] 未找到 libnode，解压树如下（${src}）：`);
    printTree(src, 4);
    throw new Error('libnode 静态库未找到');
  }
  console.log(`[libnode-ios] found: ${lib}`);
  cpSync(lib, join(out, 'libnode.a'));

  // headers: zip ships include/node/*.h — flatten to include/*.h for a single search path
  const incFrom = join(src, 'include', 'node');
  const incTo = join(out, 'include');
  mkdirSync(incTo, { recursive: true });
  cpSync(incFrom, incTo, { recursive: true });

  const sha = createHash('sha256').update(readFileSync(join(out, 'libnode.a'))).digest('hex');
  console.log(`[libnode-ios] libnode.a ${(statSync(join(out, 'libnode.a')).size / 1048576).toFixed(0)} MB sha256=${sha.slice(0, 16)}…`);
}

function copyResources() {
  mkdirSync(RES, { recursive: true });
  for (const dir of ['server', 'shared', 'data']) {
    cpSync(join(ROOT, dir), join(RES, dir), { recursive: true });
  }
  cpSync(join(ROOT, 'package.json'), join(RES, 'package.json'));
  rmSync(join(RES, 'node_modules'), { recursive: true, force: true });
  cpSync(join(ROOT, 'node_modules', 'ws'), join(RES, 'node_modules', 'ws'), { recursive: true });
  cpSync(join(ROOT, 'public'), join(RES, 'public'), { recursive: true });
  console.log('[pack-ios] nodejs-project resources copied');
}

ensureLibnode();
copyResources();
console.log('[pack-ios] done — cd ios && xcodegen generate && xcodebuild');
