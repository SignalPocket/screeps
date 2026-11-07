'use strict';

const assert = require('assert');
const { selectBalancedRecoveryRequest } = require('./recovery.balance');

const request = (key, current, target, priority = 0) => ({
  key, current, target, priority, request: { role: key }
});

let selected = selectBalancedRecoveryRequest([
  request('remote-haul', 0, 7), request('brigade', 13, 17)
]);
assert.strictEqual(selected.recoveryLane, 'remote-haul');
assert.strictEqual(selected.recoveryCoverage, 0);

selected = selectBalancedRecoveryRequest([
  request('remote-haul', 6, 7), request('brigade', 13, 17)
]);
assert.strictEqual(selected.recoveryLane, 'brigade',
  'the remote queue yields when its proportional coverage passes brigade');

selected = selectBalancedRecoveryRequest([
  request('remote-haul', 1, 2), request('brigade', 1, 2)
], { 'remote-haul': 100, brigade: 50 });
assert.strictEqual(selected.recoveryLane, 'brigade',
  'equal coverage selects the lane least recently served');

selected = selectBalancedRecoveryRequest([
  request('remote-haul', 2, 2), request('brigade', 17, 17)
]);
assert.strictEqual(selected, null);

console.log('balanced recovery scenarios passed');
