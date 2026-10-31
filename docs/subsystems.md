# Subsystems and decision flow

## Policy and health

`room.situation.js` gathers one cached snapshot per room per tick.
`colony.policy.js` derives staffing, health gates, and budgets.
`room.status.js` produces explanatory dashboard health.
`health.operations.js` records behavioral counters over windows.
`room.trends.js` converts sustained evidence into bounded policy adjustments.

Boundary: status and counters provide evidence; only policy owns targets.

## Staffing and spawning

`staffing.plan.js` counts viable coverage by job and ranks minimum gaps.
`minimum.spawn.js` converts the selected local minimum gap into an assignment.
`body.archetypes.js` checks whether the colony has the necessary body families.
`worker.limits.js` computes total population budgets from policy.
`spawn.policy.js` decides whether and at what energy to spawn the selected
assignment. `population.control.js` bounds brigade population and retirements.

Boundary: selection chooses the next capability; spawn policy enforces the cap
and charge timing. Urgency never changes the cap.

## Sources and local energy

`source.staffing.js` measures source WORK demand and usable stations.
`source.assignment.js` gives each miner a stable source slot.
`source.recovery.js` restores missing WORK without exceeding usable positions.
`source.collection.js` groups source buffers for carriers.
`source.positions.js` owns station and tunnel geometry.
`refill.dispatch.js` assigns spawn/extension destinations.
`refill.management.js` owns stable clump refill specialists.
`energy.phase.js` prevents workers from oscillating between charging the spawn
network and ordinary work.

Boundary: sources create energy, carriers move it, refillers own final spawn
and extension delivery. A role may help another lane only through an explicit
fallback that preserves ownership.

## Remotes

`outpost.planning.js` discovers and records active remote demand.
`remote.hauling.js` measures ready lanes, routes, capacity, and throughput.
`remote.roster.js` assigns existing carriers to stable room/slot ownership.
`outpost.maintenance.js` derives remote repair/build demand.
`remote.corridors.js` plans inter-room travel infrastructure.
`outpost.status.js` reports remote production and backlog.

Boundary: survey and route modules measure demand. Policy grants maintenance or
growth. Staffing and roster modules map the granted totals to lanes.

## Construction and infrastructure

`room.stages.js` declares stage intent. `room.strategy.js` reports the earliest
unmet progression gate. `infrastructure.planner.js` owns containers,
extensions, storage-related layout, and placement safeguards.
`rcl5.infrastructure.js` owns link/tower placement and link transfers.
`road.planner.js` owns strategic paths, heat history, road budgets, and sites.
`construction.priority.js` ranks links before extensions and calculates a
bounded site crew. `landmark.flags.js` preserves durable layout anchors.

Boundary: planners may place only legal, non-duplicate sites. Crew size is
scaled by policy health. Construction sites do not increase population outside
the builder targets.

## Controller brigade

`controller.brigade.plan.js` derives the physical pipeline.
`controller.brigade.readiness.js` verifies essential staffing and work queues.
`controller.brigade.roster.js` owns stable relay slots.
`controller.brigade.runtime.js` executes handoffs and endpoint feeding.
`controller.brigade.js` composes the subsystem and exports constants.

Boundary: a valid geometry plan is necessary but not sufficient. Current RCL,
health permission, and staffing readiness control rollout and replacement.

## Work, movement, and reservations

`work.dispatch.js` assigns distinct construction, repair, and upgrade work.
`task.reservations.js` owns target-level task claims.
`resource.reservations.js` owns energy/capacity accounting.
`movement.service.js` owns cached paths, traffic avoidance, and stuck recovery.
`creep.assignment.js` reconciles role memory without gratuitous churn.
`creep.routing.js` contains bounded cross-role routing helpers.

Boundary: assignment stability is a feature. Replanning occurs on invalidation,
completion, policy change, or measured failure—not every tick.

## Runtime and reporting

`main.js` composes dependencies, schedules slow work, runs planners, and
executes creep behavior. It should get smaller over time. New pure decisions
belong in modules with tests.

`colony.dashboard.js`, `colony.work-metrics.js`, `creep.reporting.js`,
`health.reporting.js`, and `health.query.js` expose decisions without owning
them. `memory.maintenance.js` removes stale runtime state safely.
