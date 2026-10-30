'use strict';

const compact = value => value >= 1000
  ? `${(value / 1000).toFixed(1).replace('.0', '')}k` : `${value || 0}`;
const percent = value => value == null ? '-' : `${Math.round(value * 100)}%`;

const summarizeRoomHealth = (roomName, database) => {
  const records = database && Array.isArray(database.records)
    ? database.records : [];
  const latest = records[records.length - 1] || null;
  const adjustment = database && database.adjustment || {};
  const recovery = database && database.recovery || {
    key: 'baseline', label: 'BASELINE', action: 'collect health snapshots'
  };
  if (!latest) {
    return {
      roomName, samples: 0, capacity: database && database.maxRecords || 32,
      latest: null, adjustment, recovery,
      dashboard: `${roomName} health collecting baseline`,
      console: `${roomName} health: no snapshots yet`
    };
  }
  const repairBonus = adjustment.repairBonus || 0;
  const haulerBonus = adjustment.haulerBonus || 0;
  const bonuses = [repairBonus ? `fix+${repairBonus}` : '',
    haulerBonus ? `haul+${haulerBonus}` : ''].filter(Boolean).join(' ') ||
    'steady';
  return {
    roomName,
    samples: records.length,
    capacity: database.maxRecords || 32,
    latest,
    adjustment,
    recovery,
    dashboard: `Health ${records.length} | src ` +
      `${percent(latest.source)}/${percent(latest.sourceLow)} ` +
      `ext ${percent(latest.extensions)} RC ${percent(latest.work)} ` +
      `ready ${percent(latest.ready)} fix ${compact(latest.repair)} ` +
      `${bonuses} | ${recovery.label}`,
    console: `${roomName} health ${records.length}/` +
      `${database.maxRecords || 32} @${latest.tick} | stored ` +
      `${compact(latest.stored)} ready ${percent(latest.ready)} | ` +
      `source ${percent(latest.source)} low ` +
      `${percent(latest.sourceLow)} | extensions ` +
      `${percent(latest.extensions)} controller ${percent(latest.work)} | ` +
      `build ${compact(latest.build)} repair ${compact(latest.repair)} | ` +
      `population ${latest.population}/${latest.desired} | ${bonuses} | ` +
      `recovery ${recovery.label}: ${recovery.action}`
  };
};

module.exports = { compact, percent, summarizeRoomHealth };
