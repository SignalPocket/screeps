'use strict';

const assert = require('assert');
const { scaleEnergyBudget, scaleReserve, scaleBacklog } =
  require('./room.scaling');

assert.strictEqual(scaleEnergyBudget(300, 0.5), 300);
assert.strictEqual(scaleEnergyBudget(800, 0.5), 400);
assert.strictEqual(scaleEnergyBudget(1300, 0.65), 800);
assert.strictEqual(scaleEnergyBudget(550, 0.65), 350);
assert.strictEqual(scaleReserve(1300, 5, 1000), 6500);
assert.strictEqual(scaleReserve(300, 0.5, 300), 300);
assert.strictEqual(scaleBacklog(8000, 300), 6000);
assert.strictEqual(scaleBacklog(8000, 800), 8000);
assert.strictEqual(scaleBacklog(8000, 1300), 13000);
assert.strictEqual(scaleBacklog(8000, 300, 800), 6000);

console.log('room scaling scenarios passed');
