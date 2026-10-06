// Battle.fieldMeta carries the wave's batch routes (motion / start / end / MOVE+APPEAR checkpoint
// positions): the client draws the one-shot red-gate→blue-door route current from m.field.meta.routes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle } from '../helpers/battleHarness.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';

const REAL = { skip: !hasGeneratedData() };

test('fieldMeta passes the wave routes through (motion, start, end, MOVE/APPEAR checkpoints)', REAL, () => {
  const routes = [{ motion: 'WALK', start: [10, 14], end: [10, 0], checkpoints: [{ type: 'MOVE', pos: [10, 7] }, { type: 'APPEAR', pos: [9, 7] }, { type: 'DISAPPEAR', pos: [0, 0] }] }];
  const h = makeBattle({ routes, units: [], enemies: [], autoFinish: false, timeLimit: 60 });
  const meta = h.b.fieldMeta();
  assert.deepEqual(meta.routes, [{ motion: 'WALK', start: [10, 14], end: [10, 0], checkpoints: [[10, 7], [9, 7]] }]);
  assert.equal(meta.routes[0].checkpoints.some((c) => c.length === 2), true);
});
