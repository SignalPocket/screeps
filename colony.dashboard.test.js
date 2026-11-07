'use strict';

const assert = require('assert');
const { calculateStaffingDemand, getStaffingStatus, formatRoleEntry,
  countBrigadeMembers, getDashboardVisualLines, formatDashboardConsole } =
  require('./colony.dashboard');

const demand = calculateStaffingDemand({
  // Two refillers exist, but only one covers the two required clusters.
  refiller: { count: 2, coverageCount: 1, min: 2, desired: 2 },
  // Both local sources are covered, but the desired WORK capacity is short.
  source: { count: 2, coverageCount: 2, min: 2, desired: 6 },
  // Surplus jobs must not erase shortages in other jobs.
  hauler: { count: 4, coverageCount: 4, min: 2, desired: 3 }
});

assert.deepStrictEqual(demand, {
  minimum: 1,
  desired: 4,
  total: 5
});

const overlappingGap = calculateStaffingDemand({
  refiller: { count: 0, coverageCount: 0, min: 1, desired: 2 }
});
assert.deepStrictEqual(overlappingGap, {
  minimum: 1,
  desired: 1,
  total: 2
});

assert.strictEqual(getStaffingStatus(1, { min: 2, desired: 3, max: 3 }),
  'belowMinimum');
assert.strictEqual(formatRoleEntry({
  role: 'LM', count: 2, usable: 1, coverage: 1,
  target: { min: 2, desired: 3, max: 3 }, status: 'belowMinimum'
}), 'LM 1/3 min 2 live 2');
assert.strictEqual(formatRoleEntry({
  role: 'RF', count: 2, usable: 2, coverage: 1,
  target: { min: 2, desired: 2, max: 2 }, status: 'belowMinimum'
}), 'RF 2/2 cover 1/2');
assert.strictEqual(formatRoleEntry({
  role: 'UP', count: 1, usable: 1, coverage: 1,
  target: { min: 1, desired: 1, max: 1 }, status: 'staffed'
}), 'UP 1/1');

assert.strictEqual(countBrigadeMembers([
  { memory: { role: 'controller-relay' } },
  { memory: { role: 'controller-relay' } },
  { memory: { role: 'upgrader' } }
]), 2);

const compactLines = getDashboardVisualLines({
  creeps: 12, spawning: 1, needed: 3, totalEnergy: 12500,
  readyEnergy: 800, readyCapacity: 1300, alerts: []
}, { dashboard: 'W1N1 health steady' });
assert.deepStrictEqual(compactLines, [
  'COLONY · creeps 12 · spawn 1 · need 3',
  'Energy 12.5k · ready 800/1300',
  'W1N1 health steady',
  'Alert: none'
]);
const consoleDashboard = formatDashboardConsole({
  localBuildTargets: 1, outpostBuildTargets: 2, buildRemaining: 400,
  buildAssigned: 1, buildActive: 1, localFixTargets: 0,
  outpostFixTargets: 1, repairEnergy: 1200, repairAssigned: 0,
  repairActive: 0, emergencyRosters: [], roleTargets: {}, roleCounts: {},
  roleUsableCounts: {}, roleCoverage: {}, roleStatuses: {}, healthSummaries: [],
  alerts: ['W8N4 spawn bootstrap'], waits: ['LC 4/15t']
});
assert.ok(consoleDashboard.includes('Repair L0/O1'),
  'detail moves to the console formatter');
assert.ok(consoleDashboard.includes('Alerts W8N4 spawn bootstrap'),
  'visual alerts remain available in the console');
assert.ok(consoleDashboard.includes('Waits LC 4/15t'),
  'visual wait state remains available in the console');

console.log('colony dashboard scenarios passed');
