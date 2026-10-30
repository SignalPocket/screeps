'use strict';

const assert = require('assert');
const { updateOperationalHealth } = require('./health.operations');

const memory = {};
const creep = {
  name: 'carrier', room: { name: 'W1N1' }, store: { energy: 0 },
  memory: { home: 'W1N1', role: 'remote-hauler', task: 'remote-haul',
    demandLane: 'none', remoteRoom: 'W1N2', remoteDispatchRoom: 'W1N3' }
};
updateOperationalHealth(memory, 10, [creep], {
  backlog: 2000, blockedRooms: 1, delivered: 100
});
creep.memory.task = 'standby';
creep.memory.idleNow = true;
creep.memory.remoteHaulReturning = true;
updateOperationalHealth(memory, 11, [creep], {
  backlog: 2500, blockedRooms: 1, delivered: 100
});
creep.memory.task = 'remote-haul';
creep.memory.idleNow = false;
updateOperationalHealth(memory, 12, [creep], {
  backlog: 2400, blockedRooms: 1, delivered: 150
});
const current = memory.operationalHealth.current;
assert.strictEqual(current.taskChanges, 2);
assert.strictEqual(current.taskFlips, 1);
assert.strictEqual(current.idleTransitions, 1);
assert.strictEqual(current.foreignDispatchTicks, 3);
assert.strictEqual(current.staleReturnTicks, 2);
assert.strictEqual(current.remoteBacklog, 2500);
assert.strictEqual(current.remoteDelivered, 150);

creep.memory.sourceReserve = 'source-1';
updateOperationalHealth(memory, 13, [creep], { sourceCoverageGap: 0 });
assert.strictEqual(current.sourceRecoveryTicks, 0);
updateOperationalHealth(memory, 14, [creep], { sourceCoverageGap: 2 });
assert.strictEqual(current.sourceRecoveryTicks, 1);
assert.strictEqual(current.sourceCoverageGap, 2);

updateOperationalHealth(memory, 250, [], {});
assert.strictEqual(memory.operationalHealth.previous.bucket, 0);
assert.strictEqual(memory.operationalHealth.current.bucket, 250);

console.log('operational health scenarios passed');
