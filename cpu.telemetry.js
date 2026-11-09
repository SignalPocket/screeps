'use strict';

const PLANNING_STAGES = [
  'observation', 'workforce', 'infrastructure', 'dispatch'
];
const STAGES = [
  'planning', 'creeps', 'defense', 'reporting', ...PLANNING_STAGES
];

const finiteSample = value => Number.isFinite(value) && value >= 0
  ? value : null;

const createCpuStageRecorder = getUsed => {
  const sample = () => {
    if (typeof getUsed !== 'function') return null;
    try {
      return finiteSample(getUsed());
    } catch (error) {
      return null;
    }
  };
  let previous = sample();
  const totals = {};
  const mark = stage => {
    const current = sample();
    if (!STAGES.includes(stage) || previous === null || current === null) {
      if (current !== null) previous = current;
      return null;
    }
    const delta = Math.max(0, current - previous);
    totals[stage] = (totals[stage] || 0) + delta;
    previous = current;
    return delta;
  };
  const aggregate = (stage, sources) => {
    if (!STAGES.includes(stage) || !Array.isArray(sources)) return null;
    const values = sources.map(source => finiteSample(totals[source]));
    if (values.some(value => value === null)) return null;
    totals[stage] = values.reduce((sum, value) => sum + value, 0);
    return totals[stage];
  };
  const snapshot = () => Object.fromEntries(STAGES
    .filter(stage => finiteSample(totals[stage]) !== null)
    .map(stage => [stage, totals[stage]]));
  return { mark, aggregate, snapshot };
};

const stageAverages = current => Object.fromEntries(STAGES.map(stage => [
  stage,
  (finiteSample(current.stageTotals?.[stage]) || 0) / current.samples
]));

const updateCpuPerformanceWindow = ({ performance, tick, total, stages,
  interval = 20 }) => {
  if (!Number.isSafeInteger(tick) || !Number.isSafeInteger(interval) ||
      interval <= 0 || finiteSample(total) === null) return performance;
  const next = performance && performance.version === 1
    ? { ...performance } : { version: 1 };
  const bucket = Math.floor(tick / interval) * interval;
  const current = next.current;
  if (!current || current.bucket !== bucket) {
    if (current && Number.isSafeInteger(current.samples) &&
        current.samples > 0 && finiteSample(current.total) !== null &&
        finiteSample(current.maximum) !== null) {
      next.previous = {
        bucket: current.bucket,
        samples: current.samples,
        average: current.total / current.samples,
        maximum: current.maximum,
        stages: stageAverages(current)
      };
    }
    next.current = { bucket, samples: 0, total: 0, maximum: 0,
      stageTotals: Object.fromEntries(STAGES.map(stage => [stage, 0])) };
  } else {
    next.current = { ...current,
      stageTotals: Object.fromEntries(STAGES.map(stage => [
        stage, finiteSample(current.stageTotals?.[stage]) || 0
      ])) };
  }
  next.current.samples++;
  next.current.total += total;
  next.current.maximum = Math.max(next.current.maximum, total);
  const lastStages = {};
  for (const stage of STAGES) {
    const value = finiteSample(stages?.[stage]);
    if (value === null) continue;
    next.current.stageTotals[stage] =
      (finiteSample(next.current.stageTotals[stage]) || 0) + value;
    lastStages[stage] = value;
  }
  next.last = total;
  next.lastStages = lastStages;
  next.updated = tick;
  return next;
};

module.exports = { STAGES, PLANNING_STAGES, createCpuStageRecorder,
  updateCpuPerformanceWindow };
