'use strict';

const assert = require('assert');
const fs = require('fs');
const { deriveCpuPolicy, shouldRenderPlanningVisuals,
  shouldPrepareRoadPlan, selectDispatchPlanningCreeps } =
  require('./cpu.policy');

assert.deepStrictEqual(deriveCpuPolicy(undefined), {
  bucket: null, mode: 'normal', allowSlowPlanning: true,
  executionCpuRatio: 0.8, minimumExecutionCreeps: null,
  fairExecutionLimit: 1, fairExecutionInterval: 5,
  fairDeferralThreshold: 10
});
assert.strictEqual(deriveCpuPolicy(500).mode, 'recovery');
assert.strictEqual(deriveCpuPolicy(500).allowSlowPlanning, false);
assert.strictEqual(deriveCpuPolicy(500).executionCpuRatio, 0.65);
assert.strictEqual(deriveCpuPolicy(500).minimumExecutionCreeps, 8);
assert.strictEqual(deriveCpuPolicy(500).fairExecutionLimit, 0);
assert.strictEqual(deriveCpuPolicy(1000).mode, 'constrained');
assert.strictEqual(deriveCpuPolicy(1000).executionCpuRatio, 0.75);
assert.strictEqual(deriveCpuPolicy(1000).fairExecutionLimit, 1);
assert.strictEqual(deriveCpuPolicy(3000).mode, 'normal');
assert.strictEqual(deriveCpuPolicy(3000).executionCpuRatio, 0.8);
assert.strictEqual(deriveCpuPolicy(3000).fairExecutionInterval, 5);
assert.strictEqual(shouldRenderPlanningVisuals({
  tick: 120, allowSlowPlanning: true
}), true);
assert.strictEqual(shouldRenderPlanningVisuals({
  tick: 121, allowSlowPlanning: true
}), false);
assert.strictEqual(shouldRenderPlanningVisuals({
  tick: 120, allowSlowPlanning: false
}), false);
assert.strictEqual(shouldRenderPlanningVisuals({
  tick: 120, allowSlowPlanning: true, interval: 0
}), false);
assert.strictEqual(shouldRenderPlanningVisuals({
  tick: 120.5, allowSlowPlanning: true
}), false);
assert.strictEqual(shouldPrepareRoadPlan({
  renderPlanningVisuals: true, roadPlacementDue: false
}), true);
assert.strictEqual(shouldPrepareRoadPlan({
  renderPlanningVisuals: false, roadPlacementDue: true
}), true);
assert.strictEqual(shouldPrepareRoadPlan({
  renderPlanningVisuals: true, roadPlacementDue: true
}), true);
assert.strictEqual(shouldPrepareRoadPlan({
  renderPlanningVisuals: false, roadPlacementDue: false
}), false);
const dispatchCandidates = [{ name: 'protected' }, { name: 'fair' },
  { name: 'rotating-a' }, { name: 'rotating-b' }];
assert.deepStrictEqual(selectDispatchPlanningCreeps({
  creeps: dispatchCandidates, guaranteedCount: 2, used: 75, ceiling: 75
}), dispatchCandidates.slice(0, 2));
assert.deepStrictEqual(selectDispatchPlanningCreeps({
  creeps: dispatchCandidates, guaranteedCount: 2, used: 74.99, ceiling: 75
}), dispatchCandidates);
assert.deepStrictEqual(selectDispatchPlanningCreeps({
  creeps: dispatchCandidates, guaranteedCount: 2, used: 100, ceiling: null
}), dispatchCandidates);
assert.deepStrictEqual(selectDispatchPlanningCreeps({
  creeps: dispatchCandidates, guaranteedCount: 99, used: 80, ceiling: 75
}), dispatchCandidates);
assert.deepStrictEqual(dispatchCandidates.map(creep => creep.name),
  ['protected', 'fair', 'rotating-a', 'rotating-b']);
assert.match(fs.readFileSync(require.resolve('./main'), 'utf8'),
  /'claimer', 'remote-reserver', 'defender', 'retire',\s+CONTROLLER_BRIGADE_ROLE/,
  'claimers and remote reservers remain in the CPU-protected execution set');
assert.match(fs.readFileSync(require.resolve('./main'), 'utf8'),
  /cpuPolicy\.mode === 'recovery' && Game\.cpu\.bucket < 250/,
  'an empty-bucket emergency yields before broad per-tick scans');
assert.match(fs.readFileSync(require.resolve('./main'), 'utf8'),
  /optionalReportingCpuAvailable\(\)/,
  'scheduled diagnostics respect the remaining normal-mode CPU reserve');
const main = fs.readFileSync(require.resolve('./main'), 'utf8');
assert.match(main,
  /const renderPlanningVisuals = shouldRenderPlanningVisuals\(/,
  'one cadence decision synchronizes every road-planning visual layer');
assert.match(main,
  /if \(renderPlanningVisuals\) drawRoadNetwork/,
  'the shared network visual is cadence-gated');
assert.match(main,
  /if \(renderPlanningVisuals\) \{\s+drawInterRoomRoadLinks\(room\);\s+drawRoadPlan/,
  'room and inter-room planning visuals share the same cadence gate');
assert.match(main,
  /if \(renderPlanningVisuals\) \{[\s\S]{0,1400}drawTravelPaths\(relatedRoom/,
  'related-room travel visuals share the same cadence gate');
assert.match(main,
  /runLinks\(room\);\s+const roadPlacementDue = allowSlowPlanning &&\s+scheduledRoomTick\(room, 20\);\s+if \(!shouldPrepareRoadPlan/,
  'links run before unused path preparation is skipped');
assert.match(main,
  /const dispatchPlanningCreeps = selectDispatchPlanningCreeps\([\s\S]{0,600}dispatchPlanningNames\.has\(c\.name\)/,
  'pickup planning excludes only the guaranteed-deferred execution suffix');
const observationEnd = main.indexOf("  cpuStages.mark('remotePlanning');");
const observationSource = main.slice(0, observationEnd);
assert.strictEqual((observationSource.match(/Object\.values\(Game\.creeps\)/g) || [])
  .length, 1, 'observation builds the per-tick creep roster once');
assert.strictEqual((observationSource.match(/Object\.values\(Game\.rooms\)/g) || [])
  .length, 1, 'observation builds the per-tick visible-room roster once');
assert.match(observationSource,
  /const tickCreeps = Object\.values\(Game\.creeps\);\s+const tickRooms = Object\.values\(Game\.rooms\);/,
  'stable per-tick rosters are created only after the emergency guard');
const executableRosterSource = main.replace(
  /\/\/  for\(const room of Object\.values\(Game\.rooms\) compatibility extraction marker/,
  '');
assert.strictEqual((executableRosterSource.match(/Object\.values\(Game\.creeps\)/g) || [])
  .length, 1, 'the complete loop builds the per-tick creep roster once');
assert.strictEqual((executableRosterSource.match(/Object\.values\(Game\.rooms\)/g) || [])
  .length, 1, 'the complete loop builds the visible-room roster once');

console.log('CPU policy scenarios passed');
