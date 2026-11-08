'use strict';

const assert = require('assert');
const { getTaskSpeech, getWaitSpeech, shortTasks } =
  require('./creep.reporting');

const expected = {
  upgrade: 'RC',
  'urgent-upgrade': 'RC!',
  'emergency-refill': 'Fill!',
  refill: 'Fill',
  'refill-load': 'Load',
  rebalance: 'Bal',
  repair: 'Fix',
  'emergency-repair': 'Fix!',
  'repair-load': 'LoadFix',
  'supply-worker': 'Give',
  'await-supply': 'WaitE',
  'stage-supply': 'Stage',
  'stage-buffer': 'StageRC',
  'stock-refill': 'StockSp',
  'stage-refill': 'StageSp',
  'stage-collect': 'StageS',
  'committed-collect': 'Get',
  'committed-refill': 'Fill',
  'committed-refill-buffer': 'StockSp',
  'committed-buffer': 'StockRC',
  'committed-storage': 'Store',
  'committed-supply': 'Give',
  standby: 'Blocked',
  'wait-job': 'Blocked',
  withdraw: 'Get',
  store: 'Store',
  'store-storage': 'Store',
  recycle: 'Recycle',
  scavenge: 'Pick',
  claim: 'Claim',
  reserve: 'Reserve',
  'expansion-build': 'Expand'
};

for (const [task, label] of Object.entries(expected)) {
  assert.strictEqual(shortTasks[task], label, task);
  assert.strictEqual(getTaskSpeech(task), label, task);
}
assert.strictEqual(getTaskSpeech('expansion-build', {
  overrides: { 'expansion-build': 'New' }
}), 'New');
assert.strictEqual(getTaskSpeech('unknown-task'), 'Idle');
assert.strictEqual(getTaskSpeech('unknown-task', {
  fallback: 'unknown-task'
}), 'unknown-task');
assert.strictEqual(getWaitSpeech({ waitState: 'parked' }), 'Park');
assert.strictEqual(getWaitSpeech({ waitState: 'blocked' }), 'Blocked');

const main = require('fs').readFileSync(require.resolve('./main'), 'utf8');
assert(!main.includes('const taskSpeech = {'),
  'live speech must not restore a second generic label map');
assert(main.includes("overrides: { 'expansion-build': 'New' }"),
  'the deliberate live expansion overlay must remain explicit');

console.log('shared task speech labels preserve base, overlay and fallback behavior');
