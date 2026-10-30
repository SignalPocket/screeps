'use strict';

const selectMinimumStaffingGap = (roles, counts, priority = []) => {
  const priorityIndex = new Map(priority.map((role, index) => [role, index]));
  return Object.entries(roles || {})
    .map(([role, staffing]) => ({
      role,
      minimum: Math.max(0, staffing && staffing.min || 0),
      count: Math.max(0, counts && counts[role] || 0)
    }))
    .filter(entry => entry.count < entry.minimum)
    .map(entry => ({
      ...entry,
      coverage: entry.minimum > 0 ? entry.count / entry.minimum : 1
    }))
    .sort((a, b) => a.coverage - b.coverage ||
      (priorityIndex.get(a.role) ?? Number.MAX_SAFE_INTEGER) -
        (priorityIndex.get(b.role) ?? Number.MAX_SAFE_INTEGER) ||
      a.role.localeCompare(b.role))[0] || null;
};

module.exports = { selectMinimumStaffingGap };
