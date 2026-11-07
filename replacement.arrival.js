'use strict';

// Conditional diagnostics only. No admission, staffing, routing or memory writes.
const COST = { move: 50, work: 100, carry: 50, attack: 80,
  ranged_attack: 150, heal: 250, claim: 600, tough: 10 };
const nonnegative = n => Number.isFinite(n) && n >= 0;
const bodyCost = body => Array.isArray(body) && body.length > 0 && body.length <= 50 &&
  body.every(p => Object.hasOwn(COST, typeof p === 'string' ? p : p?.type))
  ? body.reduce((sum, p) => sum + COST[typeof p === 'string' ? p : p.type], 0) : null;
const travel = value => nonnegative(value?.ticks) &&
  ['measured', 'estimated', 'at-position'].includes(value?.basis) ? value : null;
const homeName = m => m.role?.startsWith('remote-')
  ? m.remoteHome || m.home : m.home || m.remoteHome;
const capableSuccessor = (body, role) => {
  const required = role === 'remote-reserver' ? 'claim'
    : ['harvester', 'remote-miner', 'upgrader', 'controller-relay'].includes(role) ? 'work' : 'carry';
  return (body || []).filter(p => p.type === required && p.hits > 0).length >=
    (role === 'remote-reserver' ? 2 : 1);
};

const forecastArrival = ({ ttl, candidates = [], successors = [] }) => {
  if (!nonnegative(ttl)) throw Error('Require incumbent remaining life');
  const scenarios = candidates.map(c => {
    const cost = bodyCost(c.body);
    const spawnTicks = cost === null ? null : c.body.length * 3;
    const route = travel(c.travel);
    let unknown = null;
    if (cost === null) unknown = 'invalid candidate body';
    else if (!nonnegative(c.energy)) unknown = 'unknown available energy';
    else if (cost > c.energy) unknown = 'funding required';
    else if (!nonnegative(c.availableIn)) unknown = 'unknown spawn availability';
    else if (!route) unknown = 'unknown travel';
    else if (route.ticks >= (c.body.some(p => (typeof p === 'string' ? p : p.type) === 'claim')
      ? 600 : 1500)) unknown = 'candidate expires before arrival';
    const arrivalIn = unknown ? null : c.availableIn + spawnTicks + route.ticks;
    return { kind: 'new-body', name: c.name, cost, spawnTicks,
      energy: c.energy, availableIn: c.availableIn, travel: route,
      // Conditional on this body, funded now; ignores future queue competition.
      spawnOnlyLowerBound: cost !== null && nonnegative(c.availableIn)
        ? c.availableIn + spawnTicks : null,
      arrivalIn, gapTicks: arrivalIn === null ? null : Math.max(0, arrivalIn - ttl), unknown };
  });
  for (const s of successors) {
    const route = travel(s.travel);
    let unknown = null;
    if (!nonnegative(s.availableIn)) unknown = 'unknown successor availability';
    else if (!nonnegative(s.expiresIn)) unknown = 'unknown successor lifetime';
    else if (!route) unknown = 'unknown successor travel';
    const arrival = unknown ? null : s.availableIn + route.ticks;
    // A younger matching creep must survive both arrival and incumbent expiry.
    if (!unknown && s.expiresIn <= Math.max(arrival, ttl)) unknown = 'successor expires too soon';
    scenarios.push({ kind: 'existing-successor', name: s.name,
      availableIn: s.availableIn, expiresIn: s.expiresIn, travel: route,
      arrivalIn: unknown ? null : arrival,
      gapTicks: unknown ? null : Math.max(0, arrival - ttl), unknown });
  }
  const known = scenarios.filter(s => s.arrivalIn !== null)
    .sort((a, b) => a.arrivalIn - b.arrivalIn);
  return { ttl, earliestKnownScenario: known[0] || null,
    unknownAlternatives: scenarios.some(s => s.unknown !== null),
    noSpawn: candidates.length === 0, scenarios,
    limits: 'Conditional scenarios, not a spawn schedule or proof of a policy defect. Body suitability is caller responsibility. Funding, competing requests, fatigue, route changes and future delays are not forecast. A measured historical trip does not guarantee future travel. Unknown alternatives cannot be treated as absent; zero gap does not prove future coverage.' };
};

const positionKey = m => {
  const home = homeName(m);
  if (!home) return null;
  let slot;
  if (m.role === 'harvester') slot = m.minerSource || m.sourceReserve ||
    m.sourceReplacement || m.preferredSource || m.harvestSource;
  if (m.role === 'remote-miner' && m.remoteRoom && Number.isInteger(m.remoteSlot))
    slot = [m.remoteRoom, m.remoteSlot];
  if (m.role === 'remote-hauler' && m.remoteRoom && Number.isInteger(m.remoteHaulerSlot))
    slot = [m.remoteRoom, m.remoteHaulerSlot];
  if (m.role === 'remote-reserver') slot = m.remoteRoom;
  if (m.role === 'refiller') slot = m.refillClusterId;
  if (m.role === 'controller-relay' && Number.isInteger(m.controllerRelaySlot)) slot = m.controllerRelaySlot;
  return slot === undefined || slot === null ? null : JSON.stringify([home, m.role, slot]);
};

const observedHaulTravel = (memory, m, tick) => {
  if (m.role !== 'remote-hauler' || !Number.isInteger(m.remoteHaulerSlot)) return null;
  const home = memory.rooms?.[homeName(m)];
  const route = home?.remoteHaulRoutes?.[m.remoteRoom];
  const source = route?.lanes?.[route.slotSources?.[m.remoteHaulerSlot]]?.sourceId;
  const sample = home?.haulTripStats?.[m.remoteRoom]?.slots?.[m.remoteHaulerSlot];
  if (!source || source !== sample?.sourceId || !Number.isSafeInteger(sample.updated) ||
      sample.updated > tick || tick - sample.updated > 1500 ||
      !Number.isInteger(sample.samples) || sample.samples <= 0 ||
      !nonnegative(sample.outboundTicks)) return null;
  return { ticks: Math.ceil(sample.outboundTicks), basis: 'estimated',
    source: 'matching-slot observed home-to-pickup EWMA; includes waiting; origin and body may differ from new spawn',
    sampleTick: sample.updated, samples: sample.samples, age: tick - sample.updated };
};

const captureReplacements = (database, user, evidence = null) => {
  if (typeof user !== 'string' || !user) throw Error('Require explicit user');
  const rows = name => database.collections?.find(c => c.name === name)?.data || [];
  const env = rows('env')[0]?.data;
  if (!Number.isSafeInteger(env?.gameTime)) throw Error('Missing authoritative tick');
  if (typeof env[`memory:${user}`] !== 'string') throw Error('Missing user memory');
  const tick = env.gameTime;
  if (evidence && (evidence.user !== user || evidence.tick !== tick))
    throw Error('Travel/body evidence must match explicit user and current tick');
  const memory = JSON.parse(env[`memory:${user}`]);
  const objects = rows('rooms.objects');
  const creeps = objects.filter(o => o.type === 'creep' && o.user === user);
  const spawns = objects.filter(o => o.type === 'spawn' && o.user === user);
  if (new Set(creeps.map(c => c.name)).size !== creeps.length ||
      new Set(spawns.map(s => s.name)).size !== spawns.length) throw Error('Ambiguous object identity');
  const remaining = s => !s.spawning ? 0 : nonnegative(s.spawning.remainingTime)
    ? s.spawning.remainingTime : Number.isFinite(s.spawning.spawnTime)
      ? Math.max(0, s.spawning.spawnTime - tick) : null;
  const essential = new Set(['harvester', 'remote-miner', 'remote-hauler',
    'remote-reserver', 'refiller', 'hauler', 'upgrader', 'rebalancer', 'controller-relay']);
  const records = [];
  for (const c of creeps) {
    const m = memory.creeps?.[c.name] || {};
    if (!essential.has(m.role) || m.staffingRetire ||
        !Number.isFinite(c.ageTime) || c.ageTime <= tick) continue;
    const home = homeName(m);
    const key = positionKey(m);
    const supplied = evidence?.positions?.[c.name] || {};
    const energy = objects.filter(o => ['spawn', 'extension'].includes(o.type) &&
      o.user === user && o.room === home).reduce((sum, o) => sum + (o.store?.energy || 0), 0);
    const candidates = spawns.filter(s => s.room === home).map(s => ({
      name: s.name, body: supplied.candidates?.[s.name]?.body || c.body,
      energy, availableIn: remaining(s),
      travel: supplied.candidates?.[s.name] && Object.hasOwn(supplied.candidates[s.name], 'travel')
        ? supplied.candidates[s.name].travel : observedHaulTravel(memory, m, tick)
    }));
    const successors = key === null ? [] : creeps.filter(s => s.name !== c.name &&
      !memory.creeps?.[s.name]?.staffingRetire && capableSuccessor(s.body, m.role) &&
      positionKey(memory.creeps?.[s.name] || {}) === key)
      .map(s => {
        const pending = spawns.find(spawn => spawn.spawning?.name === s.name);
        const delay = pending ? remaining(pending) : Number.isFinite(s.ageTime) ? 0 : null;
        const lifetime = s.body?.some(p => p.type === 'claim') ? 600 : 1500;
        return { name: s.name, availableIn: delay,
          expiresIn: Number.isFinite(s.ageTime) ? s.ageTime - tick
            : delay === null ? null : delay + lifetime,
          travel: supplied.successors?.[s.name]?.travel };
      });
    records.push({ name: c.name, role: m.role, home, room: c.room, position: key,
      scope: key === null ? 'individual; pooled minimum coverage unknown' : 'matching assignment; service readiness requires travel evidence',
      bodyBasis: 'incumbent clone unless explicit candidate supplied; not a body planner',
      forecast: forecastArrival({ ttl: c.ageTime - tick, candidates, successors }) });
  }
  return { version: 1, user, tick, records,
    limits: 'Read-only individual/assignment diagnostics. Missing essential positions and policy minimum counts are not enumerated. No route inferred from room distance, current task label or same-room presence. Supply tick-matched evidence.positions[incumbentName].candidates[spawnName] = {body?, travel:{ticks,basis}} and .successors[creepName] = {travel:{ticks,basis}} to evaluate measured or estimated travel scenarios. Default travel is unknown except remote-hauler clone scenarios with matching-source slot observations no older than 1500 ticks: those use an explicitly labeled historical home-to-pickup estimate, not a spawn-to-station measurement. Each row independently assumes the available spawn and energy; rows are not a jointly feasible schedule.' };
};

module.exports = { bodyCost, forecastArrival, positionKey, observedHaulTravel, captureReplacements };
