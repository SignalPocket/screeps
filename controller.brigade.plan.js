'use strict';

const {
  CONTROLLER_BRIGADE_SIZE,
  CONTROLLER_BRIGADE_PLAN_VERSION,
  CONTROLLER_BRIGADE_MAX_LEG
} = typeof Game === 'undefined'
  ? require('./controller.brigade.constants')
  : require('controller.brigade.constants');

const range = (a, b) => Math.max(Math.abs(a.x - b.x),
  Math.abs(a.y - b.y));
const key = point => `${point.x},${point.y}`;
const compactPoint = point => ({ x: point.x, y: point.y });

const orientPath = (points, start) => {
  if (!points.length) return points;
  return range(points[0], start) <= range(points[points.length - 1], start)
    ? points : points.slice().reverse();
};

const createControllerBrigadePlanner = dependencies => {
  const {
    RoomPosition, LOOK_CONSTRUCTION_SITES, STRUCTURE_CONTAINER, STRUCTURE_ROAD,
    getRoomStructures, getContainerPurpose
  } = dependencies;

  const getControllerEndpoints = room => {
    const replacement = room.memory.controllerContainerPlan;
    const retiringId = replacement && replacement.retireContainerId;
    const buffers = getRoomStructures(room).filter(structure =>
      structure.structureType === STRUCTURE_CONTAINER &&
      structure.id !== retiringId &&
      (getContainerPurpose(room, structure.pos) === 'controller' ||
        structure.pos.getRangeTo(room.controller) <= 3))
      .sort((a, b) =>
        Number(Boolean(replacement && b.id === replacement.containerId)) -
          Number(Boolean(replacement && a.id === replacement.containerId)) ||
        a.pos.x - b.pos.x || a.pos.y - b.pos.y);
    if (buffers.length) {
      return buffers.map(buffer => ({ object: buffer, provisional: false }));
    }
    const site = replacement && Number.isInteger(replacement.desiredX) &&
      Number.isInteger(replacement.desiredY)
      ? room.lookForAt(LOOK_CONSTRUCTION_SITES,
        replacement.desiredX, replacement.desiredY)
        .find(candidate => candidate.structureType === STRUCTURE_CONTAINER)
      : null;
    return site ? [{ object: site, provisional: true }] : [];
  };

  const getRoadRoute = (room, endpoint) => {
    const pathPlan = room.memory.travelPathPlan;
    const route = pathPlan && Array.isArray(pathPlan.paths)
      ? pathPlan.paths.find(candidate =>
        Array.isArray(candidate.kinds) &&
        candidate.kinds.includes('storage') &&
        candidate.kinds.includes('controller')) : null;
    if (!route || !Array.isArray(route.points)) return null;
    const roadKeys = new Set(getRoomStructures(room)
      .filter(structure => structure.structureType === STRUCTURE_ROAD)
      .map(structure => key(structure.pos)));
    const points = orientPath(route.points.map(compactPoint), room.storage.pos)
      .filter((point, index, all) =>
        index === 0 || key(point) !== key(all[index - 1]));
    if (points.length < 16 ||
        points.some(point => !roadKeys.has(key(point))) ||
        range(points[0], room.storage.pos) > 1 ||
        range(points[points.length - 1], endpoint.pos) > 1 ||
        points.some((point, index) => index > 0 &&
          range(points[index - 1], point) > 1)) return null;
    return points;
  };

  const buildRoadSegments = (points, count, slotOffset, pipeline,
    destinationId) => {
    // Adjacent handoff edges do not belong to either creep's travel leg.
    const movementEdges = points.length - count;
    if (movementEdges < count ||
        movementEdges > count *
          CONTROLLER_BRIGADE_MAX_LEG) return null;
    const baseLength = Math.floor(movementEdges / count);
    let remainder = movementEdges % count;
    const lengths = Array(count).fill(baseLength);
    // Put unavoidable extra work toward the controller end, where congestion
    // benefits most from a creep owning a slightly longer uninterrupted leg.
    for (let slot = count - 1;
      slot >= 0 && remainder > 0; slot--, remainder--) lengths[slot]++;
    if (lengths.some(length => length < 1 ||
        length > CONTROLLER_BRIGADE_MAX_LEG)) return null;

    const segments = [];
    const boundaryIndexes = [0];
    let pickupIndex = 0;
    for (let slot = 0; slot < count; slot++) {
      const deliveryIndex = pickupIndex + lengths[slot];
      segments.push({
        slot: slotOffset + slot,
        pipeline,
        intake: slot === 0,
        upstreamSlot: slot === 0 ? null : slotOffset + slot - 1,
        downstreamSlot: slot === count - 1 ? null : slotOffset + slot + 1,
        terminal: slot === count - 1,
        destinationId: slot === count - 1 ? destinationId : undefined,
        pickup: compactPoint(points[pickupIndex]),
        delivery: compactPoint(points[deliveryIndex]),
        distance: lengths[slot],
        pickupOffRoad: false,
        deliveryOffRoad: false
      });
      if (slot < count - 1) {
        pickupIndex = deliveryIndex + 1;
        boundaryIndexes.push(pickupIndex);
      }
    }
    if (key(segments[segments.length - 1].delivery) !==
        key(points[points.length - 1])) return null;
    boundaryIndexes.push(points.length - 1);
    return { segments, boundaryIndexes, lengths };
  };

  const buildPlan = room => {
    if (!room || !room.storage || !room.controller) return null;
    const endpoints = getControllerEndpoints(room);
    if (!endpoints.length) return null;
    const primaryRoute = getRoadRoute(room, endpoints[0].object);
    if (!primaryRoute) return null;
    const pipelineSize = 8;
    const primaryPlan = buildRoadSegments(primaryRoute, pipelineSize, 0, 0,
      endpoints[0].object.id);
    if (!primaryPlan) return null;
    const pair = room.memory.controllerContainerPairPlan;
    if (endpoints.length >= 2 && pair && pair.version === 2 &&
        Number.isInteger(pair.branchX) && Number.isInteger(pair.branchY)) {
      const secondary = endpoints.find(endpoint =>
        endpoint.object.pos.x === pair.secondaryX &&
        endpoint.object.pos.y === pair.secondaryY);
      const primary = endpoints.find(endpoint => endpoint !== secondary);
      if (primary && secondary) {
        const branch = new RoomPosition(pair.branchX, pair.branchY, room.name);
        const directOptions = {
          ignoreCreeps: true,
          range: 0,
          plainCost: 1,
          swampCost: 1,
          maxOps: 4000,
          maxRooms: 1
        };
        const trunk = room.findPath(room.storage.pos, branch, directOptions)
          .map(compactPoint);
        const tail = room.findPath(branch, primary.object.pos, {
          ...directOptions, range: 1
        }).map(compactPoint);
        const positions = [...trunk, ...tail].filter((point, index, all) =>
          index === 0 || key(point) !== key(all[index - 1]));
        const branchIndex = positions.findIndex(point =>
          point.x === pair.branchX && point.y === pair.branchY);
        if (positions.length >= 16 &&
            positions.length <= CONTROLLER_BRIGADE_SIZE &&
            branchIndex >= 0 &&
            range(positions[0], room.storage.pos) <= 1 &&
            positions.every((point, index) => index === 0 ||
              range(positions[index - 1], point) <= 1) &&
            range(positions[positions.length - 1], primary.object.pos) <= 1) {
          const segments = positions.map((point, slot) => ({
            slot,
            pipeline: 0,
            intake: slot === 0,
            upstreamSlot: slot === 0 ? null : slot - 1,
            downstreamSlot: slot === positions.length - 1 ? null : slot + 1,
            terminal: slot === positions.length - 1,
            stationary: true,
            destinationIds: [
              ...(slot === branchIndex ? [secondary.object.id] : []),
              ...(slot === positions.length - 1 ? [primary.object.id] : [])
            ],
            pickup: compactPoint(point),
            delivery: compactPoint(point),
            distance: 0,
            pickupOffRoad: true,
            deliveryOffRoad: true
          }));
          return {
            version: CONTROLLER_BRIGADE_PLAN_VERSION,
            roomName: room.name,
            storageId: room.storage.id,
            controllerBufferId: primary.object.id,
            controllerBufferIds: [primary.object.id, secondary.object.id],
            provisional: false,
            targetSize: positions.length,
            activeSize: positions.length,
            stationary: true,
            branchSlot: branchIndex,
            roadOnly: false,
            routeLength: positions.length,
            rightOfWay: positions.map(compactPoint),
            boundaryIndexes: positions.map((point, index) => index),
            maxSegmentDistance: 0,
            pipelines: [{
              index: 0,
              storageId: room.storage.id,
              destinationIds: [primary.object.id, secondary.object.id],
              slots: segments.map(segment => segment.slot)
            }],
            segments
          };
        }
      }
    }
    const routes = [primaryRoute];
    const routeKeys = new Set();
    const rightOfWay = [];
    for (const route of routes) {
      for (const point of route) {
        if (routeKeys.has(key(point))) continue;
        routeKeys.add(key(point));
        rightOfWay.push(compactPoint(point));
      }
    }
    const segments = primaryPlan.segments;
    const pipelines = [{
      index: 0, storageId: room.storage.id,
      destinationId: endpoints[0].object.id,
      slots: primaryPlan.segments.map(segment => segment.slot)
    }];
    return {
      version: CONTROLLER_BRIGADE_PLAN_VERSION,
      roomName: room.name,
      storageId: room.storage.id,
      controllerBufferId: endpoints[0].object.id,
      controllerBufferIds: pipelines.map(pipeline => pipeline.destinationId),
      provisional: endpoints[0].provisional,
      targetSize: CONTROLLER_BRIGADE_SIZE,
      activeSize: segments.length,
      stationary: false,
      pipelines,
      roadOnly: true,
      routeLength: routes.reduce((total, route) => total + route.length, 0),
      rightOfWay,
      boundaryIndexes: primaryPlan.boundaryIndexes,
      maxSegmentDistance: Math.max(...segments.map(segment =>
        segment.distance)),
      segments
    };
  };

  return { buildPlan };
};

module.exports = { createControllerBrigadePlanner };
