'use strict';

const assert = require('assert');
const { getCollectionRows, decodeExplicitUser } =
  require('./diagnostic.database');

const database = { collections: [
  { name: 'env', data: [{ data: { gameTime: 77,
    'memory:requested': JSON.stringify({ rooms: { W1N1: {} } }),
    'memory:other': JSON.stringify({ rooms: { W2N2: {} } }) } }] },
  { name: 'rooms.objects', data: [{ type: 'creep', user: 'requested' }] },
  { name: 'unrelated', data: [{ keep: true }] }
] };
const before = JSON.stringify(database);
const decoded = decodeExplicitUser(database, 'requested');
assert.strictEqual(decoded.tick, 77);
assert.deepStrictEqual(decoded.memory, { rooms: { W1N1: {} } });
assert.strictEqual(decoded.objects, database.collections[1].data);
assert.strictEqual(JSON.stringify(database), before, 'decoding is read-only');
assert.deepStrictEqual(getCollectionRows(database, 'missing'), []);
assert.deepStrictEqual(getCollectionRows({ collections: [
  { name: 'env' }
] }, 'env'), []);
const malformedRows = { not: 'an array' };
assert.strictEqual(getCollectionRows({ collections: [
  { name: 'rooms.objects', data: malformedRows }
] }, 'rooms.objects'), malformedRows,
'the adapter preserves malformed truthy collection data for caller errors');
assert.throws(() => decodeExplicitUser(database, ''), /explicit user/);
assert.throws(() => decodeExplicitUser({ collections: [] }, 'requested'),
  /authoritative tick/);
assert.throws(() => decodeExplicitUser({ collections: [{ name: 'env',
  data: [{ data: { gameTime: 1 } }] }] }, 'requested'), /user memory/);
const malformed = structuredClone(database);
malformed.collections[0].data[0].data['memory:requested'] = '{';
assert.throws(() => decodeExplicitUser(malformed, 'requested'), SyntaxError);
assert.throws(() => decodeExplicitUser(malformed, 'requested', {
  beforeMemoryDecode: ({ tick }) => {
    assert.strictEqual(tick, 77);
    throw Error('evidence first');
  }
}), /evidence first/, 'caller evidence validation precedes JSON parsing');
const invalidTick = structuredClone(database);
invalidTick.collections[0].data[0].data.gameTime = 1.5;
assert.throws(() => decodeExplicitUser(invalidTick, 'requested'), /tick/);

const { captureSupply } = require('./controller.supply');
const duplicateController = structuredClone(database);
duplicateController.collections[1].data.push(
  { type: 'controller', _id: 'first', user: 'requested', room: 'W1N1' },
  { type: 'controller', _id: 'second', user: 'requested', room: 'W1N1' });
assert.throws(() => captureSupply(duplicateController, 'requested'),
  /Ambiguous room controller/);

console.log('explicit-user database decoding is isolated and read-only');
