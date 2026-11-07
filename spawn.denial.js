'use strict';

// Diagnostics only: never select work, modify a request, or authorize a spawn.
const describeSpawnAttempt = ({ spawn, proposed, authority, request, result,
  busy = false }) => {
  const observation = { spawn, status: 'idle' };
  if (busy) return { ...observation, status: 'busy' };
  if (!proposed) return observation;
  const role = proposed.role;
  const target = JSON.stringify([role, proposed.remoteRoom,
    proposed.expansionTarget, proposed.remoteSlot, proposed.remoteHaulerSlot,
    proposed.remoteBuilderSlot, proposed.controllerRelaySlot,
    proposed.builderScope, proposed.builderMission,
    proposed.preferredSource && proposed.preferredSource.id]);
  const denied = (owner, gate, reason, recovery) => ({ ...observation,
    status: 'denied', role, target, authority: owner, gate, reason, recovery });
  if (!authority.authorized) {
    return denied('spawn.authority', authority.phase, authority.reason,
      'Resolve the earlier staffing tier identified by the authority reason; re-evaluate the request.');
  }
  if (!request.needsWorker) {
    return denied('spawn.policy', 'admission',
      'Request not admitted: population limit or reusable idle capacity.',
      'Re-evaluate population headroom and eligible idle capacity; this observation does not distinguish those gates.');
  }
  if (!request.body) {
    return denied('spawn.policy', 'body',
      'No executable body after charge, affordability and capability checks.',
      'Re-evaluate energy, charge wait and required body capability; no specific failing body gate is inferred.');
  }
  if (result === 0) return { ...observation, status: 'admitted', role };
  return denied('spawnCreep', 'intent', `Spawn intent returned ${result}.`,
    'Resolve the reported spawn API result before retrying.');
};

// One reconciliation after all spawns: no same-tick overwrite of another
// spawn's denial or success. At most three records, the engine room limit.
// Missing ticks break continuity; sparse observations cannot prove starvation.
const recordSpawnDenials = (memory, tick, observations) => {
  const previous = memory.spawnDenials;
  const records = {};
  for (const item of observations.slice().sort((a, b) =>
    a.spawn.localeCompare(b.spawn)).slice(0, 3)) {
    const old = previous && previous.records && previous.records[item.spawn];
    const same = item.status === 'denied' && old &&
      old.status === 'denied' && old.target === item.target &&
      old.authority === item.authority && old.gate === item.gate &&
      old.reason === item.reason &&
      (old.lastTick === tick - 1 || old.lastTick === tick);
    const firstTick = same ? old.firstTick : tick;
    records[item.spawn] = item.status === 'denied'
      ? { ...item, firstTick, lastTick: tick, age: tick - firstTick,
        observations: same ? old.observations + (old.lastTick === tick ? 0 : 1) : 1 }
      : { spawn: item.spawn, status: item.status, lastTick: tick };
  }
  memory.spawnDenials = { version: 1, updated: tick, records };
  return memory.spawnDenials;
};

module.exports = { describeSpawnAttempt, recordSpawnDenials };
