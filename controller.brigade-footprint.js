'use strict';

// Convert one already-approved active plan into room-local coordinate keys.
// Consumers keep their own policy: stations exclude these keys, while
// movement assigns bypass costs and protects occupied relay tiles.
const getBrigadeProtectedFootprint = plan => {
  if (!plan) return new Set();
  const points = [
    ...(Array.isArray(plan.segments)
      ? plan.segments.flatMap(segment => segment
        ? [segment.pickup, segment.delivery].filter(Boolean) : [])
      : []),
    ...(Array.isArray(plan.rightOfWay) ? plan.rightOfWay : [])
  ];
  return new Set(points.filter(point => point &&
    Number.isFinite(point.x) && Number.isFinite(point.y))
    .map(point => `${point.x}:${point.y}`));
};

module.exports = { getBrigadeProtectedFootprint };
