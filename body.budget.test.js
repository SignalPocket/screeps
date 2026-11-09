'use strict';

const assert = require('assert');
const { createBodyFactory } = require('./body.factory');
const constants = {
  WORK: 'work', CARRY: 'carry', MOVE: 'move', ATTACK: 'attack',
  RANGED_ATTACK: 'ranged_attack', HEAL: 'heal', CLAIM: 'claim', TOUGH: 'tough',
  BODYPART_COST: { work: 100, carry: 50, move: 50, attack: 80,
    ranged_attack: 150, heal: 250, claim: 600, tough: 10 }
};
const factory = createBodyFactory(constants);
const cost = body => body.reduce((sum, part) =>
  sum + constants.BODYPART_COST[part], 0);
const count = (body, type) => body.filter(part => part === type).length;
const roles = ['miner', 'harvester', 'remote-miner', 'remote-hauler',
  'refiller', 'hauler', 'rebalancer', 'upgrader', 'builder', 'defender',
  'claimer', 'remote-reserver', 'controller-relay'];
const budgets = Array.from({ length: 2001 }, (_, energy) => energy)
  .concat([3000, 5600, 12900]);

// Cover the gaps between standard room capacities, where recovery spawning
// actually runs, including every one-energy transition around minimum bodies.
for (const role of roles) {
  const variants = [{}, { maximize: true }];
  if (['miner', 'harvester'].includes(role)) {
    variants.push({ workLimit: 3 }, { miningProduction: 10 });
  }
  if (role === 'upgrader') {
    variants.push({ workLimit: 3 }, { operationWork: 15 });
  }
  if (['hauler', 'remote-hauler', 'refiller', 'rebalancer'].includes(role)) {
    variants.push({ carryParts: 2 });
  }
  for (const options of variants) for (const energy of budgets) {
    const body = factory.buildBody(role, energy, options);
    if (body === null) continue;
    const context = `${role} at ${energy}: ${JSON.stringify(options)}`;
    assert(body.length > 0 && body.length <= 50, context);
    assert(body.every(part => Object.hasOwn(constants.BODYPART_COST, part)), context);
    assert(cost(body) <= energy, `unaffordable ${context}`);
    assert(body.includes('move'), `immobile ${context}`);
    if (options.miningProduction) assert(cost(body) <= 800, context);
    else if (!options.operationWork && role !== 'remote-reserver') {
      assert(cost(body) <= 700, `routine ceiling ${context}`);
    }
    if (options.carryParts) assert(count(body, 'carry') <= options.carryParts, context);
    if (options.workLimit) assert(count(body, 'work') <= options.workLimit, context);
  }
}

// Explicit liveness assertions prevent an always-null implementation from
// satisfying the affordability sweep. Exceptions must work at their exact cost.
for (const [role, options, threshold] of [
  ['builder', {}, 200], ['remote-miner', {}, 200],
  ['hauler', {}, 100], ['defender', {}, 140], ['claimer', {}, 650],
  ['controller-relay', {}, 150], ['remote-reserver', {}, 1300],
  ['miner', { miningProduction: 10 }, 200],
  ['upgrader', { operationWork: 15 }, 1800]
]) {
  assert.strictEqual(factory.buildBody(role, threshold - 1, options), null, role);
  assert(factory.buildBody(role, threshold, options), `${role} minimum must spawn`);
}

for (const [alias, canonical] of Object.entries({
  carrier: 'hauler', controller: 'upgrader', field: 'remote-miner', worker: 'builder'
})) for (const energy of budgets) {
  for (const options of [{}, { maximize: true }]) {
    assert.deepStrictEqual(factory.buildBody(alias, energy, options),
      factory.buildBody(canonical, energy, options), `${alias} at ${energy}`);
  }
}

// A productive source owner must still clear regeneration after unload ticks,
// rather than merely fitting its exceptional budget with too little capacity.
const miner = factory.buildBody('miner', 800, { miningProduction: 10 });
const batch = count(miner, 'work') * 2;
const cycles = Math.floor(count(miner, 'carry') * 50 / batch);
assert(batch * cycles / (cycles + 1) >= 10.5);

const lastDitchDefender = factory.buildBody('defender', 140);
assert.deepStrictEqual(lastDitchDefender, ['tough', 'attack', 'move'],
  'the minimum emergency defender must remain spawnable');
assert.deepStrictEqual(factory.buildBody('defender', 300, {
  healerSupport: true
}), ['heal', 'move'],
'a fully mobile emergency healer is available at 300 energy');
assert.deepStrictEqual(factory.buildBody('defender', 250, {
  healerSupport: true
}), null, 'healer support never silently degrades into a non-healer');
for (const energy of [190, 250, 450, 550, 700, 2000]) {
  const defender = factory.buildBody('defender', energy);
  assert(count(defender, 'move') >= defender.length - count(defender, 'move'),
    `defender at ${energy} must cross plains without fatigue`);
}
console.log('body budget boundaries, minimum viability and alias parity passed');
