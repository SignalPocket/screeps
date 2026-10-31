'use strict';

const {
  CONTROLLER_BRIGADE_ROLE,
  CONTROLLER_BRIGADE_SIZE,
  CONTROLLER_BRIGADE_PLAN_VERSION,
  CONTROLLER_BRIGADE_REPLACEMENT_LEAD
} = typeof Game === 'undefined'
  ? require('./controller.brigade.constants')
  : require('controller.brigade.constants');
const { createControllerBrigadePlanner } = typeof Game === 'undefined'
  ? require('./controller.brigade.plan')
  : require('controller.brigade.plan');
const { createControllerBrigadeRuntime } = typeof Game === 'undefined'
  ? require('./controller.brigade.runtime')
  : require('controller.brigade.runtime');
const { createControllerBrigadeRoster } = typeof Game === 'undefined'
  ? require('./controller.brigade.roster')
  : require('controller.brigade.roster');

// Compatibility facade: callers keep one brigade service while route planning,
// roster ownership, and tick-by-tick behavior remain independently testable.
const createControllerBrigade = dependencies => {
  const roster = createControllerBrigadeRoster(dependencies);
  return {
    ...createControllerBrigadePlanner(dependencies),
    ...createControllerBrigadeRuntime({ ...dependencies, ...roster }),
    ...roster
  };
};

module.exports = {
  CONTROLLER_BRIGADE_ROLE,
  CONTROLLER_BRIGADE_SIZE,
  CONTROLLER_BRIGADE_PLAN_VERSION,
  CONTROLLER_BRIGADE_REPLACEMENT_LEAD,
  createControllerBrigade
};
