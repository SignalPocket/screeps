'use strict';

// Keep population arithmetic independent from the Screeps API and from the
// policy stages that mutate roles. The initial colony policy has miner,
// hauler, and builder remote counts; operation policy may later augment that
// same schema with reserver counts.
const REMOTE_COUNTS = Object.freeze({
  min: ['minersMin', 'haulersMin', 'buildersMin', 'reserversMin'],
  desired: ['miners', 'haulers', 'builders', 'reservers'],
  max: ['miners', 'haulers', 'builders', 'reservers']
});

const localTotal = (roles, key) => Object.values(roles || {})
  .reduce((sum, role) => sum + Math.max(0, role && role[key] || 0), 0);

const remoteTotal = (remote, key) => REMOTE_COUNTS[key]
  .reduce((sum, field) => sum + (remote[field] || 0), 0);

/** Return population totals without changing the supplied policy. */
const calculatePopulationTotals = policy => {
  const source = policy || {};
  const remote = source.remote || {};
  return ['min', 'desired', 'max'].reduce((totals, key) => {
    totals[key] = localTotal(source.roles, key) + remoteTotal(remote, key);
    return totals;
  }, {});
};

module.exports = { calculatePopulationTotals };
