"use strict";
const assert = require('assert');
const { observeOutpostExport: observe } = require('./outpost.exports');
const memory = { remoteCargoOrigin:'W8N4', remoteCargoRemaining:250 };
const homeMemory = {};
const step = (tick, roomName, energy=250) => observe({ tick, roomName,
  energy, memory, homeMemory });
assert.strictEqual(step(1,'W8N4'),0);
assert.strictEqual(step(2,'W8N3'),250); // Intermediate room is enough.
assert.strictEqual(step(2,'W8N3'),0);
assert.strictEqual(step(3,'W7N4'),0);
assert.strictEqual(step(4,'W8N4'),0);
assert.strictEqual(step(5,'W8N3'),0); // Same cargo cannot be counted twice.
assert.strictEqual(homeMemory.outpostEconomy.W8N4.exportedTotal,250);
step(6,'W7N4',0);
step(7,'W8N4',0);
assert.strictEqual(step(8,'W7N4',100),100);
assert.strictEqual(homeMemory.outpostEconomy.W8N4.exportedTotal,350);
const fresh={remoteCargoOrigin:'W8N4',remoteCargoRemaining:250};
assert.strictEqual(observe({tick:9,roomName:'W7N4',energy:250,
  memory:fresh,homeMemory}),0); // Never invent a historical crossing.
console.log('outpost border export scenarios passed');
