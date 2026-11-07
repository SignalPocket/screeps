"use strict";

// Policy measures energy exported across the origin border, not home receipts.
const updateDeliveryPolicy = ({ tick, survey, economy = {}, backlog, visible }) => {
  const previous = survey.deliveryPolicy || {};
  if (!survey.exportTrackingStarted) survey.exportTrackingStarted = tick;
  const lastExport = economy.lastExport || 0;
  const since = lastExport || survey.exportTrackingStarted;
  const drought = Math.max(0, tick - since);
  const degraded = visible && backlog >= 1000 && drought >= 250;
  let blocked = previous.blocked === true;
  let blockedSince = previous.blockedSince || tick;
  if (!blocked && visible && backlog >= 2000 && drought >= 750) {
    blocked = true;
    blockedSince = tick;
  }
  // Three separate 100-tick windows demonstrate sustained transport recovery.
  const recoveredWindows = Object.entries(economy.exportBuckets || {}).filter(
    ([start, amount]) => Number(start) >= blockedSince &&
      Number(start) >= tick - 1500 && amount > 0).length;
  if (blocked && visible && drought < 500 && recoveredWindows >= 3) {
    blocked = false;
  }
  const policy = { blocked, blockedSince: blocked ? blockedSince : null,
    updated: tick, metric: 'border-export', lastExport, drought, backlog: visible ? backlog : null,
    recoveredWindows, degraded, allowMining: !blocked,
    allowConstruction: !blocked && !degraded,
    protectRepairs: true, prioritizeHauling: blocked || degraded,
    reason: blocked ? 'export drought with accumulated energy; restore transport' :
      degraded ? 'export flow degraded; prioritize transport before shutdown' :
      !visible ? 'no fresh inventory; retain previous delivery state' :
      'export drought/backlog gate not active' };
  survey.deliveryPolicy = policy;
  return policy;
};
module.exports = { updateDeliveryPolicy };
