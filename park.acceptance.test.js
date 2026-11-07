'use strict';
const assert = require('assert');
const fs = require('fs');
const { selectSupplyRecipient, totalSupplyDemand, selectParkingCandidates } =
  require('./park.recovery');

const position = (x, y) => ({ x, y,
  getRangeTo(a, b) {
    const targetX = typeof a === 'number' ? a : a.pos?.x ?? a.x;
    const targetY = typeof a === 'number' ? b : a.pos?.y ?? a.y;
    return Math.max(Math.abs(x - targetX), Math.abs(y - targetY));
  }
});
const worker = (name, role, x, y) => ({ name, memory: { role },
  pos: position(x, y) });

{
  const carrier = { pos: position(10, 10) };
  const adjacentUpgrader = worker('upgrader', 'upgrader', 11, 10);
  const distantBuilder = worker('builder', 'builder', 25, 25);
  const repairer = worker('repairer', 'builder', 12, 10);
  const recipients = [adjacentUpgrader, distantBuilder, repairer];
  const remaining = { upgrader: 50, builder: 50, repairer: 50 };
  const assignments = { upgrader: 'upgrade', builder: 'build', repairer: 'repair' };
  const before = JSON.stringify({ remaining, assignments });
  assert.strictEqual(totalSupplyDemand(remaining), 150,
    'production demand opens the direct-supply admission gate');
  assert.strictEqual(selectSupplyRecipient({ carrier, recipients, remaining,
    assignments }), distantBuilder,
  'active construction receives a direct handoff even when it is not adjacent');
  assert.strictEqual(JSON.stringify({ remaining, assignments }), before,
    'selection does not mutate demand or assignment records');
  remaining.builder = 0;
  assert.strictEqual(selectSupplyRecipient({ carrier, recipients, remaining,
    assignments }), repairer, 'repair work precedes routine controller supply');
  remaining.repairer = 0;
  assert.strictEqual(selectSupplyRecipient({ carrier, recipients, remaining,
    assignments }), adjacentUpgrader);
  remaining.upgrader = 0;
  assert.strictEqual(totalSupplyDemand(remaining), 0,
    'zero recipient capacity keeps the supply gate closed');
  assert.strictEqual(selectSupplyRecipient({ carrier, recipients, remaining,
    assignments }), null, 'no worker capacity produces no invented handoff');
}

{
  const spawn = { pos: position(10, 10) };
  const storage = { pos: position(12, 10) };
  const controller = { pos: position(40, 40) };
  const sources = [{ pos: position(30, 30) }];
  const protectedRoads = new Set();
  for (let x = 2; x <= 18; x++) for (let y = 2; y <= 18; y++) {
    if (spawn.pos.getRangeTo(x, y) <= 7 || storage.pos.getRangeTo(x, y) <= 7) {
      protectedRoads.add(`${x}:${y}`);
    }
  }
  const occupied = new Set(['20:20']);
  const plannedExtensions = new Set(['21:20']);
  const input = { terrain: { get: () => 0 }, sources, protectedRoads,
    occupied, plannedExtensions, spawn, storage, controller, wallMask: 1 };
  const candidates = selectParkingCandidates(input);
  assert(candidates.length > 0, 'whole-room fallback finds safe parking');
  assert(candidates.every(({ x, y }) =>
    spawn.pos.getRangeTo(x, y) > 2 && storage.pos.getRangeTo(x, y) > 2 &&
    controller.pos.getRangeTo(x, y) > 6 && sources[0].pos.getRangeTo(x, y) > 4 &&
    !protectedRoads.has(`${x}:${y}`) && !occupied.has(`${x}:${y}`) &&
    !plannedExtensions.has(`${x}:${y}`)),
  'fallback preserves spawn, storage, controller, source, road, site and layout clearance');
  assert.strictEqual(new Set(candidates.map(p => `${p.x}:${p.y}`)).size,
    candidates.length, 'parking candidates remain unique');
  assert.deepStrictEqual(candidates, selectParkingCandidates(input),
    'repeated planning is stable');
  assert.deepStrictEqual(selectParkingCandidates({
    terrain: { get: () => 1 }, sources: [], protectedRoads: new Set(),
    occupied: new Set(), plannedExtensions: new Set(), spawn: null,
    storage: null, controller: null, wallMask: 1
  }), [], 'a room with no legal tile does not invent parking');
}

const main = fs.readFileSync(require.resolve('./main'), 'utf8');
assert(main.includes('selectSupplyRecipient({ carrier: creep,'));
assert(main.includes('supplyDemand = totalSupplyDemand(recipientRemaining);'));
assert(main.includes('selectParkingCandidates({ terrain, sources,'));
console.log('park acceptance covers distant construction supply and safe whole-room fallback');
