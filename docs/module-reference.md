# Module reference

This is the low-level ownership index. Factory modules receive Screeps globals
or collaborators through dependency injection so their logic can be tested in
Node without the game runtime.

## Orchestration

- `main.js`: composes the system, schedules work, selects spawn assignments,
  runs room/creep loops, and executes remaining inline behavior.
- `memory.maintenance.js`: expires dead creep and stale navigation,
  commitment, and room state.
- `room.index.js`: per-tick cached sources, structures, sites, creeps, and slow
  work inventory.

## Policy, stages, and health

- `colony.policy.js`: pure authoritative staffing, health, permission, and
  budget derivation.
- `room.situation.js`: live room observation adapter and policy cache.
- `room.scaling.js`: capacity-relative energy, reserve, and backlog scaling.
- `room.stages.js`: immutable RCL 0-8 goals, logic, construction, and gates.
- `room.strategy.js`: earliest unmet progression gate and human-facing plan.
- `room.status.js`: pure explanatory room health/status.
- `room.trends.js`: sampled trends and bounded policy adjustments.
- `health.operations.js`: task, lane, role, idle, movement, source, and remote
  behavior windows.
- `health.reporting.js`: compact health summary formatting.
- `health.query.js`: local query/report entry point.

## Staffing, bodies, and population

- `staffing.plan.js`: viable coverage by job and minimum-gap ranking.
- `staffing.minimums.js`: deterministic minimum-gap selector.
- `minimum.spawn.js`: local minimum gap to spawn assignment.
- `worker.limits.js`: minimum/desired total population from policy.
- `population.control.js`: brigade-aware cap and bounded retirements.
- `body.archetypes.js`: role-to-capability family mapping and roster shortages.
- `body.factory.js`: energy-budgeted Screeps body construction and body labels.
- `spawn.policy.js`: cap enforcement, charge wait, emergency budget, and final
  body request.
- `creep.lifecycle.js`: capability and replacement-life predicates.
- `creep.naming.js`: stable room/source ordinals and birth names.
- `creep.assignment.js`: bounded role reconciliation.
- `builder.roles.js`: builder scope/mission normalization and predicates.
- `builder.roster.js`: builder allocation helpers.

## Local energy and work

- `source.staffing.js`: source WORK capacity, stations, and learned targets.
- `source.positions.js`: source station and tunnel geometry.
- `source.assignment.js`: stable source-slot assignment.
- `source.recovery.js`: missing-WORK recovery within usable station limits.
- `source.collection.js`: source buffer grouping and pass-through selection.
- `refill.dispatch.js`: unique spawn/extension refill matching.
- `refill.management.js`: refill-cluster ownership and specialist lifecycle.
- `energy.phase.js`: spawn-charge versus normal-work hysteresis.
- `work.dispatch.js`: unique build, repair, and upgrade assignments.
- `construction.priority.js`: link/container/extension/road priority and site
  crew demand.
- `salvage.dispatch.js`: unique dropped-resource, ruin, and tombstone claims.
- `resource.reservations.js`: per-tick resource/capacity ledger.
- `task.reservations.js`: exclusive/shared task target claims.
- `creep.routing.js`: bounded local routing and rebalancer helpers.

## Movement and infrastructure

- `movement.service.js`: path caching, traffic costs, reservations, stuck and
  oscillation recovery.
- `road.planner.js`: strategic paths, traffic heat, budgets, drawing, and road
  site placement.
- `infrastructure.planner.js`: extension/container/storage/controller layout
  and site safeguards.
- `rcl5.infrastructure.js`: controller/spawn link and tower planning plus link
  transfers.
- `landmark.flags.js`: durable visual/recoverable infrastructure anchors.

## Controller brigade

- `controller.brigade.constants.js`: role, plan version, size, leg, and
  replacement constants.
- `controller.brigade.plan.js`: route-to-relay pipeline planning.
- `controller.brigade.readiness.js`: staffing and backlog readiness gate.
- `controller.brigade.roster.js`: stable slot allocation and replacement gaps.
- `controller.brigade.runtime.js`: relay movement, transfers, endpoint feed,
  backpressure, and statistics.
- `controller.brigade.js`: subsystem composition/export facade.
- `controller.stations.js`: unique controller worker positions.

## Remotes and expansion

- `outpost.planning.js`: outpost discovery and demand records.
- `outpost.maintenance.js`: outpost construction/repair demand.
- `outpost.status.js`: remote production and backlog status.
- `remote.hauling.js`: lane readiness, route throughput, carrier target, and
  dispatch ranking.
- `remote.roster.js`: stable carrier room/slot ownership and surplus aging.
- `remote.corridors.js`: inter-room route and road planning.
- `expansion.planner.js`: claim target scoring and state progression.

## Defense, dashboards, and reporting

- `tower.control.js`: tower attack, heal, and repair execution.
- `colony.dashboard.js`: visual room/colony policy and health dashboard.
- `colony.work-metrics.js`: aggregate construction and repair activity.
- `creep.reporting.js`: compact role/task/target labels and death logs.

## Tests and tooling

- `check.js`: syntax-check all scripts and run all `*.test.js` files.
- `*.test.js`: focused pure/injected subsystem scenarios.
- `common.test.js`: broad integration-style module scenarios.
- `screeps.local.example.json`: token-free local configuration example.
