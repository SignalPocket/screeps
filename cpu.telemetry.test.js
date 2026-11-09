'use strict';

const assert = require('assert');
const { STAGES, PLANNING_STAGES, OBSERVATION_STAGES, createCpuStageRecorder,
  updateCpuPerformanceWindow } =
  require('./cpu.telemetry');

const samples = [2, 8, 18, 25, 31];
const recorder = createCpuStageRecorder(() => samples.shift());
assert.strictEqual(recorder.mark('planning'), 6);
assert.strictEqual(recorder.mark('creeps'), 10);
assert.strictEqual(recorder.mark('defense'), 7);
assert.strictEqual(recorder.mark('reporting'), 6);
assert.deepStrictEqual(recorder.snapshot(), {
  planning: 6, creeps: 10, defense: 7, reporting: 6
});

const planningSamples = [1, 5, 12, 20, 31];
const planningRecorder = createCpuStageRecorder(() =>
  planningSamples.shift());
assert.strictEqual(planningRecorder.mark('observation'), 4);
assert.strictEqual(planningRecorder.mark('workforce'), 7);
assert.strictEqual(planningRecorder.mark('infrastructure'), 8);
assert.strictEqual(planningRecorder.mark('dispatch'), 11);
assert.strictEqual(planningRecorder.aggregate('planning', PLANNING_STAGES),
  30);
assert.deepStrictEqual(planningRecorder.snapshot(), {
  planning: 30, observation: 4, workforce: 7,
  infrastructure: 8, dispatch: 11
});
assert.strictEqual(planningRecorder.aggregate('planning',
  ['observation', 'missing']), null);

const observationSamples = [2, 9, 20, 35];
const observationRecorder = createCpuStageRecorder(() =>
  observationSamples.shift());
assert.strictEqual(observationRecorder.mark('combat'), 7);
assert.strictEqual(observationRecorder.mark('roomPolicy'), 11);
assert.strictEqual(observationRecorder.mark('remotePlanning'), 15);
assert.strictEqual(observationRecorder.aggregate('observation',
  OBSERVATION_STAGES), 33);
assert.deepStrictEqual(observationRecorder.snapshot(), {
  observation: 33, combat: 7, roomPolicy: 11, remotePlanning: 15
});

const missing = createCpuStageRecorder(undefined);
assert.strictEqual(missing.mark('planning'), null);
assert.deepStrictEqual(missing.snapshot(), {});
const backwards = createCpuStageRecorder((() => {
  const values = [10, 8];
  return () => values.shift();
})());
assert.strictEqual(backwards.mark('planning'), 0);

const original = { version: 1, current: {
  bucket: 100, samples: 1, total: 20, maximum: 20,
  stageTotals: { planning: 5, creeps: 10, defense: 3, reporting: 2 }
} };
const updated = updateCpuPerformanceWindow({
  performance: original, tick: 101, total: 30,
  stages: { planning: 8, creeps: 15, defense: 4, reporting: 3 }
});
assert.notStrictEqual(updated, original);
assert.deepStrictEqual(original.current.stageTotals,
  { planning: 5, creeps: 10, defense: 3, reporting: 2 });
assert.deepStrictEqual(updated.current, {
  bucket: 100, samples: 2, total: 50, maximum: 30,
  stageTotals: { planning: 13, creeps: 25, defense: 7, reporting: 5,
    observation: 0, workforce: 0, infrastructure: 0, dispatch: 0,
    combat: 0, roomPolicy: 0, remotePlanning: 0 }
});
assert.deepStrictEqual(updated.lastStages,
  { planning: 8, creeps: 15, defense: 4, reporting: 3 });

const rolled = updateCpuPerformanceWindow({
  performance: updated, tick: 120, total: 12,
  stages: { planning: 3, creeps: 5, defense: 2, reporting: 2 }
});
assert.deepStrictEqual(rolled.previous, {
  bucket: 100, samples: 2, average: 25, maximum: 30,
  stages: { planning: 6.5, creeps: 12.5, defense: 3.5, reporting: 2.5,
    observation: 0, workforce: 0, infrastructure: 0, dispatch: 0,
    combat: 0, roomPolicy: 0, remotePlanning: 0 }
});
assert.deepStrictEqual(rolled.current.stageTotals,
  { planning: 3, creeps: 5, defense: 2, reporting: 2,
    observation: 0, workforce: 0, infrastructure: 0, dispatch: 0,
    combat: 0, roomPolicy: 0, remotePlanning: 0 });
assert.deepStrictEqual(Object.keys(rolled.previous.stages), STAGES);

assert.strictEqual(updateCpuPerformanceWindow({
  performance: original, tick: 121, total: NaN, stages: {}
}), original);
assert.strictEqual(updateCpuPerformanceWindow({
  performance: original, tick: 121, total: 2, stages: {}, interval: 0
}), original);
const sanitized = updateCpuPerformanceWindow({
  performance: undefined, tick: 1, total: 4,
  stages: { planning: NaN, creeps: -1, defense: 2 }
});
assert.deepStrictEqual(sanitized.lastStages, { defense: 2 });
for (const value of Object.values(sanitized.current.stageTotals)) {
  assert(Number.isFinite(value));
}

console.log('bounded CPU stage attribution passed');
