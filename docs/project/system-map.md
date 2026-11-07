# Current system map

Updated: November 6, 2026. Static review of the local working tree, not a live-state report.
Paths below are relative to the repository root. Line references describe this review's snapshot.

## Decision flow

Observed room/creep state -> room.situation -> population policy and trend feedback -> scenario constraints -> staffing/capability budgets -> spawn selection and final authority -> roster and job assignment -> reservations -> execution -> reporting and feedback.

This is a useful model, not proof of one immutable decision object throughout a tick. main.js publishes roomDecision around line 742, but also performs later role and assignment changes. The final spawn gate controls spawn requests; it cannot by itself govern subsequent borrowing or reassignment.

| Decision | Current code owners | Shared state / interference to trace |
| --- | --- | --- |
| Room facts and health | room.index.js, room.situation.js, room.status.js, health.operations.js | Economic policy health, explanatory status, and operational counters differ; a label alone is insufficient evidence. |
| Authorized staffing | colony.policy.js, room.trends.js, colony.scenarios.js, scenario.policy.js | populationPolicy, roomDecision, scenarioRecords; verify refresh timing and that every consumer sees the same effective policy. |
| Capability and population limits | staffing.baseline.js, staffing.plan.js, body.archetypes.js, worker.limits.js, population.control.js, spawn.capacity.js | Minimum/desired/maximum, viable bodies, transition overlap, active brigade bodies and retirement all affect available slots. |
| Spawn request and execution | minimum.spawn.js, remote.spawn.js, recovery.balance.js, spawn.authority.js, spawn.policy.js, body.factory.js; main.js around 765-1543 | Selection, permission, affordability and body sizing are separate decisions. Rejected proposals can leave no spawn; trace the first rejection and recovery. |
| Durable roles and slots | source.assignment.js, remote.roster.js, builder.roster.js, creep.assignment.js; many main.js writers | role, assignmentRole, source fields, remote slots, builder mission; reconciler cleans incompatible memory but explicitly does not select the role. |
| Exact work and delivery | work.balance.js, work.dispatch.js, refill.dispatch.js, pickup.jobs.js, repair.supply.js, controller.stations.js | demandLane, workJob, dispatchCommitment, taskTarget; flexible work and emergency relief can compete with retained specialties. |
| Energy accounting | resource.reservations.js, task.reservations.js, energy.store-registry.js, home.energy.js, energy.phase.js | Per-tick reservations versus persistent delivery targets; distinguish planned amounts from completed actions. |
| Sources and collection | source.staffing.js, source.positions.js, source.assignment.js, source.recovery.js, source.collection.js, source.harvest.js | Source slots, replacement overlap, collection lanes, and fallback workers all touch source coverage. |
| Controller supply | controller.brigade.*.js, creep.routing.js, controller.stations.js, role.capacity.js, rcl5.infrastructure.js; main.js | Separate transport, buffers, and actual upgrading. Storage intake, direct supply, links, and borrowed relays can overlap. |
| Outpost effects on home | outpost.planning.js, remote.hauling.js, remote.spawn.js, remote.recovery.js, remote.roster.js, outpost.delivery.js, outpost.exports.js | Consume home spawn/body budgets; return cargo to home buffers; surplus reassignment can alter home coverage. Dependency review only in this phase. |
| Layout and infrastructure | room.stages.js, room.strategy.js, infrastructure.planner.js, rcl5.infrastructure.js, road.planner.js, landmark.flags.js | Sites versus built structures, container purposes, traffic and retirement/migration. Some existing planners remove sites or destroy structures. No such actions performed in this review. |
| Defense and interruption | scenario.policy.js, tower.control.js, salvage.dispatch.js; main.js combat/healing paths | Threat response, tower refill, healing and post-battle salvage interrupt ordinary work; verify release conditions and protected lanes. |
| Movement and execution | movement.service.js, creep.routing.js, creep.lifecycle.js; role paths in main.js | Geometry, stuck recovery, target validity and life expectancy can make a valid plan fail. |
| CPU and diagnostics | cpu.policy.js, main.js, colony.dashboard.js, health.reporting.js, colony.work-metrics.js | CPU policy suppresses slow planning below bucket 1000; execution limits differ below 1000/3000. Deferred execution and stale plans need observation. |

## Interactions that deserve first attention

1. **Assignments after authorization.** main.js reconciles assignments around 268 and 2424, with source recovery, remote reuse, relief and retirement between/after planning stages. Audit every writer of role, slot and job fields before declaring a single assignment authority implemented. The assignment-authority specification explicitly says migration is in progress.
2. **Brigade substitution versus replacement.** Spawn planning uses replacementMode around 776. Substitute recruitment around 3458-3500 checks the controllerBrigade policy permission and passes a plan/candidates separately. Current code includes a permission gate; the historical SUB1 failure cannot be assumed to remain unchanged. Trace whether permission, established status, active count and replacement mode produce consistent results.
3. **Several controller energy paths.** Brigade intake targets storage; carrier routes and link balancing also feed controller/extension buffers. Compare actual endpoints and priority before adding another transport fallback.
4. **Automated geometry changes.** rcl5.infrastructure.js includes legacy link destruction; infrastructure.planner.js includes site removal and container retirement. A future layout recommendation must account for these existing migration paths before delivery.
5. **Desired plans versus runtime support.** room.stages.js describes RCL 0-8; the colony-wide allocator and several late-stage systems are specification-only. Do not promote catalog entries into implemented features.

## Controller logistics by stage: decision pending

The current stage catalog uses flexible workers early, containers and hauling next, storage at stage 4, and links at stage 5. These are repository intentions; engine legality and the current room geometry must be verified before implementation.

Compare simple mobile supply to a controller buffer; storage-supported supply; link-supported supply; and the existing stationary brigade. Measure bodies, spawn replacement load, CPU, delivered energy, path length, blocked traffic, reserve protection, and failure recovery. Evaluate storage near the controller/link as one layout candidate. Early supply must operate independently of later infrastructure, and the transition must preserve a working upgrade path. Do not require a brigade merely because an old plan exists.

## Debugging trace

For one surprising creep, follow policy permission -> staffing slot -> spawn/assignment decision -> durable job/source/destination -> reservation -> actual action -> observed result. Record the earliest mismatch, the owner that wrote it, and the reason. Fixing the visible label or movement is insufficient when the earlier assignment is wrong.

## Follow-up authority audit

The [November 6 review](authority-review-2026-11-06/assignment-authority-review.md) traces the actual order of assignment writers and identifies gaps between the intended single-authority model and implementation. Use it with this map. The [comparison](authority-review-2026-11-06/controller-supply-comparison.md) and [carrier-default design](authority-review-2026-11-06/controller-supply-design.md) distinguish the future direction from unchanged runtime behavior and the subsequent immediate brigade request.
