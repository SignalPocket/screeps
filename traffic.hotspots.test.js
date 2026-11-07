'use strict';
const assert = require('assert/strict');
const { analyzeTraffic } = require('./traffic.hotspots');
const sample = (tick, eventTick = tick, extra = {}) => ({tick, roles: [{
  name: 'worker', room: 'A', x: 4, y: 5, fatigue: 0,
  memory: { role: 'hauler', navLastTick: tick, navGoal: 'goal',
    navRecovery: {tick: eventTick, reason: 'blocked', room: 'A', x: 4,
      y: 5, result: 0, stuck: 3}}, ...extra
}]});
const input = [sample(10), sample(11, 10), sample(12)];
const saved = JSON.stringify(input);
const result = analyzeTraffic(input);
assert.equal(JSON.stringify(input), saved);
assert.equal(result.hotspots[0].events, 2, 'stale recovery is deduplicated');
assert.equal(result.hotspots[0].recurring, true);
assert.equal(result.hotspots[0].acceptedIntents, 2);
assert.equal(result.hotspots[0].maxObservedStationaryTicks, 2);
assert.equal(analyzeTraffic([sample(10), sample(50, 10)]).hotspots[0].maxObservedStationaryTicks, 0);
assert.equal(analyzeTraffic([sample(10, 10, {fatigue: 1})]).hotspots.length, 0);
assert.equal(analyzeTraffic([sample(10, 9, {fatigue: 1})]).hotspots.length, 1);
assert.equal(analyzeTraffic([sample(10, 11)]).hotspots.length, 0);
assert.equal(analyzeTraffic([sample(300, 1)]).hotspots.length, 0);
assert.equal(analyzeTraffic([{tick: 5, roles: [{memory: {wait: 'work'}}]}]).hotspots.length, 0);
const oscillation = sample(20);
Object.assign(oscillation.roles[0].memory.navRecovery, {reason: 'oscillation', result: -2});
assert.equal(analyzeTraffic([oscillation]).hotspots[0].failedIntents, 1);
assert.equal(analyzeTraffic([oscillation]).hotspots[0].maxObservedStationaryTicks, 0);
const changedGoal = sample(11);
changedGoal.roles[0].memory.navGoal = 'other';
assert.equal(analyzeTraffic([sample(10), changedGoal]).hotspots[0].maxObservedStationaryTicks, 0);
const deferred = sample(11);
deferred.roles[0].memory.navLastTick = 10;
assert.equal(analyzeTraffic([sample(10), deferred]).hotspots[0].maxObservedStationaryTicks, 0);
const moved = sample(11);
moved.roles[0].x = 6;
assert.equal(analyzeTraffic([sample(10), moved]).hotspots[0].maxObservedStationaryTicks, 0);
const crowded = sample(10);
crowded.roles = Array.from({length: 205}, (_, i) => ({...crowded.roles[0], name: String(i)}));
assert.equal(analyzeTraffic([crowded]).hotspots[0].creeps.length, 200);
assert.equal(analyzeTraffic([crowded]).truncated, true);
const manyTiles = Array.from({length: 40}, (_, i) => {
  const s = sample(i);
  s.roles[0].memory.navRecovery.x = i;
  return s;
});
assert.equal(analyzeTraffic(manyTiles).hotspots.length, 30);
assert.equal(analyzeTraffic(manyTiles).truncated, true);
assert.equal(analyzeTraffic(Array.from({length: 130}, (_, i) => sample(i))).snapshots, 120);
assert.equal(analyzeTraffic(Array.from({length: 130}, (_, i) => sample(i))).truncated, true);
assert.deepEqual(analyzeTraffic([]).hotspots, []);
console.log('traffic hotspot evidence boundaries passed');
