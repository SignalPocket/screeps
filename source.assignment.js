'use strict';

const planSourceAssignments = ({ needs, candidates, getWork }) => {
  const workingNeeds = needs.map(need => ({ ...need }));
  const assignments = [];
  for (const candidate of candidates) {
    const reservedSource = candidate.sourceReserve ||
      candidate.sourceReplacement;
    const markedReplacement = reservedSource && workingNeeds.find(need =>
      need.sourceId === reservedSource && need.remaining > 0 &&
      need.workDeficit > 0);
    const available = workingNeeds.filter(need =>
      need.remaining > 0 && need.workDeficit > 0)
      .sort((a, b) =>
        b.workDeficit - a.workDeficit ||
        Number(b.sourceId === candidate.preferredSource) -
          Number(a.sourceId === candidate.preferredSource) ||
        b.remaining - a.remaining ||
        a.sourceId.localeCompare(b.sourceId));
    const need = markedReplacement || available[0];
    if (!need) {
      assignments.push({ candidate, sourceId: null });
      continue;
    }
    need.remaining--;
    need.workDeficit = Math.max(0,
      need.workDeficit - getWork(candidate));
    assignments.push({ candidate, sourceId: need.sourceId });
  }
  return { assignments, needs: workingNeeds };
};

module.exports = { planSourceAssignments };
