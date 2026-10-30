'use strict';

const assert = require('assert');
const { summarizeRoomHealth } = require('./health.reporting');

const empty = summarizeRoomHealth('W1N1', null);
assert.strictEqual(empty.samples, 0);
assert.ok(empty.dashboard.includes('collecting baseline'));

const summary = summarizeRoomHealth('W1N1', {
  maxRecords: 32,
  records: [{
    tick: 1000, stored: 12500, ready: 0.8, source: 0.6,
    sourceLow: 0.2, extensions: 0.4, work: 0.7,
    build: 3000, repair: 20000, population: 12, desired: 14
  }],
  adjustment: { repairBonus: 1, haulerBonus: 2 },
  recovery: { key: 'local-flow', label: 'DRAIN SOURCES',
    action: 'raise local haul staffing' }
});
assert.strictEqual(summary.samples, 1);
assert.ok(summary.dashboard.includes('fix+1 haul+2'));
assert.ok(summary.console.includes('stored 12.5k'));
assert.ok(summary.console.includes('population 12/14'));
assert.ok(summary.dashboard.includes('DRAIN SOURCES'));

console.log('health reporting scenarios passed');
