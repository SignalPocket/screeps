'use strict';
const assert = require('assert');
const { createResourceReservations } = require('./resource.reservations');

const store = (id, energy, free) => ({
  id, room: { name: id.startsWith('remote') ? 'remote' : 'home' },
  store: {
    energy, mineral: 999, free,
    getFreeCapacity(resource) {
      assert.strictEqual(resource, 'energy');
      return this.free;
    }
  }
});

const permutations = values => values.length ? values.flatMap((value, index) =>
  permutations(values.filter((_, i) => i !== index)).map(rest => [value, ...rest])) : [[]];

// Refill, upgrade and remote carriers share scarce resources. Admission order
// may change who wins, but cannot change the conserved total or overbook it.
for (const mode of ['energy', 'capacity']) {
  for (const available of [0, 1, 49, 50, 299, 300, 301, 800]) {
    for (const requests of permutations([50, 300, 800])) {
      const book = createResourceReservations('energy');
      const target = store('home-source', available, available);
      const reserve = mode === 'energy' ? book.reserveEnergyFrom : book.reserveCapacityIn;
      const remaining = mode === 'energy' ? book.getUnreservedEnergy : book.getUnreservedCapacity;
      let admitted = 0;
      for (const requested of requests) {
        const amount = reserve(target, requested);
        assert.ok(Number.isInteger(amount) && amount >= 0 && amount <= requested);
        admitted += amount;
        assert.ok(admitted <= available, `${mode} overbooked ${available}`);
        assert.strictEqual(remaining(target) + admitted, available);
      }
      assert.strictEqual(admitted, Math.min(available, 1150));
      assert.strictEqual(target.store.energy, available);
      assert.strictEqual(target.store.free, available);
      assert.strictEqual(target.store.mineral, 999);
    }
  }
}

// A failed intent releases only its claim; accepted or travelling claims still
// protect stock. The released amount is immediately reusable by another role.
for (const mode of ['energy', 'capacity']) {
  const book = createResourceReservations('energy');
  const target = store('home-buffer', 500, 500);
  const reserve = mode === 'energy' ? book.reserveEnergyFrom : book.reserveCapacityIn;
  const remaining = mode === 'energy' ? book.getUnreservedEnergy : book.getUnreservedCapacity;
  const ledger = mode === 'energy' ? book.reservedEnergy : book.reservedCapacity;
  const accepted = reserve(target, 300);
  const failed = reserve(target, 300);
  assert.strictEqual(accepted, 300);
  assert.strictEqual(failed, 200);
  assert.strictEqual(reserve(target, 1), 0);
  book.releaseAmount(ledger, target, failed);
  assert.strictEqual(remaining(target), 200);
  assert.strictEqual(ledger[target.id], accepted);
  assert.strictEqual(reserve(target, 300), 200);
  book.releaseAmount(ledger, target, 100);
  assert.strictEqual(remaining(target), 100);
  assert.strictEqual(reserve(target, 100), 100);
  book.releaseAmount(ledger, target, 500);
  assert.strictEqual(Object.hasOwn(ledger, target.id), false);
  book.releaseAmount(ledger, target, 500);
  assert.strictEqual(remaining(target), 500);
  assert.strictEqual(Object.hasOwn(ledger, target.id), false);
}

// Room boundaries do not split the authority: different IDs stay independent,
// while distinct references to the same object compete in one shared book.
{
  const book = createResourceReservations('energy');
  const home = store('home-buffer', 500, 300);
  const remote = store('remote-buffer', 500, 300);
  const alias = { ...home };
  assert.strictEqual(book.reserveEnergyFrom(home, 400), 400);
  assert.strictEqual(book.reserveEnergyFrom(alias, 400), 100);
  assert.strictEqual(book.reserveEnergyFrom(remote, 400), 400);
  assert.strictEqual(book.getUnreservedEnergy(home), 0);
  assert.strictEqual(book.getUnreservedEnergy(remote), 100);
  assert.strictEqual(book.getUnreservedCapacity(home), 300);
  assert.strictEqual(book.reserveCapacityIn(alias, 250), 250);
  assert.strictEqual(book.reserveCapacityIn(home, 250), 50);
  assert.strictEqual(book.getUnreservedCapacity(remote), 300);
  book.releaseAmount(book.reservedCapacity, alias, 300);
  assert.strictEqual(book.getUnreservedEnergy(home), 0);
  assert.strictEqual(book.getUnreservedEnergy(remote), 100);
}

// The store remains authoritative if stock/capacity changes after admission.
// Queries clamp to zero, and a new tick receives a fresh independent book.
{
  const book = createResourceReservations('energy');
  const target = store('home-changing', 500, 300);
  book.reserveEnergyFrom(target, 400);
  book.reserveCapacityIn(target, 200);
  target.store.energy = 100;
  target.store.free = 50;
  assert.strictEqual(book.getUnreservedEnergy(target), 0);
  assert.strictEqual(book.getUnreservedCapacity(target), 0);
  assert.strictEqual(book.reserveEnergyFrom(target, 50), 0);
  assert.strictEqual(book.reserveCapacityIn(target, 50), 0);
  target.store.energy = 700;
  target.store.free = 500;
  assert.strictEqual(book.getUnreservedEnergy(target), 300);
  assert.strictEqual(book.getUnreservedCapacity(target), 300);
  const nextTick = createResourceReservations('energy');
  assert.strictEqual(nextTick.getUnreservedEnergy(target), 700);
  assert.strictEqual(nextTick.getUnreservedCapacity(target), 500);
  nextTick.reserveEnergyFrom(target, 700);
  assert.strictEqual(book.getUnreservedEnergy(target), 300);
  assert.deepStrictEqual(nextTick.reservedCapacity, {});
}

{
  const book = createResourceReservations('energy');
  const target = store('home-invalid', 500, 300);
  for (const absent of [null, undefined, { id: 'gone' }]) {
    assert.strictEqual(book.getUnreservedEnergy(absent), 0);
    assert.strictEqual(book.getUnreservedCapacity(absent), 0);
    assert.strictEqual(book.reserveEnergyFrom(absent, 100), 0);
    assert.strictEqual(book.reserveCapacityIn(absent, 100), 0);
  }
  for (const amount of [0, -1]) {
    assert.strictEqual(book.reserveEnergyFrom(target, amount), 0);
    assert.strictEqual(book.reserveCapacityIn(target, amount), 0);
    book.releaseAmount(book.reservedEnergy, target, amount);
    book.releaseAmount(book.reservedCapacity, target, amount);
  }
  assert.deepStrictEqual(book.reservedEnergy, {});
  assert.deepStrictEqual(book.reservedCapacity, {});
}

console.log('resource contention conservation, release, identity and tick isolation passed');
