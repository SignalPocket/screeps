'use strict';

// Human-visible anchors that survive a Memory reset. Flags identify places;
// Memory continues to own the richer operational plans.
const createLandmarkFlags = ({
  Game, FIND_SOURCES, FIND_STRUCTURES, STRUCTURE_CONTAINER,
  COLOR_BLUE, COLOR_CYAN, COLOR_GREEN, COLOR_YELLOW, COLOR_ORANGE,
  COLOR_PURPLE, COLOR_WHITE
}) => {
  const nameFor = (room, key) => `LM_${room.name}_${key}`;
  const flagPosition = (room, key) => {
    const flag = Game.flags[nameFor(room, key)];
    return flag && flag.pos.roomName === room.name
      ? { x: flag.pos.x, y: flag.pos.y } : null;
  };
  const ensureFlag = (room, landmark) => {
    if (!landmark || !Number.isInteger(landmark.x) ||
        !Number.isInteger(landmark.y)) return false;
    const name = nameFor(room, landmark.key);
    const flag = Game.flags[name];
    if (!flag) {
      room.createFlag(landmark.x, landmark.y, name,
        landmark.color, landmark.secondaryColor);
      return true;
    }
    if (flag.pos.roomName !== room.name || flag.pos.x !== landmark.x ||
        flag.pos.y !== landmark.y) {
      flag.setPosition(landmark.x, landmark.y);
    }
    if (flag.color !== landmark.color ||
        flag.secondaryColor !== landmark.secondaryColor) {
      flag.setColor(landmark.color, landmark.secondaryColor);
    }
    return true;
  };
  const recover = room => {
    const primaryCluster = flagPosition(room, 'EXT_PRIMARY');
    const overflowCluster = flagPosition(room, 'EXT_OVERFLOW');
    const storage = flagPosition(room, 'STORAGE');
    if (!room.memory.extensionCluster && primaryCluster) {
      room.memory.extensionCluster = {
        ...primaryCluster, version: 'low-traffic-v1',
        recoveredFromFlag: Game.time
      };
    }
    if (!room.memory.extensionOverflowCluster && overflowCluster) {
      room.memory.extensionOverflowCluster = {
        ...overflowCluster, version: 'overflow-v1',
        recoveredFromFlag: Game.time
      };
    }
    if (!room.memory.storagePlan && storage) {
      room.memory.storagePlan = {
        ...storage, selected: Game.time, recoveredFromFlag: true
      };
    }
    const primary = flagPosition(room, 'RC_PRIMARY');
    const secondary = flagPosition(room, 'RC_SECONDARY');
    const branch = flagPosition(room, 'BRIG_BRANCH');
    if ((!room.memory.controllerContainerPairPlan ||
        room.memory.controllerContainerPairPlan.version !== 2) &&
        primary && secondary && branch) {
      const containers = room.find(FIND_STRUCTURES, {
        filter: structure => structure.structureType === STRUCTURE_CONTAINER
      });
      const at = point => containers.find(container =>
        container.pos.x === point.x && container.pos.y === point.y);
      const primaryContainer = at(primary);
      const secondaryContainer = at(secondary);
      room.memory.controllerContainerPairPlan = {
        version: 2,
        mode: 'stationary-branch',
        sacrificeClusterKey: 'overflow',
        primaryId: primaryContainer && primaryContainer.id,
        primaryX: primary.x,
        primaryY: primary.y,
        secondaryId: secondaryContainer && secondaryContainer.id,
        secondaryX: secondary.x,
        secondaryY: secondary.y,
        branchX: branch.x,
        branchY: branch.y,
        ready: Boolean(primaryContainer && secondaryContainer),
        recoveredFromFlags: Game.time
      };
      if (primaryContainer && secondaryContainer) {
        room.memory.controllerContainerPlan = {
          version: 3,
          ready: true,
          containerId: primaryContainer.id,
          containerIds: [primaryContainer.id, secondaryContainer.id],
          desiredX: primary.x,
          desiredY: primary.y,
          destinations: [
            { id: primaryContainer.id, ...primary },
            { id: secondaryContainer.id, ...secondary }
          ],
          recoveredFromFlags: Game.time
        };
      }
    }
  };
  const reconcile = room => {
    recover(room);
    const sources = room.find(FIND_SOURCES).slice()
      .sort((a, b) => a.id.localeCompare(b.id));
    const pair = room.memory.controllerContainerPairPlan;
    const controllerPlan = room.memory.controllerContainerPlan;
    const storagePoint = room.storage ? room.storage.pos :
      room.memory.storagePlan;
    const landmarks = [
      room.memory.extensionCluster && {
        key: 'EXT_PRIMARY', ...room.memory.extensionCluster,
        color: COLOR_YELLOW, secondaryColor: COLOR_GREEN
      },
      room.memory.extensionOverflowCluster && {
        key: 'EXT_OVERFLOW', ...room.memory.extensionOverflowCluster,
        color: COLOR_YELLOW, secondaryColor: COLOR_ORANGE
      },
      storagePoint && {
        key: 'STORAGE', x: storagePoint.x, y: storagePoint.y,
        color: COLOR_BLUE, secondaryColor: COLOR_WHITE
      },
      ...sources.map((source, index) => ({
        key: `SOURCE_${index + 1}`, x: source.pos.x, y: source.pos.y,
        color: COLOR_GREEN, secondaryColor: COLOR_WHITE
      })),
      controllerPlan && Number.isInteger(controllerPlan.desiredX) && {
        key: 'RC_PRIMARY', x: controllerPlan.desiredX,
        y: controllerPlan.desiredY,
        color: COLOR_PURPLE, secondaryColor: COLOR_WHITE
      },
      pair && Number.isInteger(pair.secondaryX) && {
        key: 'RC_SECONDARY', x: pair.secondaryX, y: pair.secondaryY,
        color: COLOR_PURPLE, secondaryColor: COLOR_CYAN
      },
      pair && Number.isInteger(pair.branchX) && {
        key: 'BRIG_BRANCH', x: pair.branchX, y: pair.branchY,
        color: COLOR_ORANGE, secondaryColor: COLOR_WHITE
      }
    ].filter(Boolean);
    for (const landmark of landmarks) ensureFlag(room, landmark);
    room.memory.landmarkFlags = {
      version: 1,
      updated: Game.time,
      names: landmarks.map(landmark => nameFor(room, landmark.key))
    };
    return landmarks;
  };
  return { recover, reconcile, nameFor };
};

module.exports = { createLandmarkFlags };
