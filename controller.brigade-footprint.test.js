'use strict';

const assert = require('assert');
const { getBrigadeProtectedFootprint } =
  require('./controller.brigade-footprint');

assert.deepStrictEqual([...getBrigadeProtectedFootprint(null)], []);
assert.deepStrictEqual([...getBrigadeProtectedFootprint({})], []);
const plan = {
  segments: [
    { pickup: { x: 10, y: 11 }, delivery: { x: 12, y: 11 } },
    { pickup: { x: 10, y: 11 } },
    null,
    { delivery: { x: 14, y: 11 } }
  ],
  rightOfWay: [
    { x: 11, y: 11 }, { x: 12, y: 11 },
    { x: Number.NaN, y: 1 }, null
  ]
};
assert.deepStrictEqual([...getBrigadeProtectedFootprint(plan)].sort(),
  ['10:11', '11:11', '12:11', '14:11']);
const roomA = getBrigadeProtectedFootprint({ rightOfWay: [{ x: 1, y: 2 }] });
const roomB = getBrigadeProtectedFootprint({ rightOfWay: [{ x: 3, y: 4 }] });
assert.deepStrictEqual([...roomA], ['1:2']);
assert.deepStrictEqual([...roomB], ['3:4']);
assert.notStrictEqual(roomA, roomB, 'rooms receive isolated footprints');

console.log('brigade protected footprint handles bounds, gaps and duplicates');
