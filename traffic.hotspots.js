'use strict';

// Offline analysis of the movement service's latest recovery record. No Memory
// writes: missing events between snapshots remain unknown, never interpolated.
const analyzeTraffic = snapshots => {
  const ordered = snapshots.filter(s => Number.isInteger(s.tick) && s.tick >= 0)
    .sort((a, b) => a.tick - b.tick).slice(-120);
  const now = ordered.at(-1)?.tick ?? null;
  const events = new Map();
  let truncated = snapshots.length > 120;
  for (const snapshot of ordered) {
    const roles = Array.isArray(snapshot.roles) ? snapshot.roles : [];
    if (roles.length > 200) truncated = true;
    for (const creep of roles.slice(0, 200)) {
      const r = creep.memory?.navRecovery;
      if (!r || typeof creep.name !== 'string' ||
          !Number.isInteger(r.tick) || r.tick < 0 || r.tick > snapshot.tick ||
          snapshot.tick - r.tick > 200 ||
          !['blocked', 'oscillation'].includes(r.reason) ||
          typeof r.room !== 'string' || !Number.isInteger(r.x) ||
          !Number.isInteger(r.y) || r.x < 0 || r.x > 49 || r.y < 0 || r.y > 49 ||
          !Number.isInteger(r.stuck) || r.stuck < 1 ||
          !Number.isInteger(r.result)) continue;
      // Current fatigue is meaningful only for a same-tick record. Later
      // fatigue or a deliberate work wait cannot rewrite a historical event.
      if (r.tick === snapshot.tick && creep.fatigue > 0) continue;
      const key = JSON.stringify([creep.name, r.tick]);
      if (!events.has(key)) events.set(key, {
        name: creep.name, role: creep.memory.role || 'unknown', ...r
      });
    }
  }
  const tiles = new Map();
  for (const event of events.values()) {
    if (now - event.tick > 200) continue;
    const key = JSON.stringify([event.room, event.x, event.y]);
    if (!tiles.has(key)) tiles.set(key, {
      room: event.room, x: event.x, y: event.y, events: 0,
      blocked: 0, oscillation: 0, acceptedIntents: 0, failedIntents: 0,
      firstTick: event.tick, lastTick: event.tick,
      maxObservedStationaryTicks: 0, roles: new Set(), creeps: new Set()
    });
    const tile = tiles.get(key);
    tile.events++;
    tile[event.reason]++;
    tile[event.result === 0 ? 'acceptedIntents' : 'failedIntents']++;
    tile.firstTick = Math.min(tile.firstTick, event.tick);
    tile.lastTick = Math.max(tile.lastTick, event.tick);
    // navStuck also counts oscillation. Only a pure stationary suffix observed
    // across adjacent snapshots can establish duration; a saved stuck count
    // alone cannot distinguish earlier oscillation from stationary blockage.
    tile.roles.add(event.role);
    tile.creeps.add(event.name);
  }
  let chains = new Map();
  for (let i = 1; i < ordered.length; i++) {
    const before = ordered[i - 1], after = ordered[i];
    const nextChains = new Map();
    if (after.tick !== before.tick + 1) { chains = nextChains; continue; }
    const previous = new Map((before.roles || []).slice(0, 200).map(c => [c.name, c]));
    for (const c of (after.roles || []).slice(0, 200)) {
      const p = previous.get(c.name), m = p?.memory;
      if (!p || p.fatigue > 0 || c.fatigue > 0 ||
          m?.navLastTick !== before.tick || !m.navGoal ||
          c.memory?.navGoal !== m.navGoal || c.memory?.navLastTick !== after.tick ||
          p.room !== c.room || p.x !== c.x || p.y !== c.y) continue;
      const tile = tiles.get(JSON.stringify([c.room, c.x, c.y]));
      const duration = (chains.get(c.name) || 0) + 1;
      nextChains.set(c.name, duration);
      if (tile) tile.maxObservedStationaryTicks = Math.max(tile.maxObservedStationaryTicks, duration);
    }
    chains = nextChains;
  }
  const hotspots = [...tiles.values()].sort((a, b) =>
    b.events - a.events || b.lastTick - a.lastTick ||
    a.room.localeCompare(b.room) || a.x - b.x || a.y - b.y);
  if (hotspots.length > 30) truncated = true;
  return {
    tick: now, snapshots: ordered.length, truncated,
    limits: { snapshots: 120, creepsPerSnapshot: 200, eventAge: 200, hotspots: 30 },
    evidenceLimit: 'Recovery attempts are sampled, not collision causes or a complete event log. Accepted intents do not prove displacement. Sparse intervals have unknown blocked duration. Roles are roles at observation time.',
    hotspots: hotspots.slice(0, 30).map(t => ({ ...t,
      roles: [...t.roles].sort(), creeps: [...t.creeps].sort(),
      age: now - t.lastTick, recurring: t.events >= 2
    }))
  };
};

module.exports = { analyzeTraffic };
