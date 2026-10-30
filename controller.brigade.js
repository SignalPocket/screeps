'use strict';

const {
  CONTROLLER_BRIGADE_ROLE,
  CONTROLLER_BRIGADE_SIZE,
  CONTROLLER_BRIGADE_PLAN_VERSION
} = typeof Game === 'undefined'
  ? require('./controller.brigade.constants')
  : require('controller.brigade.constants');
const { createControllerBrigadePlanner } = typeof Game === 'undefined'
  ? require('./controller.brigade.plan')
  : require('controller.brigade.plan');
const { createControllerBrigadeRuntime } = typeof Game === 'undefined'
  ? require('./controller.brigade.runtime')
  : require('controller.brigade.runtime');

// Compatibility facade: callers keep one brigade service while route
// optimization and tick-by-tick relay behavior remain independently testable.
const createControllerBrigade = dependencies => ({
  ...createControllerBrigadePlanner(dependencies),
  ...createControllerBrigadeRuntime(dependencies)
});

module.exports = {
  CONTROLLER_BRIGADE_ROLE,
  CONTROLLER_BRIGADE_SIZE,
  CONTROLLER_BRIGADE_PLAN_VERSION,
  createControllerBrigade
};
