'use strict';

const assert = require('assert');
const { assignmentJobKey, authorizeSpawnAssignment } =
  require('./spawn.authority');

const job = (key, coverageCount, min) => ({ key, coverageCount, min });
const plan = jobs => ({ jobs, baselineGap: null });

assert.strictEqual(assignmentJobKey({ role: 'builder',
  builderScope: 'outpost' }), 'remoteBuilder');
assert.strictEqual(assignmentJobKey({ role: 'builder',
  builderScope: 'outpost', builderMission: 'maintenance',
  remoteRoom: 'W8N3', remoteBuilderSlot: 1 }), 'remoteBuilder');
assert.strictEqual(assignmentJobKey({ role: 'builder',
  builderMission: 'repair' }), 'repairBuilder');

const localGap = plan({
  hauler: job('hauler', 1, 2),
  rebalancer: job('rebalancer', 0, 1),
  remoteMiner: job('remoteMiner', 5, 6)
});
let result = authorizeSpawnAssignment({
  assignment: { role: 'remote-miner' }, staffingPlan: localGap
});
assert.strictEqual(result.authorized, false);
assert.strictEqual(result.phase, 'local-minimum');
assert.match(result.reason, /rebalancer precedes remoteMiner/);

result = authorizeSpawnAssignment({
  assignment: { role: 'rebalancer' }, staffingPlan: localGap
});
assert.strictEqual(result.authorized, true);
assert.strictEqual(result.phase, 'local-minimum');

const defenseGap = plan({
  defender: job('defender', 0, 1),
  remoteHauler: job('remoteHauler', 0, 3)
});
result = authorizeSpawnAssignment({
  assignment: { role: 'remote-hauler' }, staffingPlan: defenseGap
});
assert.strictEqual(result.authorized, false);
assert.match(result.reason, /defender precedes remoteHauler/);

const remoteGap = plan({
  hauler: job('hauler', 2, 2),
  remoteMiner: job('remoteMiner', 5, 6),
  remoteHauler: job('remoteHauler', 3, 3)
});
result = authorizeSpawnAssignment({
  assignment: { role: 'controller-relay' }, staffingPlan: remoteGap
});
assert.strictEqual(result.authorized, false);
assert.match(result.reason, /remoteMiner precedes controller-relay/);

result = authorizeSpawnAssignment({
  assignment: { role: 'controller-relay', brigadeMaintenance: true },
  staffingPlan: remoteGap
});
assert.strictEqual(result.authorized, true,
  'active brigade maintenance precedes ordinary remote roster gaps');
assert.strictEqual(result.phase, 'stage-capability');

result = authorizeSpawnAssignment({
  assignment: { role: 'controller-relay', brigadeMaintenance: true },
  staffingPlan: localGap
});
assert.strictEqual(result.authorized, false,
  'brigade maintenance cannot bypass a local minimum');
assert.match(result.reason, /rebalancer precedes controller-relay/);

result = authorizeSpawnAssignment({
  assignment: { role: 'controller-relay', brigadeMaintenance: true },
  staffingPlan: plan({ repairBuilder: job('repairBuilder', 0, 2) })
});
assert.strictEqual(result.authorized, true,
  'established brigade maintenance outranks optional repair staffing');
assert.match(result.reason, /brigade maintenance before optional work/);

result = authorizeSpawnAssignment({
  assignment: { role: 'remote-miner' }, staffingPlan: remoteGap
});
assert.strictEqual(result.authorized, true);
assert.strictEqual(result.phase, 'remote-minimum');

const builderFirstRemoteGap = plan({
  remoteBuilder: job('remoteBuilder', 3, 9),
  remoteMiner: job('remoteMiner', 5, 6),
  remoteHauler: job('remoteHauler', 3, 3)
});
result = authorizeSpawnAssignment({
  assignment: { role: 'remote-miner', remoteRoom: 'W8N4',
    remoteSlot: 0, replacementDeadline: 12 },
  staffingPlan: builderFirstRemoteGap
});
assert.strictEqual(result.authorized, true,
  'a due established miner replacement cannot be frozen by a builder ratio');
assert.match(result.reason, /due remoteMiner replacement/);

const emptyCarrierGap = plan({
  remoteMiner: job('remoteMiner', 4, 6),
  remoteHauler: job('remoteHauler', 0, 3)
});
result = authorizeSpawnAssignment({
  assignment: { role: 'remote-miner', remoteRoom: 'W7N3',
    remoteSlot: 1, replacementDeadline: -20 },
  staffingPlan: emptyCarrierGap
});
assert.strictEqual(result.authorized, false,
  'a due miner cannot bypass a completely empty remote carrier minimum');
assert.match(result.reason, /remote minimum remoteHauler/);

result = authorizeSpawnAssignment({
  assignment: { role: 'remote-reserver', remoteRoom: 'W8N3',
    reservationDeadline: 80 }, staffingPlan: localGap
});
assert.strictEqual(result.authorized, false,
  'an expiring reservation cannot outrank home minimum recovery');
const builderOnlyGap = plan({ repairBuilder: job('repairBuilder', 0, 1) });
result = authorizeSpawnAssignment({
  assignment: { role: 'remote-reserver', remoteRoom: 'W8N3',
    reservationDeadline: 80 }, staffingPlan: builderOnlyGap
});
assert.strictEqual(result.authorized, true,
  'an expiring established reservation outranks optional local repair staffing');
assert.strictEqual(result.phase, 'reservation-emergency');
result = authorizeSpawnAssignment({
  assignment: { role: 'remote-reserver', remoteRoom: 'W8N3',
    reservationDeadline: 80 }, staffingPlan: {
      ...plan({ source: job('source', 0, 2) }),
      baselineGap: { role: 'upgrader' }
    }
});
assert.strictEqual(result.authorized, false,
  'an expiring reservation cannot outrank baseline recovery');

const baseline = plan({ source: job('source', 0, 2) });
baseline.baselineGap = { role: 'upgrader' };
result = authorizeSpawnAssignment({
  assignment: { role: 'refiller' }, staffingPlan: baseline
});
assert.strictEqual(result.authorized, false);
assert.match(result.reason, /baseline upgrader/);

const builderBaseline = plan({
  builder: job('builder', 0, 1),
  repairBuilder: job('repairBuilder', 0, 1)
});
builderBaseline.baselineGap = { role: 'builder' };
result = authorizeSpawnAssignment({
  assignment: { role: 'builder', builderScope: 'local',
    builderMission: 'repair' }, staffingPlan: builderBaseline
});
assert.strictEqual(result.authorized, true,
  'a local repair builder satisfies the baseline builder-fixer capability');
result = authorizeSpawnAssignment({
  assignment: { role: 'builder', builderScope: 'outpost' },
  staffingPlan: builderBaseline
});
assert.strictEqual(result.authorized, false,
  'a remote builder cannot satisfy the local baseline builder-fixer slot');

baseline.jobs.defender = job('defender', 0, 1);
result = authorizeSpawnAssignment({
  assignment: { role: 'defender', emergencyDefense: true },
  staffingPlan: baseline
});
assert.strictEqual(result.authorized, true,
  'an active-threat defender bypasses baseline and zero-minimum gates');
assert.strictEqual(result.phase, 'emergency-defense');
result = authorizeSpawnAssignment({
  assignment: { role: 'remote-miner', emergencyPresence: true },
  staffingPlan: baseline
});
assert.strictEqual(result.authorized, false,
  'an unoccupied outpost cannot outrank baseline recovery');
result = authorizeSpawnAssignment({
  assignment: { role: 'remote-miner', emergencyPresence: true },
  staffingPlan: plan({})
});
assert.strictEqual(result.authorized, true,
  'outpost presence still precedes ordinary remote staffing gaps');
assert.strictEqual(result.phase, 'room-presence');
assert.strictEqual(authorizeSpawnAssignment({
  assignment: { role: 'defender' },
  staffingPlan: plan({ defender: job('defender', 1, 1) })
}).authorized, true);

assert.deepStrictEqual(authorizeSpawnAssignment({ assignment: null,
  staffingPlan: plan({}) }).phase, 'idle');

const mainSource = require('fs').readFileSync(require.resolve('./main'), 'utf8');
const minimumIndex = mainSource.indexOf('    const minimumPlan = planMinimumSpawn({');
const brigadeMaintenanceIndex = mainSource.indexOf(
  "    if (replacementMode === 'maintenance' && controllerRelayRequest &&");
const urgentReservationIndex = mainSource.indexOf(
  '    const urgentReservationRequest = planReservationSpawn({');
const outpostPresenceIndex = mainSource.indexOf(
  '    const outpostPresence = getOutpostPresenceGap(');
assert(mainSource.includes('reservationDeadline: proposedAssignment &&'),
  'spawn decisions retain the expiring reservation deadline for diagnosis');
assert(/population:\s*workers\.length,\s*populationLimit,/.test(mainSource),
  'spawn decisions retain the active population budget for diagnosis');
assert(mainSource.includes('populationTransitionAllowance,'),
  'spawn decisions retain the transition allowance behind the population budget');
assert(mainSource.includes('activeBrigadeCount,'),
  'spawn decisions retain brigade occupancy behind the population budget');
assert(mainSource.includes('controllerBrigadeBudgeted,'),
  'spawn decisions distinguish funded brigade capacity from aging bodies');
assert(minimumIndex >= 0 && minimumIndex < urgentReservationIndex &&
  minimumIndex < outpostPresenceIndex,
  'home minimum recovery precedes remote reservation and presence requests');
assert(brigadeMaintenanceIndex >= 0 &&
  brigadeMaintenanceIndex < minimumIndex,
  'established atomic brigade restoration precedes optional local builders');
const emptyRemoteMinimumIndex = mainSource.indexOf(
  '    if (remoteMinimumRequest && remoteMinimumJob &&');
const expiringRemoteMinerIndex = mainSource.indexOf(
  '    const expiringRemoteMiner = !coreIncomeGap &&');
assert(emptyRemoteMinimumIndex >= 0 &&
  emptyRemoteMinimumIndex < expiringRemoteMinerIndex,
  'an empty remote minimum lane is restored before due remote replacement');

console.log('spawn authority rejects every cross-phase priority bypass');
