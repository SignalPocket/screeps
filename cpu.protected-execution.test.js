'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { deriveCpuPolicy, selectFairExecutionCreeps } = require('./cpu.policy');
const main = fs.readFileSync(require.resolve('./main'), 'utf8')
  .replace(/\r\n/g, '\n');
const queueStart = main.indexOf('  const sortedExecutionCreeps =');
const queueEnd = main.indexOf('  const controllerStations =', queueStart);
const guardStart = main.indexOf('  const executionCpuCeiling =');
const guardEnd = main.indexOf('    const pickupJob=', guardStart);
assert(queueStart >= 0 && queueEnd > queueStart &&
  guardStart >= 0 && guardEnd > guardStart, 'test runs the installed queue and CPU guard');
const creep = (name, role, extra = {}, energy = 0) =>
  ({ name, memory: { role, ...extra }, store: { energy } });
const home = creep('home', 'harvester');
const refiller = creep('refiller', 'refiller');
const miner = creep('remote', 'remote-miner');
const reserver = creep('reserver', 'remote-reserver');
const defender = creep('defender', 'defender');
const repair = creep('repair', 'builder', { emergencyRepairRoom: 'W8N3' });
const hauler = creep('local-transport', 'hauler');
const balancer = creep('home-balancer', 'rebalancer');
const upgrader = creep('controller', 'upgrader');
const relay = creep('controller-supply', 'controller-relay');
const outbound = creep('outbound', 'remote-hauler');
const loaded = creep('loaded', 'remote-hauler', {}, 150);
const surplusLoaded = creep('surplus-loaded', 'remote-hauler',
  { remoteRosterSurplus: true }, 150);
const surplusRefiller = creep('surplus-refiller', 'remote-hauler',
  { remoteRosterSurplus: true, refillSpecialist: true });
const optional = Array.from({ length: 20 }, (_, n) =>
  creep(`optional${n}`, n % 2 ? 'builder' : 'remote-hauler',
    { remoteRosterSurplus: true }));
const protectedCreeps = [home, refiller, miner, reserver, defender, repair,
  hauler, balancer, upgrader, relay, outbound, loaded, surplusLoaded, surplusRefiller];
const protectedNames = protectedCreeps.map(c => c.name).sort();
// Put optional work before home jobs to test partitioning as well as the guard.
const records = [...optional, ...protectedCreeps]
  .map(creep => ({ creep }));
const run = (bucket, used, tick) => {
  const context = { Game: { time: tick, cpu: { limit: 100, getUsed: () => used } },
    cpuPolicy: deriveCpuPolicy(bucket), CONTROLLER_BRIGADE_ROLE: 'controller-relay',
    RESOURCE_ENERGY: 'energy',
    executionOrderRecords: records, sortExecutionRecords: value => value.slice(),
    selectFairExecutionCreeps, previousCpuExecution: null,
    visited: [] };
  vm.runInNewContext(main.slice(queueStart, queueEnd) +
    main.slice(guardStart, guardEnd) + 'visited.push(creep.name); }', context);
  return context.visited;
};
for (const bucket of [500, 2000, 10000]) {
  const visited = run(bucket, 100, 100);
  assert(protectedNames.every(name => visited.includes(name)),
    `the full energy chain, reservations and defense execute above the ceiling at bucket ${bucket}`);
  assert.strictEqual(visited.length,
    Math.max(protectedNames.length, deriveCpuPolicy(bucket).minimumExecutionCreeps || 0));
}
assert.deepStrictEqual(Array.from(run(10000, 100, 100)).sort(), protectedNames,
  'full bucket does not force optional work past the CPU reserve');
assert.strictEqual(run(10000, 0, 100).length, records.length,
  'optional work still runs when CPU is available');
assert.notDeepStrictEqual(Array.from(run(2000, 100, 100)), Array.from(run(2000, 100, 101)),
  'remaining optional executor opportunities still rotate');
// A retiring/surplus carrier must finish its load before it becomes optional.
surplusLoaded.store.energy = 0;
assert(!run(10000, 100, 100).includes(surplusLoaded.name));
surplusLoaded.store.energy = 150;
assert(run(10000, 100, 100).includes(surplusLoaded.name));
// Remove only the transport admission condition to reproduce the original gap.
const transportGate = / \|\|\n    creep\.memory\.role === 'remote-hauler' &&\n      \(!creep\.memory\.remoteRosterSurplus \|\| creep\.memory\.refillSpecialist \|\|\n        creep\.store\[RESOURCE_ENERGY\] > 0\)/;
const withoutTransport = main.replace(transportGate, '');
assert.notStrictEqual(withoutTransport, main);
const transportContext = { Game: { time: 100, cpu: { limit: 100, getUsed: () => 100 } },
  cpuPolicy: deriveCpuPolicy(10000), CONTROLLER_BRIGADE_ROLE: 'controller-relay',
  RESOURCE_ENERGY: 'energy', executionOrderRecords: records,
  sortExecutionRecords: value => value.slice(), selectFairExecutionCreeps,
  previousCpuExecution: null, visited: [] };
vm.runInNewContext(withoutTransport.slice(queueStart,
  withoutTransport.indexOf('  const controllerStations =', queueStart)) +
  withoutTransport.slice(withoutTransport.indexOf('  const executionCpuCeiling ='),
    withoutTransport.indexOf('    const pickupJob=', withoutTransport.indexOf('  const executionCpuCeiling ='))) +
  'visited.push(creep.name); }', transportContext);
assert(!transportContext.visited.includes(outbound.name) &&
  !transportContext.visited.includes(loaded.name), 'regression loses both pickup and delivery without transport protection');
// Demonstrate that removing the protection reintroduces the reported outage.
const oldMain = main.replace("    'remote-miner',\n", '');
assert.notStrictEqual(oldMain, main);
const oldContext = { Game: { time: 100, cpu: { limit: 100, getUsed: () => 100 } },
  cpuPolicy: deriveCpuPolicy(10000), CONTROLLER_BRIGADE_ROLE: 'controller-relay',
  RESOURCE_ENERGY: 'energy',
  executionOrderRecords: records, sortExecutionRecords: value => value.slice(),
  selectFairExecutionCreeps, previousCpuExecution: null, visited: [] };
const oldQueueStart = oldMain.indexOf('  const sortedExecutionCreeps =');
const oldGuardStart = oldMain.indexOf('  const executionCpuCeiling =');
vm.runInNewContext(oldMain.slice(oldQueueStart,
  oldMain.indexOf('  const controllerStations =', oldQueueStart)) +
  oldMain.slice(oldGuardStart, oldMain.indexOf('    const pickupJob=', oldGuardStart)) +
  'visited.push(creep.name); }', oldContext);
assert(!oldContext.visited.includes('remote'), 'regression reproduces without miner protection');
console.log('the complete energy chain executes above every CPU ceiling while surplus work remains bounded');
