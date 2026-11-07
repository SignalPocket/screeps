'use strict';
const assert = require('assert');
const { describeSpawnAttempt, recordSpawnDenials } = require('./spawn.denial');
const attempt = (overrides = {}) => describeSpawnAttempt({ spawn: 'A',
  proposed: { role: 'remote-hauler', remoteRoom: 'W1N1', remoteHaulerSlot: 0 },
  authority: { authorized: false, phase: 'baseline',
    reason: 'baseline refiller precedes remoteHauler' }, ...overrides });
const memory = { unrelated: { keep: true } };
const denial = attempt();
const record = (tick, items = [denial], mem = memory) =>
  recordSpawnDenials(mem, tick, items).records;
assert.equal(record(0).A.firstTick, 0);
assert.equal(record(1).A.age, 1);
assert.equal(record(1).A.observations, 2, 'same-tick replay is idempotent');
assert.equal(record(2).A.firstTick, 0, 'unchanged denial keeps its start');
assert.equal(record(4).A.age, 0, 'unobserved tick breaks continuous age');
assert.equal(record(5, [attempt({ authority: { authorized: false,
  phase: 'remote-minimum', reason: 'remote minimum miner precedes hauler' } })]).A.age, 0);
assert.equal(record(6, [attempt({ proposed: { role: 'remote-hauler',
  remoteRoom: 'W2N1', remoteHaulerSlot: 0 } })]).A.age, 0,
  'changed target starts a new episode');
const authorized = { authorized: true };
const prepared = { needsWorker: true, body: ['carry', 'move'] };
const success = attempt({ authority: authorized, request: prepared, result: 0 });
assert.equal(record(7, [success]).A.status, 'admitted');
assert.equal(record(7, [success]).A.firstTick, undefined);
assert.equal(record(8).A.age, 0, 'successful admission ends old denial');
const busy = attempt({ busy: true });
assert.equal(record(9, [busy]).A.status, 'busy');
assert.equal(record(10).A.age, 0, 'spawn occupancy is not a denial');
assert.equal(attempt({ proposed: null }).status, 'idle');
const admission = attempt({ authority: authorized, request: { needsWorker: false } });
assert.equal(admission.gate, 'admission');
assert(admission.recovery.includes('does not distinguish'));
const body = attempt({ authority: authorized,
  request: { needsWorker: true, body: null } });
assert.equal(body.gate, 'body');
assert(body.recovery.includes('no specific failing body gate'));
assert.equal(attempt({ authority: authorized, request: prepared, result: -6 }).authority,
  'spawnCreep');
assert.equal(record(11, [denial, { ...body, spawn: 'B' }]).B.firstTick, 11);
const both = record(12, [success, { ...body, spawn: 'B' }]);
assert.equal(both.B.age, 1, 'another spawn succeeding does not erase this denial');
assert.equal(both.A.status, 'admitted');
const other = {};
assert.equal(record(100, [denial], other).A.age, 0, 'rooms remain independent');
assert.equal(memory.spawnDenials.records.B.age, 1);
assert.deepStrictEqual(memory.unrelated, { keep: true });
assert.deepStrictEqual(record(13, []), {}, 'removed spawns leave no stale records');
assert.equal(Object.keys(record(14, ['D', 'B', 'C', 'A'].map(spawn =>
  ({ ...denial, spawn })))).length, 3, 'bounded by engine spawn limit');
assert.equal(record(1).A.age, 0, 'backward tick cannot preserve an old episode');
console.log('spawn denial diagnostics tests passed');
