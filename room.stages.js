'use strict';

// Canonical goals and operating logic for every Room Controller level. Keep
// this declarative: executors and policy modules may read it, but role-specific
// behavior should remain in their own services.
const ROOM_STAGE_PLANS = Object.freeze({
  0: Object.freeze({
    key: 'unclaimed',
    name: 'Claim the room',
    goal: 'secure ownership and establish the first spawn',
    logic: Object.freeze([
      'keep one claimer available when a GCL slot exists',
      'send builders only after ownership or reservation is secured',
      'treat the room as an outpost until a spawn can operate'
    ]),
    construction: Object.freeze(['spawn']),
    advanceWhen: Object.freeze(['controller is owned', 'spawn is operational'])
  }),
  1: Object.freeze({
    key: 'bootstrap',
    name: 'Bootstrap',
    goal: 'maintain harvesting, spawn access, and continuous controller progress',
    logic: Object.freeze([
      'source workers and emergency spawn energy outrank all optional work',
      'keep one controller worker so downgrade never becomes a threat',
      'use flexible workers until the energy network can support specialists'
    ]),
    construction: Object.freeze(['spawn']),
    advanceWhen: Object.freeze(['source coverage is stable', 'controller reaches RCL 2'])
  }),
  2: Object.freeze({
    key: 'energy-network',
    name: 'Energy network',
    goal: 'build containers and extensions so energy can be harvested and respawned reliably',
    logic: Object.freeze([
      'build source and extension containers before roads',
      'maintain a dedicated spawn and extension refill lane',
      'limit source staffing to useful mining positions and learned demand'
    ]),
    construction: Object.freeze(['source containers', 'extensions',
      'controller container', 'roads']),
    advanceWhen: Object.freeze(['essential containers work',
      'extensions refill reliably', 'controller reaches RCL 3'])
  }),
  3: Object.freeze({
    key: 'logistics',
    name: 'Logistics',
    goal: 'separate mining, hauling, refilling, building, and controller supply',
    logic: Object.freeze([
      'empty source buffers before adding optional workers',
      'use room balancers to distribute inter-room deliveries',
      'add builders only while construction demand exists'
    ]),
    construction: Object.freeze(['extensions', 'tower', 'containers', 'roads']),
    advanceWhen: Object.freeze(['source buffers drain consistently',
      'spawn network remains supplied', 'controller reaches RCL 4'])
  }),
  4: Object.freeze({
    key: 'reserves',
    name: 'Reserves',
    goal: 'create durable energy reserves without starving spawn or controller work',
    logic: Object.freeze([
      'fill storage from surplus after immediate room demand is covered',
      'scale upgrading from stored energy and controller buffer pressure',
      'repair critical infrastructure before spending deep reserves'
    ]),
    construction: Object.freeze(['extensions', 'storage', 'tower',
      'controller infrastructure', 'roads']),
    advanceWhen: Object.freeze(['storage is operating',
      'reserve health is stable', 'controller reaches RCL 5'])
  }),
  5: Object.freeze({
    key: 'automation',
    name: 'Energy automation',
    goal: 'reduce hauling distance and sustain the room through links and mature roads',
    logic: Object.freeze([
      'use links where they replace repeated long-distance carrying',
      'finish core road access while preserving container throughput',
      'expand outpost hauling only when home logistics remain healthy'
    ]),
    construction: Object.freeze(['links', 'extensions', 'tower', 'roads']),
    advanceWhen: Object.freeze(['core destinations have road access',
      'tower and storage are ready', 'controller reaches RCL 6'])
  }),
  6: Object.freeze({
    key: 'industry',
    name: 'Industry and trade',
    goal: 'support terminal, laboratory, and mineral work from a stable energy economy',
    logic: Object.freeze([
      'protect the base energy reserve before funding industry',
      'keep remote income proportional to hauling capacity',
      'treat laboratories and minerals as surplus-energy work'
    ]),
    construction: Object.freeze(['terminal', 'laboratories', 'extractor',
      'extensions', 'roads']),
    advanceWhen: Object.freeze(['core industry is supplied',
      'remote sources are stable', 'controller reaches RCL 7'])
  }),
  7: Object.freeze({
    key: 'expansion',
    name: 'Expansion',
    goal: 'prepare and establish another self-sustaining owned room',
    logic: Object.freeze([
      'claim only when a GCL slot and a viable target are available',
      'do not weaken the home room below its essential staffing floor',
      'bootstrap the new room through the same stage catalog'
    ]),
    construction: Object.freeze(['second spawn', 'factory', 'extensions',
      'towers', 'expansion support']),
    advanceWhen: Object.freeze(['expansion target is established',
      'home reserves remain healthy', 'controller reaches RCL 8'])
  }),
  8: Object.freeze({
    key: 'mature',
    name: 'Mature room',
    goal: 'maximize resilient production, defense, and support for the wider colony',
    logic: Object.freeze([
      'maintain reserve, defense, and controller safety before optional work',
      'use surplus for upgrading, industry, market, and expansion support',
      'replace static head counts with measured demand wherever possible'
    ]),
    construction: Object.freeze(['remaining spawns', 'observer',
      'power infrastructure', 'defenses', 'final extensions']),
    advanceWhen: Object.freeze(['room remains healthy under sustained load'])
  })
});

const getRoomStagePlan = level => {
  const normalized = Math.max(0, Math.min(8, Math.floor(level || 0)));
  return ROOM_STAGE_PLANS[normalized];
};

module.exports = { ROOM_STAGE_PLANS, getRoomStagePlan };
