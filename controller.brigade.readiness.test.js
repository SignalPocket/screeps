'use strict';

const assert = require('assert');
const { evaluateControllerBrigadeReadiness } =
  require('./controller.brigade.readiness');

const jobs = {
  source: { min: 2, coverageCount: 2 },
  refiller: { min: 1, coverageCount: 1 },
  hauler: { min: 1, coverageCount: 1 },
  repairBuilder: { min: 1, coverageCount: 1 }
};
const ready = evaluateControllerBrigadeReadiness({ signals: {
  buildRemaining: 5000, repairRemaining: 10000, repairCritical: false
} }, { jobs });
assert.strictEqual(ready.ready, true);

const busy = evaluateControllerBrigadeReadiness({ signals: {
  buildRemaining: 5001, repairRemaining: 10001, repairCritical: true
} }, { jobs: { ...jobs, source: { min: 2, coverageCount: 1 } } });
assert.strictEqual(busy.ready, false);
assert.deepStrictEqual(busy.blockers, [
  'critical repairs', 'build backlog 5001', 'repair backlog 10001',
  'source staffing 1/2'
]);

console.log('controller brigade readiness scenarios passed');
