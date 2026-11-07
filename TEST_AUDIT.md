# Test suite redundancy audit

Issue: https://github.com/SignalPocket/screeps/issues/43

Stable task: test-suite-redundancy-audit. Owner: 01a1b731-85f2-7893-b117-1fa0e712c978.

Completed November 7, 2026, America/New_York. The original inventory was measured at c688457c60c2e30ad29887b3c6f6976a78bd6c3c. The final inventory, repeat checks and maintenance-runner review use 38bfd59e59d347460a3a0cf76f97c3d0f84480ac.

## Result and recommendation

Keep the existing suites. No whole-file byte duplicates were found among the original 84 gameplay suites, and the refreshed baseline adds the distinct spawn.denial suite for 85 total. The three manually reviewed clusters below contain overlapping assertions plus distinct regression protection. No source/test consolidation or deletion is justified by the measured evidence. The best next optimization target is runner process startup, but changing isolation requires a separate design and equivalence proof.

## Runner and measured cost

The package check command executes check.js. It starts a separate Node process to syntax-check each top-level JavaScript file, then starts another for each top-level test file. On this fixed isolated baseline it passed 194 scripts and 84 test files in 15729 ms. A separate npm.cmd run check also passed 194/84 (local log test-audit-20261107-1310-check.log). The individually measured suite invocations all passed and totaled 6769 ms. These sequential measurements occurred at different times: their difference cannot be attributed precisely to syntax checks, npm overhead, or process startup. No speedup was measured because no runner or suite was changed. One sample per suite includes process startup and system contention; do not treat the ranking as a benchmark.

Two repeat full checks on the refreshed baseline passed 196 scripts and 85 test files in 18198 ms and 16676 ms. The variation confirms that single-run ordering is not a stable benchmark. No speedup was measured because no runner or suite was changed.

Eight maintenance suites are outside automatic discovery. All eight were run explicitly during final review and passed. Their combined measured time was 26429 ms, dominated by disposable Git-fixture setup in finish.integrity (9223 ms), workflow (8562 ms), candidate.integrity (5614 ms) and observation.integrity (2474 ms). The other four completed in 63–276 ms. This supports a future shared-fixture or runner-startup investigation, not suite deletion.

## Semantic authority map

The inventory below maps every gameplay suite to production imports and fixtures. These higher-level groups identify the distinct authority each cluster protects:

| Authority | Representative suites | Distinct invariant or fixture boundary |
|---|---|---|
| Assignment and work execution | assignment.contract, creep.assignment, task.reservations, task.retention, work.dispatch, pickup.jobs | Contract shape, reservation ownership, task retention and executable dispatch are separate transitions; several suites execute main-loop source fragments. |
| Spawn and population | spawn.authority, spawn.capacity, spawn.sizing, spawn.status, minimum.spawn, population.control, role.capacity, staffing.* , spawn.denial | Admission order, capacity, body feasibility, population targets and diagnostic episode continuity are separate authorities. |
| Body construction and labor | body.archetypes, body.budget, labor.capacity, logistics.capacity | Archetype composition, cost ceilings, liveness and workload capacity use different inputs and negative controls. |
| CPU and recovery | cpu.execution, cpu.policy, cpu.protected-execution, recovery.balance, remote.recovery, policy.recovery-boundaries | Policy calculation, protected execution, recovery bounds and main-loop extraction are independent fixture boundaries. |
| Combat and defense | combat.objectives, combat.transitions, room.combat, defense.control, defense.invader-core | Objective persistence, episode history, staffing/admission and structure-specific defense are not interchangeable. |
| Construction and infrastructure | construction.crew, construction.priority, extension.layout, infrastructure.progression, rcl5.infrastructure, road.* , repair.supply | Crew eligibility, priority, legal placement, transition reconciliation and resource supply are distinct. |
| Remote operations and expansion | expansion.planner, outpost.*, remote.*, source.*, owned.room.transition | Vision, reservation, staffing, delivery, rescue and ownership transitions use different lifecycle boundaries. |
| Reporting and health | colony.dashboard, colony.work-metrics, health.*, room.trends, deployment.audit, sync.preflight | Query/report formatting, state collection and deployment integrity have separate consumers and VM fixtures. |
| Movement and congestion | movement.route, movement.service, traffic.hotspots, health.congestion | Route validity, movement intent, repeated congestion and health projection are separate observations. |
| Controller and brigade | controller.brigade.*, controller.supply, home.energy | Readiness, runtime caching, staffing, supply-chain diagnosis and home-energy policy remain distinct. |

The maintenance suites similarly separate queue authority, candidate hashes, observation integrity, handoff ownership, finish evidence, client status labels, resource conservation and end-to-end workflow behavior. Their temporary repositories are intentional isolation fixtures; sharing them could reduce setup cost but risks hidden cross-test state.

## Manually reviewed overlap

| Cluster | Repeated protection | Distinct protection and recommendation |
|---|---|---|
| body.budget / spawn.sizing | Body ceilings and maximum length | Keep both. Budget sweeps every energy 0..2000 plus mature capacities, options, aliases and explicit minimum liveness. Sizing checks actual spawn-policy requests, emergency admission, body composition and funded below-capacity spawning. Shared constants/cost setup could be extracted later, but this alone saves no process invocation and would couple fixtures. |
| room.combat / combat.transitions | Repeated combat observations preserve since; peaceful status restores economy | Keep both whole suites. Transitions freezes input snapshots, exercises episode restarts, threat mix, role histories and room isolation. Room combat executes the actual main-loop non-owned-room fallback and defender-garrison admission. Consider removing individual exact repeats only after a case-by-case surviving assertion map. |
| combat.objectives / room.combat | Core threats require two defenders | Keep. Objectives protects explicit objective persistence without vision and completion only after visible absence. Room combat protects staffing/retirement and main-loop assignment preservation. These are separate authorities and lifecycle boundaries. |

In-memory negative controls changed body construction to always return null and combat episode age to reset every tick. body.budget rejected the first with an explicit liveness assertion; spawn.sizing failed with a null-body TypeError (a detection, but less clear than an assertion). Both combat suites rejected the second with assertions. This confirms overlapping sensitivity for those two mutants only; it does not establish suite equivalence or justify deleting other cases. Production/test files were unchanged by these controls.

## Gameplay inventory

All rows run automatically through check.js. Import targets, lexical assertion counts and fixture hints were extracted mechanically; assertion counts are source call sites, not executed cases. Rows are the initial map for semantic review, not a claim of complete invariant coverage. Runtime stdout and extracted labels are retained in the local JSON evidence.

| Suite | Local production or fixture imports | Assert sites | Fixture hint | One run ms |
|---|---|---:|---|---:|
| assignment.contract.test.js | ./assignment.contract, ./colony.operations, ./creep.assignment | 19 | requires manual review | 71 |
| body.archetypes.test.js | ./body.archetypes | 24 | requires manual review | 77 |
| body.budget.test.js | ./body.factory | 12 | requires manual review | 202 |
| bootstrap.workforce.test.js | ./bootstrap.workforce, ./spawn.authority, ./assignment.contract | 34 | requires manual review | 86 |
| colony.dashboard.test.js | ./colony.dashboard | 11 | requires manual review | 75 |
| colony.operations.test.js | ./colony.operations, ./scenario.policy, ./spawn.capacity, ./remote.reservation, ./creep.assignment, ./spawn.authority, ./body.factory, ./spawn.policy, ./role.capacity | 84 | requires manual review | 106 |
| colony.scenarios.test.js | ./colony.scenarios | 8 | requires manual review | 72 |
| colony.work-metrics.test.js | ./colony.work-metrics | 1 | requires manual review | 70 |
| combat.objectives.test.js | ./combat.objectives | 13 | requires manual review | 66 |
| combat.transitions.test.js | ./room.combat | 40 | requires manual review | 72 |
| common.test.js | ./colony.dashboard.test, ./rcl5.infrastructure.test, ./body.factory, ./resource.reservations, ./room.index, ./movement.service, ./creep.lifecycle, ./creep.reporting, ./source.staffing, ./room.strategy, ./source.positions, ./room.status, ./outpost.status, ./room.situation, ./worker.limits, ./room.stages, ./remote.hauling, ./energy.phase, ./road.planner, ./infrastructure.planner, ./landmark.flags, ./outpost.maintenance, ./memory.maintenance, ./creep.naming, ./colony.dashboard, ./refill.management, ./spawn.policy, ./task.reservations, ./work.dispatch, ./refill.dispatch, ./controller.stations, ./salvage.dispatch, ./tower.control, ./outpost.planning, ./remote.roster, ./expansion.planner, ./remote.corridors, ./staffing.minimums, ./staffing.plan, ./builder.roster, ./builder.roles, ./creep.routing | 418 | requires manual review | 237 |
| construction.crew.test.js | ./construction.priority | 13 | requires manual review | 80 |
| construction.priority.test.js | ./construction.priority | 7 | requires manual review | 76 |
| controller.brigade.readiness.test.js | ./controller.brigade.readiness, ./controller.brigade.readiness, ./controller.brigade.readiness, ./controller.brigade.readiness | 29 | requires manual review | 77 |
| controller.brigade.runtime-cache.test.js | ./controller.brigade.runtime | 4 | requires manual review | 68 |
| controller.brigade.test.js | ./controller.brigade | 92 | requires manual review | 79 |
| controller.supply.test.js | ./controller.supply | 31 | requires manual review | 68 |
| cpu.execution.test.js | ./cpu.policy | 15 | requires manual review | 74 |
| cpu.policy.test.js | ./cpu.policy | 12 | requires manual review | 75 |
| cpu.protected-execution.test.js | ./cpu.policy | 12 | VM source harness | 80 |
| creep.assignment.test.js | ./creep.assignment | 24 | requires manual review | 67 |
| creep.execution-order.test.js | ./creep.execution-order | 6 | requires manual review | 74 |
| creep.lifecycle.test.js | ./creep.lifecycle | 16 | requires manual review | 68 |
| defense.control.test.js | ./defense.control | 24 | requires manual review | 66 |
| defense.invader-core.test.js | ./defense.control | 6 | requires manual review | 68 |
| deployment.audit.test.js | ./deployment.audit | 21 | requires manual review | 70 |
| energy.store-registry.test.js | ./energy.store-registry | 5 | requires manual review | 77 |
| expansion.planner.test.js | ./expansion.planner, ./bootstrap.workforce | 50 | requires manual review | 107 |
| extension.layout.test.js | ./extension.layout | 14 | requires manual review | 72 |
| health.congestion.test.js | ./movement.service, ./health.operations, ./colony.scenarios, ./scenario.policy | 27 | requires manual review | 82 |
| health.operations.test.js | ./health.operations | 16 | requires manual review | 65 |
| health.query.test.js | ./health.reporting | 16 | VM source harness | 72 |
| health.reporting.test.js | ./health.reporting | 7 | requires manual review | 68 |
| home.energy.test.js | ./home.energy | 10 | requires manual review | 95 |
| infrastructure.progression.test.js | ./infrastructure.progression, ./extension.layout, ./infrastructure.planner, ./rcl5.infrastructure | 70 | VM source harness | 127 |
| labor.capacity.test.js | ./labor.capacity, ./body.factory, ./colony.operations, ./labor.capacity, ./labor.capacity | 44 | VM source harness | 104 |
| link.decisions.test.js | ./rcl5.infrastructure | 54 | requires manual review | 73 |
| logistics.capacity.test.js | ./logistics.capacity, ./remote.hauling, ./creep.lifecycle, ./creep.lifecycle | 24 | requires manual review | 75 |
| minimum.spawn.test.js | ./minimum.spawn, ./staffing.plan | 17 | requires manual review | 79 |
| movement.route.test.js | ./movement.route, ./movement.service | 24 | requires manual review | 77 |
| movement.service.test.js | ./movement.service | 30 | requires manual review | 77 |
| outpost.delivery.test.js | ./outpost.delivery, ./colony.policy | 12 | requires manual review | 74 |
| outpost.exports.test.js | ./outpost.exports | 10 | requires manual review | 71 |
| outpost.rescue.test.js | ./outpost.rescue, ./creep.lifecycle | 7 | requires manual review | 73 |
| owned.room.transition.test.js | ./owned.room.transition | 17 | requires manual review | 72 |
| pickup.jobs.test.js | ./pickup.jobs | 10 | requires manual review | 81 |
| policy.recovery-boundaries.test.js | ./colony.policy | 24 | requires manual review | 78 |
| policy.test.js | ./colony.policy | 86 | requires manual review | 79 |
| population.control.test.js | ./population.control | 12 | requires manual review | 72 |
| rcl5.infrastructure.test.js | ./rcl5.infrastructure | 31 | requires manual review | 72 |
| recovery.balance.test.js | ./recovery.balance | 5 | requires manual review | 80 |
| remote.miner.roster.test.js | ./remote.roster | 8 | requires manual review | 82 |
| remote.recovery.test.js | ./remote.recovery | 17 | requires manual review | 83 |
| remote.reservation.test.js | ./remote.reservation | 32 | requires manual review | 72 |
| remote.spawn.test.js | ./remote.spawn | 39 | requires manual review | 83 |
| remote.vision.test.js | ./remote.hauling | 6 | requires manual review | 78 |
| repair.supply.test.js | ./repair.supply, ./repair.supply | 20 | requires manual review | 74 |
| replacement.arrival.test.js | ./replacement.arrival | 57 | requires manual review | 70 |
| resource.reservations.test.js | ./resource.reservations | 48 | requires manual review | 70 |
| road.backlog.test.js | ./road.backlog, ./colony.policy | 9 | requires manual review | 78 |
| road.network.test.js | ./road.network | 12 | requires manual review | 77 |
| road.visuals.test.js | ./road.visuals | 4 | requires manual review | 81 |
| role.capacity.test.js | ./role.capacity, ./spawn.policy, ./body.factory, ./source.staffing, ./role.capacity, ./role.capacity | 23 | requires manual review | 78 |
| room.combat.test.js | ./room.combat, ./defense.control | 21 | VM source harness | 82 |
| room.index.test.js | ./room.index | 6 | requires manual review | 70 |
| room.scaling.test.js | ./room.scaling | 10 | requires manual review | 67 |
| room.trends.test.js | ./health.operations.test, ./room.trends | 28 | requires manual review | 74 |
| scenario.policy.test.js | ./scenario.policy | 12 | requires manual review | 69 |
| source.assignment.test.js | ./source.assignment | 2 | requires manual review | 76 |
| source.collection.test.js | ./source.collection | 9 | requires manual review | 74 |
| source.pairs.test.js | ./source.harvest, ./source.recovery, ./source.assignment, ./body.factory | 17 | requires manual review | 76 |
| source.recovery.test.js | ./source.recovery | 16 | requires manual review | 77 |
| spawn.authority.test.js | ./spawn.authority | 51 | requires manual review | 83 |
| spawn.capacity.test.js | ./spawn.capacity | 5 | requires manual review | 68 |
| spawn.denial.test.js | ./spawn.denial | 28 | requires manual review | not separately timed on refreshed baseline |
| spawn.sizing.test.js | ./body.factory, ./spawn.policy | 19 | requires manual review | 110 |
| spawn.status.test.js | ./spawn.status | 8 | requires manual review | 82 |
| staffing.baseline.test.js | ./staffing.baseline | 8 | requires manual review | 79 |
| staffing.plan.test.js | ./staffing.plan | 21 | requires manual review | 79 |
| sync.preflight.test.js | ./sync.preflight | 15 | requires manual review | 67 |
| task.reservations.test.js | ./task.reservations | 6 | requires manual review | 68 |
| task.retention.test.js | ./task.reservations | 35 | requires manual review | 70 |
| traffic.hotspots.test.js | ./traffic.hotspots | 23 | requires manual review | 71 |
| work.balance.test.js | ./work.balance | 11 | VM source harness | 88 |
| work.dispatch.test.js | ./work.dispatch, ./creep.reporting, ./builder.roles, ./pickup.jobs, ./work.dispatch, ./work.dispatch, ./work.dispatch | 53 | VM source harness | 87 |

## Manual maintenance inventory and current run

| Suite | Local imports | Fixture boundary | Result | One run ms |
|---|---|---|---|---:|
| authority.claim.test.cjs | ./workflow.cjs | isolated queue filesystem | pass | 276 |
| candidate.integrity.test.cjs | ./workflow.cjs | temporary Git repository | pass | 5614 |
| client-room-status.test.cjs | ./client-room-status | direct status-label cases | pass | 63 |
| finish.integrity.test.cjs | ./workflow.cjs | dirty/hash/evidence Git fixtures | pass | 9223 |
| handoff.integrity.test.cjs | ./workflow.cjs | isolated queue ownership | pass | 155 |
| observation.integrity.test.cjs | ./workflow.cjs | temporary Git and database fixtures | pass | 2474 |
| resource-reservation-contention.test.cjs | inline/process harness | current checkout reservation authority | pass | 62 |
| workflow.test.cjs | ./workflow.cjs, ./main | end-to-end temporary Git workflow | pass | 8562 |

## Historical ownership snapshot

- persistent-wait-age: claimed, owner 01a1b72c-f1c8-7493-b043-48de9efb71e4; candidate none; declared files main.js, wait.age.js, wait.age.test.js.
- spawn-denial-duration: ready, owner 01a1b728-5e3d-7d91-ac81-33953cf21f7f; candidate 8132de8a1aa2923bedf2cc145d2eec6ce98fd489; declared files main.js, spawn.denial.js, spawn.denial.test.js.
- test-suite-redundancy-audit: developing, owner 01a1b731-85f2-7893-b117-1fa0e712c978; candidate none; declared files TEST_AUDIT.md.

This snapshot is retained only to explain why pending candidates were excluded from the original c688457 measurements. The final audit baseline includes spawn-denial but not later persistent-wait work. The canonical queue, not this report, remains authoritative for integration state.

## Final recommendation and safe next action

Do not remove or merge a suite from this audit alone. The evidence supports a separate runner experiment that preserves one-process-per-suite isolation as the control, compares at least three like-for-like runs, and proves equivalent failures with targeted negative controls. Any assertion consolidation must name the surviving suite and fixture for every removed invariant. This report changes no gameplay or test behavior and claims no gameplay benefit.
