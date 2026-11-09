'use strict';

const assert = require('assert');
const { evaluateControllerBrigadeReadiness } =
  require('./controller.brigade.readiness');
const { selectControllerBrigadeReplacementMode } =
  require('./controller.brigade.readiness');
const { shouldRestoreBrigadeBeforeRemoteDefense } =
  require('./controller.brigade.readiness');
const { shouldDeferRemoteDefenseForHomeRecovery } =
  require('./controller.brigade.readiness');
const { getEmergencyDefenderRequirement } =
  require('./controller.brigade.readiness');

const jobs = {
  source: { min: 2, coverageCount: 2 },
  refiller: { min: 1, coverageCount: 1 },
  hauler: { min: 1, coverageCount: 1 },
  upgrader: { min: 1, coverageCount: 1 },
  repairBuilder: { min: 1, coverageCount: 1 }
};
const ready = evaluateControllerBrigadeReadiness({ signals: {
  buildRemaining: 5000, repairRemaining: 10000, repairCritical: false
} }, { jobs });
assert.strictEqual(ready.ready, true);

const busy = evaluateControllerBrigadeReadiness({ signals: {
  buildRemaining: 5001, repairRemaining: 10001, repairCritical: true
} }, { jobs: { ...jobs, source: { min: 2, coverageCount: 1 } } });
assert.strictEqual(busy.ready, false);
assert.deepStrictEqual(busy.blockers, [
  'critical repairs', 'build backlog 5001', 'repair backlog 10001',
  'source staffing 1/2'
]);
assert.strictEqual(busy.maintenanceReady, false);
assert.deepStrictEqual(busy.maintenanceBlockers,
  ['source staffing 1/2']);

const repairCrisisOnly = evaluateControllerBrigadeReadiness({ signals: {
  buildRemaining: 0, repairRemaining: 200000, repairCritical: true
} }, { jobs });
assert.strictEqual(repairCrisisOnly.maintenanceReady, true,
  'critical repairs do not pause an established atomic brigade');

const recovery = evaluateControllerBrigadeReadiness({ signals: {
  buildRemaining: 33982, repairRemaining: 100, repairCritical: false
} }, { jobs: {
  ...jobs,
  refiller: { min: 2, coverageCount: 1 },
  hauler: { min: 2, coverageCount: 1 },
  repairBuilder: { min: 1, coverageCount: 0 },
  remoteMiner: { min: 6, coverageCount: 4 },
  remoteHauler: { min: 3, coverageCount: 1 }
} });
assert.strictEqual(recovery.ready, false);
assert.strictEqual(recovery.maintenanceReady, true);
assert.deepStrictEqual(recovery.maintenanceBlockers, []);

const missingMaintenanceLane = evaluateControllerBrigadeReadiness({ signals: {
  buildRemaining: 0, repairRemaining: 0, repairCritical: false
} }, { jobs: {
  ...jobs,
  refiller: { min: 2, coverageCount: 0 },
  hauler: { min: 2, coverageCount: 1 }
} });
assert.strictEqual(missingMaintenanceLane.maintenanceReady, false);
assert.deepStrictEqual(missingMaintenanceLane.maintenanceBlockers,
  ['refiller staffing 0/1']);

const noControllerWorker = evaluateControllerBrigadeReadiness({ signals: {
  buildRemaining: 0, repairRemaining: 0, repairCritical: false
} }, { jobs: { ...jobs, upgrader: { min: 1, coverageCount: 0 } } });
assert.strictEqual(noControllerWorker.ready, false);
assert.deepStrictEqual(noControllerWorker.blockers,
  ['upgrader staffing 0/1']);
assert.strictEqual(noControllerWorker.maintenanceReady, false);
assert.deepStrictEqual(noControllerWorker.maintenanceBlockers,
  ['upgrader staffing 0/1']);

assert.strictEqual(selectControllerBrigadeReplacementMode({
  permitted: false, ready: false, maintenanceReady: true,
  established: true, activeCount: 13, rcl: 5
}), 'maintenance', 'an established partial line is repaired atomically');
assert.strictEqual(selectControllerBrigadeReplacementMode({
  permitted: false, ready: false, maintenanceReady: true,
  established: true, activeCount: 0, rcl: 5
}), 'paused', 'health permission still gates starting an absent line');
assert.strictEqual(selectControllerBrigadeReplacementMode({
  permitted: false, ready: false, maintenanceReady: true,
  established: true, activeCount: 0, operationActive: true, rcl: 5
}), 'maintenance',
'an explicitly active operation can recover its established line from zero');
assert.strictEqual(selectControllerBrigadeReplacementMode({
  permitted: true, ready: true, maintenanceReady: true,
  established: false, activeCount: 0, rcl: 5
}), 'full');

assert.strictEqual(shouldRestoreBrigadeBeforeRemoteDefense({
  homeRoom: 'W7N4', threatRoom: 'W8N4', activeCount: 3,
  targetCount: 17, maintenanceReady: true
}), true, 'a partial established brigade is restored before remote defense churn');
assert.strictEqual(shouldRestoreBrigadeBeforeRemoteDefense({
  homeRoom: 'W7N4', threatRoom: 'W7N4', activeCount: 3,
  targetCount: 17, maintenanceReady: true
}), false, 'home defense still precedes brigade restoration');
assert.strictEqual(shouldRestoreBrigadeBeforeRemoteDefense({
  homeRoom: 'W7N4', threatRoom: 'W8N4', activeCount: 3,
  targetCount: 17, maintenanceReady: false
}), false, 'missing core survival staffing still blocks brigade restoration');
assert.strictEqual(shouldDeferRemoteDefenseForHomeRecovery({
  homeRoom: 'W7N4', threatRoom: 'W8N4', maintenanceReady: false
}), true, 'remote defense cannot outrank missing home survival staffing');
assert.strictEqual(shouldDeferRemoteDefenseForHomeRecovery({
  homeRoom: 'W7N4', threatRoom: 'W7N4', maintenanceReady: false
}), false, 'a home-room threat remains absolute during recovery');
assert.strictEqual(shouldDeferRemoteDefenseForHomeRecovery({
  homeRoom: 'W7N4', threatRoom: 'W8N3', maintenanceReady: false,
  exposedFriendly: true
}), false, 'a visible civilian in danger overrides home recovery');
assert.strictEqual(shouldRestoreBrigadeBeforeRemoteDefense({
  homeRoom: 'W7N4', threatRoom: 'W8N3', maintenanceReady: true,
  activeCount: 3, targetCount: 17, exposedFriendly: true
}), false, 'an exposed civilian overrides partial-brigade restoration');
assert.strictEqual(getEmergencyDefenderRequirement(1, 1), 1);
assert.strictEqual(getEmergencyDefenderRequirement(5, 1), 5,
  'five visible enemies sustain five bounded defense slots');
assert.strictEqual(getEmergencyDefenderRequirement(20, 1), 5,
  'emergency combat coverage cannot consume the whole colony');

const mainSource = require('fs').readFileSync(require.resolve('./main'),
  'utf8');
assert.match(mainSource,
  /replacementMode === 'maintenance' \|\|\s+isBrigadePlanActive/,
  'established maintenance does not depend on the new-operation active gate');
assert.match(mainSource,
  /readiness\.replacementMode === 'maintenance'\) return true/,
  'population budgeting retains an established maintenance line');
assert.match(mainSource,
  /controllerBrigadeReplacementMode:[\s\S]*replacementMode/,
  'final spawn decisions preserve the brigade mode used by selection');
assert.match(mainSource,
  /controllerRelaySlot: proposedAssignment[\s\S]*controllerRelaySlot/,
  'final spawn decisions preserve the selected relay slot');
assert.match(mainSource,
  /controllerBrigadeMaintenanceBlockers:[\s\S]*maintenanceBlockers/,
  'final spawn decisions retain the blockers that prevented maintenance');
assert.match(mainSource,
  /combatStatus\.requiredDefenders = requiredDefenders/,
  'scaled emergency coverage is published to the execution garrison');
assert.match(mainSource,
  /exposedFriendly = targets\.length > 1/,
  'a multi-hostile squad sustains coverage after civilians leave');
assert.match(mainSource,
  /last-known-\$\{roomName\}/,
  'an unseen persisted fight retains an explicitly stale threat marker');
assert.match(mainSource,
  /rapidDefense: target\.requiredDefenders > 1/,
  'a hostile squad requests rapid response bodies');
const spawnPolicySource = require('fs').readFileSync(
  require.resolve('./spawn.policy'), 'utf8');
assert.match(spawnPolicySource,
  /assignment\.rapidDefense \? 300/,
  'rapid defenders and healers are capped at 300 energy');

console.log('controller brigade readiness scenarios passed');
