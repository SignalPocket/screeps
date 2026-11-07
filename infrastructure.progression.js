'use strict';
const { createExtensionGrowthPlanner } = typeof Game === 'undefined'
  ? require('./extension.layout') : require('extension.layout');

// This inventory and schedule are shared planning inputs, not spawn authority.
// Visible ownership matters even before the first spawn finishes.
const ownedInfrastructureRooms = rooms => Object.values(rooms)
  .filter(room => room.controller && room.controller.my);

const assessInfrastructureProgression = ({ room, spawns, structures, sites,
  limits, tick, allowSlowPlanning, globalSiteCount, siteCap = 100,
  period = 20, previous = room.memory.infrastructureProgression }) => {
  const level = room.controller.level;
  const signature = `${room.controller.id || room.name}:${level}:` +
    spawns.map(spawn => spawn.id).sort().join(',');
  const changed = !previous || previous.signature !== signature ||
    Number.isFinite(previous.updated) && tick - previous.updated > 1;
  const due = changed || !Number.isFinite(previous?.checked) ||
    tick - previous.checked >= period;
  const inventory = {};
  for (const type of ['spawn', 'extension', 'container', 'road', 'tower',
    'storage', 'link']) {
    const built = structures.filter(s => s.structureType === type &&
      (s.my !== false || ['container', 'road'].includes(type))).length;
    const pending = sites.filter(site => site.structureType === type).length;
    const limit = limits[type]?.[level] || 0;
    inventory[type] = { built, pending, limit,
      missing: Math.max(0, limit - built - pending) };
  }
  // A deferred transition is never acknowledged as checked: retry the moment
  // the gate clears, rather than waiting for another ownership/RCL change.
  const gate = !allowSlowPlanning ? 'cpu-slow-planning-disabled' :
    globalSiteCount >= siteCap ? 'global-construction-cap' :
    !due ? 'periodic-retry-not-due' : null;
  return { signature, changed, due, eligible: due && !gate, gate,
    inventory, retry: gate === 'cpu-slow-planning-disabled'
      ? 'when CPU policy permits slow planning' :
      gate === 'global-construction-cap' ? 'when a global site slot opens' :
      gate === 'periodic-retry-not-due' ? `at tick ${previous.checked + period}` :
      'after this bounded reconciliation',
    spawnCapability: spawns.length ? 'working-spawn' : 'awaiting-first-spawn',
    checked: previous?.checked };
};

// Reuse the existing placement authorities only on their additive paths.
// In particular, missing capacity is not permission to move an old buffer/link.
const createOwnedRoomInfrastructure = dependencies => {
  const { Game, FIND_STRUCTURES, FIND_MY_CONSTRUCTION_SITES, FIND_MY_SPAWNS,
    CONTROLLER_STRUCTURES, getRoomSources, getContainerPurpose,
    manageControllerContainer, manageExtensionContainer, placeSourceContainerSite,
    placeStorageSite, placeTowerSite, placeLinkSite, isControllerLink,
    isExtensionLink, maxSitesPerRoom = 2, siteCap = 100 } = dependencies;
  const growExtensions = createExtensionGrowthPlanner(dependencies);
  // Count successful intents as well as visible sites. Shared room indexes
  // may not expose a just-created site until the following authoritative tick.
  let remainingSlots = Math.max(0, siteCap - Object.keys(
    Game.constructionSites || {}).length);
  const range = (a, b) => Math.max(Math.abs(a.pos.x - b.pos.x),
    Math.abs(a.pos.y - b.pos.y));
  return (room, { allowSlowPlanning, optionalConstruction }) => {
    const structures = room.find(FIND_STRUCTURES);
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    const spawns = room.find(FIND_MY_SPAWNS);
    const previous = room.memory.infrastructureProgression;
    const assessment = assessInfrastructureProgression({ room, spawns,
      structures, sites, limits: CONTROLLER_STRUCTURES, tick: Game.time,
      allowSlowPlanning, globalSiteCount: siteCap - remainingSlots,
      siteCap, previous });
    const report = { ...assessment, signature: previous?.signature,
      pendingSignature: assessment.signature, updated: Game.time,
      checked: previous?.checked, actions: previous?.actions || {}, placed: 0 };
    room.memory.infrastructureProgression = report;
    if (!assessment.eligible) return report;
    const actions = report.actions = {};
    const intents = {};
    // Establish a service anchor from completed manual infrastructure without
    // changing its positions or reviving an invalid migration plan.
    const completedExtensions = structures.filter(s => s.my &&
      s.structureType === 'extension');
    if (!room.memory.extensionCluster && completedExtensions.length) {
      room.memory.extensionCluster = {
        x: Math.round(completedExtensions.reduce((n,s)=>n+s.pos.x,0) /
          completedExtensions.length),
        y: Math.round(completedExtensions.reduce((n,s)=>n+s.pos.y,0) /
          completedExtensions.length),
        version: 'preserved-growth', extensionTiles: completedExtensions.map(s=>
          ({x:s.pos.x,y:s.pos.y}))
      };
    }
    const containers = [...structures, ...sites].filter(s =>
      s.structureType === 'container');
    const sources = getRoomSources(room);
    const defer = (reason, retry) => ({ reason, retry });
    const attempt = (label, type, place, gate) => {
      const inventory = assessment.inventory[type];
      let status = inventory.missing <= (intents[type] || 0)
        ? defer('capacity-covered', 'structure/site inventory or RCL changes') :
        gate || (report.placed >= maxSitesPerRoom || remainingSlots <= 0
          ? defer('placement-budget', 'next bounded pass or global site slot') : null);
      if (status) { actions[label] = status; return; }
      const outcome = place();
      const placed = typeof outcome === 'object' ? outcome.placed > 0 : outcome === true;
      if (placed) {
        report.placed++; remainingSlots--; intents[type] = (intents[type] || 0) + 1;
      }
      actions[label] = typeof outcome === 'object' ? outcome :
        defer(placed ? 'site-placed' : 'shared-planner-no-placement',
          placed ? 'site completion' : 'next bounded shared-planner retry');
    };
    const optionalGate = optionalConstruction ? null :
      defer('optional-construction-policy', 'room economic/defense policy permits construction');
    actions.spawn = defer(assessment.inventory.spawn.missing
      ? 'expansion-authority' : 'capacity-covered',
    'shared expansion planner re-evaluates bootstrap demand; no duplicate spawn planner');
    // Ownership is recorded before a spawn exists. Source containers can be
    // added at their legal level without relying on an original home room.
    attempt('sourceContainers', 'container', () => placeSourceContainerSite(room),
      room.controller.level < 2 ? defer('source-planner-rcl', 'controller level 2') :
      sources.every(source => containers.some(c => range(source, c) <= 2))
        ? defer('source-buffers-covered', 'source container inventory changes') : null);
    attempt('extensions', 'extension', () => growExtensions(room));
    const noSpawn = !spawns.length ? defer('awaiting-first-spawn',
      'expansion authority completes first spawn') : null;
    const controllerBuffer = containers.some(c => range(c, room.controller) <= 3);
    attempt('controllerContainer', 'container', () => manageControllerContainer(room),
      room.controller.level < 2 ? defer('controller-planner-rcl', 'controller level 2') :
      controllerBuffer ? defer('controller-buffer-covered', 'controller buffer inventory changes') :
      room.memory.controllerContainerPlan?.retireContainerId
        ? defer('preserve-controller-migration', 'review existing migration separately') : null);
    const secondSource = sources[1];
    const duplicateSourceSite = secondSource && containers.some(c =>
      c.id && structures.includes(c) && range(secondSource, c) <= 2) &&
      sites.some(c => c.structureType === 'container' && range(secondSource, c) <= 2);
    attempt('extensionContainer', 'container', () => manageExtensionContainer(room),
      noSpawn || (!room.memory.extensionCluster
        ? defer('extension-service-anchor', 'completed extension layout establishes an anchor') :
        duplicateSourceSite ? defer('preserve-manual-source-site',
          'existing source site completes; never cancel it for extension capacity') : null));
    const extensions = assessment.inventory.extension;
    attempt('storage', 'storage', () => placeStorageSite(room), noSpawn || optionalGate ||
      (extensions.built < extensions.limit ? defer('finish-unlocked-extensions',
        'all extensions unlocked at this RCL complete') : null));
    attempt('tower', 'tower', () => placeTowerSite(room), noSpawn || optionalGate);
    const links = structures.filter(s => s.structureType === 'link' && s.my !== false);
    const misplaced = links.some(link => ['controller', 'extensions'].some(purpose =>
      (purpose === 'controller' ? isControllerLink(room, link) : isExtensionLink(room, link)) &&
      !containers.some(c => structures.includes(c) &&
        getContainerPurpose(room, c.pos) === purpose && range(c, link) === 1)));
    attempt('link', 'link', () => placeLinkSite(room), noSpawn || optionalGate ||
      (misplaced ? defer('preserve-existing-link-layout',
        'review migration separately or existing service alignment changes') : null));
    actions.roads = defer('shared-road-network-budget',
      'shared corridor/road planner runs with its existing construction and access budgets');
    report.checked = Game.time;
    report.signature = assessment.signature;
    report.intentSites = intents;
    report.retry = `at tick ${Game.time + 20} or next capability transition`;
    return report;
  };
};

module.exports = { ownedInfrastructureRooms, assessInfrastructureProgression,
  createOwnedRoomInfrastructure };
