'use strict';

const createColonyDashboard = ({
  Game, Memory, getWorkerLimits, getRoomSituation, getRoomStructures, shortRoles,
  maxSpawnWait, RESOURCE_ENERGY, STRUCTURE_SPAWN, STRUCTURE_EXTENSION,
  FIND_DROPPED_RESOURCES
}) => {
  const compact = value => value >= 1000
    ? `${(value / 1000).toFixed(1).replace('.0', '')}k` : `${value}`;
  // Roles are grouped by the body template they should ideally use. This
  // makes shortages legible as capability shortages instead of a flat list
  // of labels that happen to compete for the same spawn body.
  const bodyGroups = [
    { name: 'MINER W>C', roles: ['LM'] },
    { name: 'HAUL W+C', roles: ['RF', 'OC', 'LC', 'RB'] },
    { name: 'RC W>C', roles: ['UP'] },
    { name: 'WORK W=C=M', roles: ['BU-L', 'BU-O', 'BU-X', 'W'] },
    { name: 'FIELD W>C', roles: ['OP'] },
    { name: 'CLAIM CL+M', roles: ['CL'] }
  ];
  const roleOrder = bodyGroups.flatMap(group => group.roles);
  const staffingColors = {
    belowMinimum: '#ff5f78',
    belowDesired: '#ffd60a',
    staffed: '#30d158',
    aboveDesired: '#64d2ff',
    aboveMaximum: '#ff8ad8',
    unplanned: '#bf5af2'
  };
  const textOpacity = 0.62;
  const getStaffingStatus = (count, target = {}) => {
    const minimum = target.min || 0;
    const desired = target.desired || 0;
    if (minimum === 0 && desired === 0 && target.max == null && count > 0) {
      return 'unplanned';
    }
    if (count < minimum) return 'belowMinimum';
    if (count < desired) return 'belowDesired';
    if (Number.isFinite(target.max) && count > target.max) {
      return 'aboveMaximum';
    }
    if (count > desired) return 'aboveDesired';
    return 'staffed';
  };

  const updateDashboard = (creeps, workTargets = {}) => {
    if (Game.time % 5 !== 0) return Memory.colonyDashboard;
    const ownedRooms = Object.values(Game.rooms).filter(room =>
      room.controller && room.controller.my);
    let populationNeed = 0;
    let replacementNeed = 0;
    const spawnWaits = [];
    for (const room of ownedRooms) {
      const current = creeps.filter(creep =>
        creep.memory.home === room.name).length;
      const target = getWorkerLimits(room).workerLimit;
      const gap = Math.max(0, target - current);
      populationNeed += gap;
      if (room.memory.spawnWaitRole) {
        const role = shortRoles[room.memory.spawnWaitRole] ||
          room.memory.spawnWaitRole;
        const waited = Number.isInteger(room.memory.spawnWaitSince)
          ? Math.max(0, Game.time - room.memory.spawnWaitSince) : 0;
        const limit = Number.isInteger(room.memory.spawnWaitLimit)
          ? room.memory.spawnWaitLimit : maxSpawnWait;
        spawnWaits.push(`${role} ${waited}/${limit}t`);
        if (gap === 0) replacementNeed++;
      }
    }
    const readyEnergy = ownedRooms.reduce((total, room) =>
      total + room.energyAvailable, 0);
    const readyCapacity = ownedRooms.reduce((total, room) =>
      total + room.energyCapacityAvailable, 0);
    const reserveEnergy = Object.values(Game.rooms).reduce((total, room) =>
      total + getRoomStructures(room).filter(structure => structure.store &&
        !(structure.my &&
          (structure.structureType === STRUCTURE_SPAWN ||
            structure.structureType === STRUCTURE_EXTENSION)))
        .reduce((sum, structure) =>
          sum + (structure.store[RESOURCE_ENERGY] || 0), 0), 0);
    const carriedEnergy = creeps.reduce((total, creep) =>
      total + creep.store[RESOURCE_ENERGY], 0);
    const looseEnergy = Object.values(Game.rooms).reduce((total, room) =>
      total + room.find(FIND_DROPPED_RESOURCES, {
        filter: resource => resource.resourceType === RESOURCE_ENERGY
      }).reduce((sum, resource) => sum + resource.amount, 0), 0);
    const totalEnergy = readyEnergy + reserveEnergy + carriedEnergy +
      looseEnergy;
    const spawning = Object.values(Game.spawns).filter(spawn =>
      spawn.spawning).length;
    const needed = populationNeed + replacementNeed;
    const roleCounts = creeps.reduce((counts, creep) => {
      const role = creep.memory.role === 'builder'
        ? creep.memory.builderScope === 'outpost' ? 'BU-O'
          : creep.memory.builderScope === 'expansion' ? 'BU-X' : 'BU-L'
        : shortRoles[creep.memory.role] || creep.memory.role || 'W';
      counts[role] = (counts[role] || 0) + 1;
      return counts;
    }, {});
    const roleTargets = {};
    const addRoleTarget = (role, minimum, desired, maximum = desired) => {
      const target = roleTargets[role] || { min: 0, desired: 0, max: 0 };
      target.min += Math.max(0, minimum || 0);
      target.desired += Math.max(0, desired || 0);
      if (maximum == null) target.max = null;
      else if (target.max != null) target.max += Math.max(0, maximum || 0);
      roleTargets[role] = target;
    };
    for (const room of ownedRooms) {
      const policy = getRoomSituation(room).policy;
      const roles = policy.roles;
      const roleMax = entry => Number.isFinite(entry.max)
        ? entry.max : entry.desired;
      addRoleTarget('LM', roles.source.min, roles.source.desired,
        roleMax(roles.source));
      addRoleTarget('LC', roles.hauler.min, roles.hauler.desired,
        roleMax(roles.hauler));
      addRoleTarget('RF', roles.refiller.min, roles.refiller.desired,
        roleMax(roles.refiller));
      addRoleTarget('RB', roles.rebalancer.min, roles.rebalancer.desired,
        roleMax(roles.rebalancer));
      addRoleTarget('UP', roles.upgrader.min, roles.upgrader.desired,
        roleMax(roles.upgrader));
      addRoleTarget('BU-L',
        roles.builder.min + roles.repairBuilder.min + roles.tunnelBuilder.min,
        roles.builder.desired + roles.repairBuilder.desired +
          roles.tunnelBuilder.desired,
        roleMax(roles.builder) + roleMax(roles.repairBuilder) +
          roleMax(roles.tunnelBuilder));
      const surveys = Object.entries(room.memory)
        .filter(([key, survey]) => key.endsWith('Survey') && survey &&
          survey.active && survey.targetRoom)
        .map(([, survey]) => survey);
      const remoteBuilders = surveys.length > 0
        ? surveys.reduce((total, survey) => total +
          Math.max(0, survey.remoteBuilderTarget || 0), 0)
        : policy.remote.builders;
      const remoteMiners = surveys.length > 0
        ? surveys.reduce((total, survey) => total +
          (Array.isArray(survey.remoteWorkNeeds)
            ? survey.remoteWorkNeeds.reduce((sum, need) => sum +
              Math.max(1, need.minMiners || 0), 0)
            : Math.max(0, survey.remoteMinerTarget || 0)), 0)
        : policy.remote.miners;
      const remoteHaulers = surveys.length > 0
        ? surveys.reduce((total, survey) => total +
          Math.max(0, survey.remoteHaulerTarget || 0), 0)
        : policy.remote.haulers;
      // Remote headcount is work/route based and may legitimately exceed the
      // slot count when small bodies share a slot, so it has no hard maximum.
      addRoleTarget('BU-O', remoteBuilders, remoteBuilders, null);
      addRoleTarget('OP', remoteMiners, remoteMiners, null);
      addRoleTarget('OC', remoteHaulers, remoteHaulers, null);
    }
    const roleStatuses = Object.fromEntries([...new Set([
      ...Object.keys(roleCounts), ...Object.keys(roleTargets)
    ])].map(role => [role, getStaffingStatus(roleCounts[role] || 0,
      roleTargets[role])]));
    const alerts = [];
    const overMaximum = Object.entries(roleStatuses)
      .filter(([, status]) => status === 'aboveMaximum')
      .map(([role]) => `${role}+${(roleCounts[role] || 0) -
        roleTargets[role].max}`);
    if (overMaximum.length > 0) {
      alerts.push(`OVER MAX ${overMaximum.join(' ')}`);
    }
    const slotOwners = {};
    for (const creep of creeps) {
      let slotKey;
      if (creep.memory.role === 'remote-scout' &&
          Number.isInteger(creep.memory.remoteSlot)) {
        slotKey = `OP ${creep.memory.remoteRoom}/S${creep.memory.remoteSlot + 1}`;
      } else if (creep.memory.role === 'remote-hauler' &&
          Number.isInteger(creep.memory.remoteHaulerSlot)) {
        slotKey = `OC ${creep.memory.remoteRoom}/H` +
          `${creep.memory.remoteHaulerSlot + 1}`;
      } else if (creep.memory.role === 'builder' &&
          creep.memory.builderScope === 'outpost' &&
          Number.isInteger(creep.memory.remoteBuilderSlot)) {
        slotKey = `BU-O ${creep.memory.remoteRoom}/B` +
          `${creep.memory.remoteBuilderSlot + 1}`;
      }
      if (slotKey) slotOwners[slotKey] = (slotOwners[slotKey] || 0) + 1;
    }
    const sharedSlots = Object.entries(slotOwners)
      .filter(([, count]) => count > 1)
      .map(([slot, count]) => `${slot}x${count}`);
    if (sharedSlots.length > 0) {
      alerts.push(`SHARED ${sharedSlots.join(' ')}`);
    }
    const repurposed = {};
    for (const creep of creeps) {
      if (!creep.memory.birthRole ||
          creep.memory.birthRole === creep.memory.role) continue;
      const role = creep.memory.role === 'builder'
        ? creep.memory.builderScope === 'outpost' ? 'BU-O'
          : creep.memory.builderScope === 'expansion' ? 'BU-X' : 'BU-L'
        : shortRoles[creep.memory.role] || creep.memory.role;
      repurposed[role] = (repurposed[role] || 0) + 1;
    }
    if (Object.keys(repurposed).length > 0) {
      alerts.push(`REPURPOSED ${Object.entries(repurposed)
        .map(([role, count]) => `${role}${count}`).join(' ')}`);
    }
    const localBuildTargets = workTargets.localBuildTargets || 0;
    const outpostBuildTargets = workTargets.outpostBuildTargets || 0;
    const localFixTargets = workTargets.localFixTargets || 0;
    const outpostFixTargets = workTargets.outpostFixTargets || 0;
    const localBuildRemaining = workTargets.localBuildRemaining || 0;
    const outpostBuildRemaining = workTargets.outpostBuildRemaining || 0;
    const localRepairEnergy = workTargets.localRepairEnergy || 0;
    const outpostRepairEnergy = workTargets.outpostRepairEnergy || 0;
    const dashboard = {
      updated: Game.time,
      creeps: creeps.length,
      spawning,
      needed,
      waits: spawnWaits,
      totalEnergy,
      readyEnergy,
      readyCapacity,
      reserveEnergy,
      carriedEnergy,
      looseEnergy,
      roleCounts,
      roleTargets,
      roleStatuses,
      alerts,
      bodyTypeCount: bodyGroups.length,
      localBuildTargets,
      outpostBuildTargets,
      localFixTargets,
      outpostFixTargets,
      localBuildRemaining,
      outpostBuildRemaining,
      buildRemaining: localBuildRemaining + outpostBuildRemaining,
      localRepairEnergy,
      outpostRepairEnergy,
      repairEnergy: localRepairEnergy + outpostRepairEnergy,
      buildAssigned: workTargets.buildAssigned || 0,
      buildActive: workTargets.buildActive || 0,
      repairAssigned: workTargets.repairAssigned || 0,
      repairActive: workTargets.repairActive || 0,
      buildTargets: workTargets.buildTargets ||
        localBuildTargets + outpostBuildTargets,
      fixTargets: workTargets.fixTargets ||
        localFixTargets + outpostFixTargets
    };
    Memory.colonyDashboard = dashboard;
    if (Game.time % 25 === 0) {
      console.log(`[${Game.time}] Colony | Creeps ${creeps.length} ` +
        `(spawning ${spawning}, need ${needed}` +
        `${spawnWaits.length ? `, wait ${spawnWaits.join(',')}` : ''}) | ` +
        `Energy ${compact(totalEnergy)} total ` +
        `(ready ${readyEnergy}/${readyCapacity}, ` +
        `reserve ${compact(reserveEnergy)}, ` +
        `carried ${compact(carriedEnergy)}, ` +
        `loose ${compact(looseEnergy)}) | Targets build ` +
        `L${dashboard.localBuildTargets}/O${dashboard.outpostBuildTargets}, ` +
        `fix L${dashboard.localFixTargets}/O${dashboard.outpostFixTargets} | Roles ` +
        `${roleOrder.filter(role => roleCounts[role]).map(role =>
          `${role}${roleCounts[role]}`).join(' ')}`);
    }
    return dashboard;
  };

  const drawDashboard = () => {
    const dashboard = Memory.colonyDashboard;
    if (!dashboard) return;
    const waitText = dashboard.waits && dashboard.waits.length
      ? `Wait ${dashboard.waits.join(' | ')}` : 'Wait none';
    const roleTargets = dashboard.roleTargets || {};
    const roleEntries = [...new Set([
      ...Object.keys(dashboard.roleCounts || {}), ...Object.keys(roleTargets)
    ])]
      .filter(role => (dashboard.roleCounts[role] || 0) > 0 ||
        (roleTargets[role] && roleTargets[role].desired > 0))
      .sort((a, b) => {
        const aIndex = roleOrder.indexOf(a);
        const bIndex = roleOrder.indexOf(b);
        return (aIndex < 0 ? roleOrder.length : aIndex) -
          (bIndex < 0 ? roleOrder.length : bIndex) ||
          a.localeCompare(b);
      })
      .map(role => {
        const count = dashboard.roleCounts[role] || 0;
        const target = roleTargets[role] || {
          min: 0, desired: 0, max: null
        };
        const status = dashboard.roleStatuses &&
          dashboard.roleStatuses[role] || getStaffingStatus(count, target);
        return {
          role,
          text: `${role}${count}|${target.min}/${target.desired}/` +
            `${Number.isFinite(target.max) ? target.max : '*'}`,
          color: staffingColors[status]
        };
      });
    const roleEntryByName = Object.fromEntries(roleEntries.map(entry =>
      [entry.role, entry]));
    const groupedRoles = bodyGroups.map(group => ({
      name: group.name,
      entries: group.roles.map(role => roleEntryByName[role]).filter(Boolean)
    })).filter(group => group.entries.length > 0);
    const groupedNames = new Set(bodyGroups.flatMap(group => group.roles));
    const ungrouped = roleEntries.filter(entry => !groupedNames.has(entry.role));
    if (ungrouped.length > 0) {
      groupedRoles.push({ name: 'OTHER', entries: ungrouped });
    }
    const alertLines = [];
    for (let index = 0; index < (dashboard.alerts || []).length; index += 2) {
      alertLines.push(dashboard.alerts.slice(index, index + 2).join(' | '));
    }
    const groupStartY = 11.95 + alertLines.length * 0.8;
    for (const room of Object.values(Game.rooms).filter(candidate =>
      candidate.controller && candidate.controller.my)) {
      room.visual.rect(0.5, 4.5, 27.5,
        7.35 + (groupedRoles.length + alertLines.length) * 0.8, {
        fill: '#101820', opacity: 0.22, stroke: '#64d2ff',
        strokeWidth: 0.08
      });
      room.visual.text('COLONY', 1.2, 5.3, {
        align: 'left', color: '#64d2ff', font: 'bold 1 monospace',
        opacity: textOpacity
      });
      room.visual.text(
        `Creeps ${dashboard.creeps} | spawning ${dashboard.spawning} | ` +
          `need ${dashboard.needed}`,
        1.2, 6.2,
        { align: 'left', color: '#ffffff', font: 'bold 0.85 monospace',
          opacity: textOpacity }
      );
      room.visual.text(waitText, 1.2, 7.05, {
        align: 'left', color: dashboard.waits && dashboard.waits.length
          ? '#ff9f0a' : '#30d158', font: 'bold 0.85 monospace',
        opacity: textOpacity
      });
      room.visual.text(
        `Energy ${compact(dashboard.totalEnergy)} | ready ` +
          `${dashboard.readyEnergy}/${dashboard.readyCapacity}`,
        1.2, 7.9,
        { align: 'left', color: '#ffd60a', font: 'bold 0.85 monospace',
          opacity: textOpacity }
      );
      room.visual.text(
        `Reserve ${compact(dashboard.reserveEnergy)} | carry ` +
          `${compact(dashboard.carriedEnergy)} | loose ` +
          `${compact(dashboard.looseEnergy)}`,
        1.2, 8.75,
        { align: 'left', color: '#d1d1d6', font: 'bold 0.81 monospace',
          opacity: textOpacity }
      );
      room.visual.text(
        `Build L${dashboard.localBuildTargets || 0}/` +
          `O${dashboard.outpostBuildTargets || 0} | remain ` +
          `${compact(dashboard.buildRemaining || 0)} | assigned ` +
          `${dashboard.buildAssigned || 0} active ` +
          `${dashboard.buildActive || 0}`,
        1.2, 9.55,
        { align: 'left', color: '#ff8ad8', font: 'bold 0.83 monospace',
          opacity: textOpacity }
      );
      room.visual.text(
        `Repair L${dashboard.localFixTargets || 0}/` +
          `O${dashboard.outpostFixTargets || 0} | energy ` +
          `${compact(dashboard.repairEnergy || 0)} | assigned ` +
          `${dashboard.repairAssigned || 0} active ` +
          `${dashboard.repairActive || 0}`,
        1.2, 10.35,
        { align: 'left', color: '#ff9f0a', font: 'bold 0.83 monospace',
          opacity: textOpacity }
      );
      room.visual.text('Jobs: count | min / desired / max (* = work-based)',
        1.2, 11.15, {
          align: 'left', color: '#d1d1d6', font: 'bold 0.72 monospace',
          opacity: textOpacity
        });
      alertLines.forEach((line, row) => room.visual.text(line, 1.2,
        11.95 + row * 0.8, {
          align: 'left', color: '#ff8ad8', font: 'bold 0.72 monospace',
          opacity: textOpacity
        }));
      groupedRoles.forEach((group, row) => {
        room.visual.text(group.name, 1.2, groupStartY + row * 0.8, {
          align: 'left', color: '#64d2ff',
          font: 'bold 0.68 monospace', opacity: textOpacity
        });
        group.entries.forEach((entry, column) =>
        room.visual.text(entry.text, 6.15 + column * 5.1,
          groupStartY + row * 0.8, {
            align: 'left', color: entry.color,
            font: 'bold 0.81 monospace',
            opacity: textOpacity
          }));
      });
    }
  };

  return { updateDashboard, drawDashboard };
};

module.exports = { createColonyDashboard };
