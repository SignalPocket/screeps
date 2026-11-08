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
  // Favor roster throughput over concentrating capacity in a few slow bodies.
  // Seven hundred energy is the general per-creep ceiling, including requests
  // that ask to maximize a specialist. Productive source miners have one
  // narrow 800-energy exception below. Minimum viable bodies are never
  // reduced below their required parts.
  const bodyEnergyRatio = 0.9;
  const routineBodyEnergyCap = 700;
  const productiveMinerEnergyCap = 800;
  const scaledBodyEnergy = (role, available, maximize = false) => {
    const minimum = role === 'claimer'
      ? BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]
      : workerCost;
    if (available < minimum) return available;
    const capped = Math.min(available, routineBodyEnergyCap);
    // Maximized specialists use the whole bounded budget. They no longer
    // bypass the colony-wide ceiling.
    if (maximize && !['miner', 'harvester', 'remote-miner',
      'controller-relay', 'claimer'].includes(role)) return capped;
    const scaled = Math.floor(capped * bodyEnergyRatio / 50) * 50;
    if (role === 'remote-miner' && available >= 450) return Math.max(450, scaled);
    return Math.min(available, Math.max(minimum, scaled));
  };

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

  const buildBody = (role, energy, options = {}) => {
    // Spawning is planned by durable body capability. Legacy role names stay
    // accepted while old callers migrate to the archetype vocabulary.
    const bodyTypeAliases = {
      carrier: 'hauler',
      controller: 'upgrader',
      field: 'remote-miner',
      worker: 'builder'
    };
    role = bodyTypeAliases[role] || role;
    if (['miner', 'harvester'].includes(role) && options.miningProduction > 0) {
      // A source owner is the deliberate exception to the general ceiling:
      // one 800-energy body can sustain normal source regeneration through
      // its unloading ticks, avoiding a second permanent miner slot.
      const budget = Math.min(energy, productiveMinerEnergyCap);
      const targetRate = options.miningProduction * 1.05;
      let best = null;
      for (let work = 1; work <= 12; work++) for (let carry = 1; carry <= 4; carry++) {
        const moves = budget >= 350 ? 2 : 1;
        const cost = work * BODYPART_COST[WORK] + carry * BODYPART_COST[CARRY] + moves * BODYPART_COST[MOVE];
        if (cost > budget) continue;
        const batch = work * 2;
        const cycles = Math.floor(carry * 50 / batch);
        if (!cycles) continue;
        const rate = batch * cycles / (cycles + 1);
        const sufficient = rate >= targetRate;
        if (!best || sufficient && !best.sufficient || sufficient && best.sufficient && cost < best.cost ||
            !sufficient && !best.sufficient && (rate > best.rate || rate === best.rate && cost < best.cost)) {
          best = { work, carry, moves, cost, rate, sufficient };
        }
      }
      return best ? [...Array(best.work).fill(WORK), ...Array(best.carry).fill(CARRY),
        ...Array(best.moves).fill(MOVE)] : null;
    }
    // Narrow functional-body exceptions for the explicit operational plan.
    if (role === 'remote-reserver') {
      const cost = 2 * BODYPART_COST[CLAIM] + 2 * BODYPART_COST[MOVE];
      return energy >= cost ? [CLAIM, CLAIM, MOVE, MOVE] : null;
    }
    if (role === 'upgrader' && options.operationWork) {
      const work = Math.min(15, Math.max(1, options.operationWork));
      const moves = Math.ceil(work / 4);
      const body = [...Array(work).fill(WORK), CARRY, CARRY,
        ...Array(moves).fill(MOVE)];
      const cost = body.reduce((sum, part) => sum + BODYPART_COST[part], 0);
      return energy >= cost ? body : null;
    }
    const availableEnergy = energy;
    energy = scaledBodyEnergy(role, energy, options.maximize);
    if (options.workLimit && ['miner', 'harvester'].includes(role)) {
      energy = Math.min(availableEnergy, routineBodyEnergyCap, Math.max(energy,
        options.workLimit * BODYPART_COST[WORK] + BODYPART_COST[CARRY] + 2 * BODYPART_COST[MOVE]));
    }
    // The experimental controller brigade uses deliberately small road
    // shuttles. Two CARRY parts keep each hop useful while one MOVE lets the
    // creep crawl into position and then travel normally on roads.
    if (role === 'controller-relay') {
      const cost = 2 * BODYPART_COST[CARRY] + BODYPART_COST[MOVE];
      return energy >= cost ? [CARRY, CARRY, MOVE] : null;
    }
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
    if (role === 'defender') {
      const emergencyUnit = [TOUGH, ATTACK, MOVE];
      const emergencyCost = emergencyUnit.reduce((sum, part) =>
        sum + BODYPART_COST[part], 0);
      if (energy < emergencyCost) return null;
      const mobileUnit = [TOUGH, ATTACK, MOVE, MOVE];
      const mobileCost = mobileUnit.reduce((sum, part) =>
        sum + BODYPART_COST[part], 0);
      if (energy < mobileCost) return emergencyUnit;
      // Preserve the established two-CARRY post-war brigade handoff. At the
      // 300-energy emergency boundary that legacy utility necessarily crawls
      // off-road; once 390 energy is funded, pair the payload with two MOVE so
      // the entire body remains plains-mobile.
      const relayPayload = [CARRY, CARRY];
      const relayCost = 2 * BODYPART_COST[CARRY];
      if (energy >= mobileCost + relayCost + 2 * BODYPART_COST[MOVE]) {
        const count = Math.max(1, Math.min(11,
          Math.floor((energy - relayCost - 2 * BODYPART_COST[MOVE]) /
            mobileCost)));
        return [...Array.from({ length: count }, () => mobileUnit).flat(),
          ...relayPayload, MOVE, MOVE];
      }
      if (energy >= emergencyCost + relayCost) {
        return [...emergencyUnit, ...relayPayload];
      }
      return mobileUnit;
    }
    if (role === 'remote-miner') {
      const moveParts = energy >= 450 ? 2 : 1;
      const workParts = Math.min(3, Math.floor(
        (energy - BODYPART_COST[CARRY] -
          moveParts * BODYPART_COST[MOVE]) / BODYPART_COST[WORK]));
      if (workParts < 1) return null;
      return [...Array(workParts).fill(WORK), CARRY,
        ...Array(moveParts).fill(MOVE)];
    }
    if (role === 'miner' || role === 'harvester') {
      const moveParts = energy >= 350 ? 2 : 1;
      const workParts = Math.min(48, options.workLimit || 48,
        Math.floor((energy - BODYPART_COST[CARRY] -
          moveParts * BODYPART_COST[MOVE]) /
          BODYPART_COST[WORK]));
      if (workParts < 1) return null;
      return [...Array(workParts).fill(WORK), CARRY,
        ...Array(moveParts).fill(MOVE)];
    }
    if (role === 'remote-hauler' || role === 'refiller' ||
        role === 'hauler' || role === 'rebalancer') {
      const pairCost = BODYPART_COST[CARRY] + BODYPART_COST[MOVE];
      // Transport roles run logistics lanes only. A WORK part cannot help
      // them and used to halve emergency carry capacity at 200 energy.
      const pairs = Math.min(25, options.carryParts || 25, Math.floor(energy / pairCost));
      return pairs > 0
        ? [...Array(pairs).fill(CARRY), ...Array(pairs).fill(MOVE)]
        : null;
    }
    if (role === 'upgrader' && options.workLimit) {
      const carry=energy>=300?2:1,move=energy>=550?2:1;
      const work=Math.min(options.workLimit,50-carry-move,Math.floor(
        (energy-carry*BODYPART_COST[CARRY]-move*BODYPART_COST[MOVE])/BODYPART_COST[WORK]));
      return work>0?[...Array(work).fill(WORK),...Array(carry).fill(CARRY),...Array(move).fill(MOVE)]:null;
    }
    if (role === 'upgrader') {
      const moveParts = energy >= 550 ? 2 : 1;
      const workParts = Math.min(47, Math.max(1, Math.floor(
        (energy - BODYPART_COST[CARRY] -
          moveParts * BODYPART_COST[MOVE]) / BODYPART_COST[WORK])));
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
    // Builders remain road-mobile at every energy level. Spare energy cannot
    // buy a lone WORK or CARRY part because that would create more road
    // fatigue than the MOVE parts can clear each tick.
    if (body.indexOf(WORK) === -1 || body.indexOf(CARRY) === -1 ||
        body.indexOf(MOVE) === -1) return null;
    return body.length ? body : null;
  };

  return { workerBody, workerCost, bodyEnergyRatio, routineBodyEnergyCap,
    productiveMinerEnergyCap, buildBody, getBodyCode };
};

module.exports = { createBodyFactory };
