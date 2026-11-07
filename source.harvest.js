'use strict';
const harvestBatch = (creep, source, { WORK = 'work', power = 2, boosts = {} } = {}) => {
  const work = Array.isArray(creep.body) ? creep.body.reduce((sum, part) => {
    const type = typeof part === 'string' ? part : part.type;
    if (type !== WORK || typeof part !== 'string' && part.hits <= 0) return sum;
    const bonus = typeof part !== 'string' && part.boost && boosts[WORK]?.[part.boost]?.harvest || 1;
    return sum + power * bonus;
  }, 0) : creep.getActiveBodyparts(WORK) * power;
  return Math.min(Math.max(0, source.energy || 0), work);
};
const harvestBatchFits = (creep, source, options = {}) =>
  creep.store.getFreeCapacity(options.resource || 'energy') >= harvestBatch(creep, source, options);
const harvestSafely = ({ creep, source, resource = 'energy', WORK = 'work', power = 2,
  boosts = {}, ERR_FULL = -8 }) => harvestBatchFits(creep, source, {resource,WORK,power,boosts})
    ? creep.harvest(source) : ERR_FULL;
module.exports = { harvestBatch, harvestBatchFits, harvestSafely };
