// test/sim/feedback6-auto-op-cooldown.test.js — GitHub #298: an AUTO skill whose rule is a tick rule (SP_FULL / …)
// has no attack to pace its casts, so SP fed faster than the skill spends it re-fired the cast every tick (引星棘刺 S1
// 度算浪波 + 华法琳 血液样本回收 feeding +2 SP per kill: 「一秒钟就能叠满，不吃攻速」— a new guard zone per tick).
// The official 自动操作 3 s cooldown ("自动操作具有3s冷却，在完成一次操作或作战开始时部署的单位将进入冷却", PRTS
// 卫戍协议/帮助 §作战阶段 技能操作) now also covers those casts (skills.js _opCooling / activate); an attack-bound AUTO
// skill (DEFAULT) keeps its attack-cycle cadence, and the natural SP cadence (cost / SP per second) is never held back.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, checkInvariants } from '../helpers/battleHarness.js';

const op = (o = {}) => chessRec({
  id: 't_op', rangeGrid: [[0, 0]], ...o,
  skill: { kind: 'instant', spType: 'time', spCost: 7, initSp: 0, trigger: { rule: 'SP_FULL' }, ...(o.skill || {}) },
});
const arena = (o = {}) => makeBattle({
  defs: { chess: { t_op: op(o.chess) } },
  units: [{ chessId: 't_op', row: 10, col: 4, ...(o.unit || {}) }],
  hooks: ['skillStart'], captureNoisy: true, autoFinish: false, timeLimit: 20, seed: 3, content: 'generic',
});
const casts = (h) => h.hooksOf('skillStart').filter((c) => c.unit === h.unit('t_op'));
const done = (h) => { assert.deepEqual(h.b.errors.map((e) => `${e.label} ${e.message}`), []); checkInvariants(h.b); };

test('#298 an AUTO SP_FULL skill fed SP faster than it spends casts at most once per 3 s (the 自动操作 cooldown)', () => {
  const h = arena({ unit: { stats: { spRecovery: 100 } } });  // the bar refills within a tick, as kill-fed SP does
  h.run(10);
  const ts = casts(h).map((c) => c.t);
  assert.ok(ts.length > 0, 'it casts at all');
  assert.ok(ts.length <= 4, `fed SP must not re-fire the cast every tick (${ts.length} casts in 10 s: ${ts.join(', ')})`);
  for (let i = 1; i < ts.length; i++) {
    assert.ok(ts[i] - ts[i - 1] >= 3 - 1e-9, `casts ${i - 1}->${i} are only ${ts[i] - ts[i - 1]}s apart`);
  }
  done(h);
});

test('#298 the cooldown never holds back the natural cadence (cost 7 at 1 SP/s still casts every ~7 s)', () => {
  const h = arena({ unit: { stats: { spRecovery: 1 } } });
  h.run(16);
  const ts = casts(h).map((c) => c.t);
  assert.ok(ts.length >= 2, `natural casts happen (${ts.join(', ')})`);
  for (let i = 1; i < ts.length; i++) {
    assert.ok(ts[i] - ts[i - 1] >= 7 - 0.25, `the natural gap is kept (${ts[i] - ts[i - 1]}s)`);
  }
  done(h);
});
