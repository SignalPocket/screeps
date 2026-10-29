'use strict';

// Pure body construction shared by spawn planning and tests. Screeps globals
// are injected so this module can be validated without a running game.
const createBodyFactory = constants => {
  const { WORK, CARRY, MOVE, ATTACK, RANGED_ATTACK, HEAL, CLAIM, TOUGH,
    BODYPART_COST } = constants;
  const workerBody = [WORK, CARRY, MOVE];
  const workerCost = workerBody.reduce((total, part) =>
    total + BODYPART_COST[part], 0);
  const bodyPartCodes = {
    [WORK]: 'W',
    [CARRY]: 'C',
    [MOVE]: 'M',
    [ATTACK]: 'A',
    [RANGED_ATTACK]: 'R',
    [HEAL]: 'H',
    [CLAIM]: 'CL',
    [TOUGH]: 'T'
  };
  const displayOrder = [MOVE, CARRY, WORK, TOUGH, ATTACK,
    RANGED_ATTACK, HEAL, CLAIM];

  const getBodyCode = parts => {
    const types = parts.map(part =>
      typeof part === 'string' ? part : part.type);
    const groups = displayOrder.map(type => {
      const count = types.filter(partType => partType === type).length;
      return count ? (bodyPartCodes[type] || type).repeat(count) : null;
    }).filter(Boolean);
    const unknownTypes = [...new Set(types.filter(type =>
      displayOrder.indexOf(type) === -1))];
    for (const type of unknownTypes) {
      const count = types.filter(partType => partType === type).length;
      groups.push((bodyPartCodes[type] || type).repeat(count));
    }
    return groups.join('-');
  };

  const buildBody = (role, energy) => {
    if (role === 'claimer') {
      if (energy >= BODYPART_COST[CLAIM] + BODYPART_COST[WORK] +
          BODYPART_COST[CARRY] + BODYPART_COST[MOVE]) {
        return [WORK, CARRY, CLAIM, MOVE];
      }
      if (energy >= BODYPART_COST[CLAIM] + BODYPART_COST[WORK] +
          BODYPART_COST[MOVE]) {
        return [WORK, CLAIM, MOVE];
      }
      return energy >= BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]
        ? [CLAIM, MOVE] : null;
    }
    if (role === 'miner' || role === 'harvester' || role === 'digger' ||
        role === 'remote-scout') {
      const moveParts = energy >= 350 ? 2 : 1;
      const workParts = Math.min(48,
        Math.floor((energy - BODYPART_COST[CARRY] -
          moveParts * BODYPART_COST[MOVE]) /
          BODYPART_COST[WORK]));
      if (workParts < 1) return null;
      return [...Array(workParts).fill(WORK), CARRY,
        ...Array(moveParts).fill(MOVE)];
    }
    if (role === 'hauler' || role === 'remote-hauler' ||
        role === 'refiller' || role === 'rebalancer') {
      const pairCost = BODYPART_COST[CARRY] + BODYPART_COST[MOVE];
      if (energy < workerCost) return null;
      const body = [WORK, CARRY, MOVE];
      let cost = workerCost;
      while (body.length + 2 <= 50 && cost + pairCost <= energy) {
        body.push(CARRY, MOVE);
        cost += pairCost;
      }
      if (body.length < 50 && cost + BODYPART_COST[CARRY] <= energy) {
        body.push(CARRY);
      }
      return body;
    }
    if (role === 'upgrader') {
      const moveParts = energy >= 550 ? 2 : 1;
      const workParts = Math.max(1, Math.floor(
        (energy - BODYPART_COST[CARRY] -
          moveParts * BODYPART_COST[MOVE]) / BODYPART_COST[WORK]));
      let cost = workParts * BODYPART_COST[WORK] +
        BODYPART_COST[CARRY] + moveParts * BODYPART_COST[MOVE];
      if (cost > energy) return null;
      const body = [...Array(workParts).fill(WORK), CARRY,
        ...Array(moveParts).fill(MOVE)];
      if (body.length < 50 && cost + BODYPART_COST[CARRY] <= energy) {
        body.push(CARRY);
      }
      return body;
    }
    if (energy < workerCost) return null;
    const body = [];
    let cost = 0;
    while (body.length + workerBody.length <= 50 &&
        cost + workerCost <= energy) {
      body.push(...workerBody);
      cost += workerCost;
    }
    if (body.filter(part => part === MOVE).length === 1 &&
        body.length < 50 && cost + BODYPART_COST[MOVE] <= energy) {
      body.push(MOVE);
      cost += BODYPART_COST[MOVE];
    }
    if (body.length < 50 && cost + BODYPART_COST[WORK] <= energy) {
      body.push(WORK);
      cost += BODYPART_COST[WORK];
    }
    if (body.length < 50 && cost + BODYPART_COST[CARRY] <= energy) {
      body.push(CARRY);
    }
    if (body.indexOf(WORK) === -1 || body.indexOf(CARRY) === -1 ||
        body.indexOf(MOVE) === -1) return null;
    return body.length ? body : null;
  };

  return { workerBody, workerCost, buildBody, getBodyCode };
};

module.exports = { createBodyFactory };
