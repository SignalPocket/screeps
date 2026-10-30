'use strict';

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));

const scaleEnergyBudget = (capacity, ratio, options = {}) => {
  const roomCapacity = Math.max(0, capacity || 0);
  const increment = Math.max(1, options.increment || 50);
  const minimum = Math.min(roomCapacity,
    Math.max(0, options.minimum == null ? 300 : options.minimum));
  const scaled = Math.floor(roomCapacity * ratio / increment) * increment;
  return Math.min(roomCapacity, Math.max(minimum, scaled));
};

const scaleReserve = (capacity, multiplier, minimum = 0) =>
  Math.max(minimum, Math.round(Math.max(0, capacity || 0) * multiplier));

// Backlog thresholds grow with the bodies a room can currently build. Clamp
// the factor so a destroyed or downgraded room reacts faster without making a
// mature room indifferent to large construction or repair queues.
const scaleBacklog = (base, capacity, referenceCapacity = 800) =>
  Math.round(base * clamp(
    Math.max(0, capacity || 0) / referenceCapacity, 0.75, 2));

module.exports = { scaleEnergyBudget, scaleReserve, scaleBacklog };
