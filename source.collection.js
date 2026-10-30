'use strict';

// Source-buffer selection is kept pure so pressure balancing can be tested
// without running the full creep executor.
const buildSourceGroups = ({
  room, sources, buffers, getContainerPurpose, getUnreservedEnergy
}) => sources.map((source, index) => {
  const sourceBuffers = buffers.filter(buffer =>
    getContainerPurpose(room, buffer.pos) === `source:${source.id}`);
  return {
    source,
    index,
    stored: sourceBuffers.reduce((total, buffer) =>
      total + getUnreservedEnergy(buffer), 0),
    capacity: sourceBuffers.reduce((total, buffer) =>
      total + (buffer.store.getCapacity() || 0), 0)
  };
}).filter(group => group.capacity > 0 && group.stored > 0);

const selectSourceGroup = (groups, preferredSourceId, {
  pressureDelta = 0.05,
  criticalRatio = 0.9
} = {}) => {
  const ranked = (groups || []).filter(group =>
    group.capacity > 0 && group.stored > 0).slice()
    .sort((a, b) => b.stored / b.capacity - a.stored / a.capacity ||
      b.index - a.index);
  const fullest = ranked[0];
  if (!fullest) return null;
  const preferred = ranked.find(group =>
    group.source.id === preferredSourceId);
  if (!preferred || preferred === fullest) return preferred || fullest;
  const preferredRatio = preferred.stored / preferred.capacity;
  const fullestRatio = fullest.stored / fullest.capacity;
  const materiallyMoreUrgent = fullestRatio - preferredRatio >= pressureDelta;
  const newlyCritical = fullestRatio >= criticalRatio &&
    preferredRatio < criticalRatio;
  return materiallyMoreUrgent || newlyCritical ? fullest : preferred;
};

const selectPassingSourceBuffer = ({
  room, position, freeCapacity, buffers, getContainerPurpose,
  getUnreservedEnergy
}) => {
  if (!position || freeCapacity <= 0) return null;
  return (buffers || []).filter(buffer =>
    String(getContainerPurpose(room, buffer.pos) || '').startsWith('source:') &&
    position.getRangeTo(buffer) <= 1 &&
    getUnreservedEnergy(buffer) > 0)
    .sort((a, b) => getUnreservedEnergy(b) - getUnreservedEnergy(a))[0] ||
    null;
};

module.exports = {
  buildSourceGroups, selectSourceGroup, selectPassingSourceBuffer
};
