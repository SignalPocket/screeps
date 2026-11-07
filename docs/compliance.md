# Policy-to-code compliance map

This audit maps durable requirements to executable ownership. `Implemented`
means local tests cover the decision boundary. It does not mean the behavior
has passed live multi-tick observation.

| Requirement | Status | Code owner | Test evidence or gap |
| --- | --- | --- | --- |
| One RCL/health policy owns staffing and optional work | Implemented | `colony.policy.js`, `room.situation.js` | all five health states and permission gates in `policy.test.js` |
| Dedicated four-slot baseline selector runs before ordinary staffing | Implemented | `staffing.baseline.js`, `staffing.plan.js`, `spawn.authority.js` | focused baseline and authority tests plus live missing-upgrader replacement |
| Extensible scenarios compose into one per-job decision matrix | Core runtime implemented | `colony.scenarios.js`, `scenario.policy.js`, `main.js` | scenario records now constrain the shared policy and publish one `roomDecision`; catalog coverage remains intentionally incremental |
| Desired population fits sustainable spawn replacement capacity | Implemented | `spawn.capacity.js`, `room.situation.js` | body-specific replacement load contracts optional construction first and retains a 20% recovery margin |
| Active owned-room attack has a bounded creep response | Implemented | `scenario.policy.js`, `body.factory.js`, `staffing.plan.js`, `main.js` | one defender minimum, optional-work prohibitions, tower response, combat execution, and post-threat retirement |
| Optional population contracts to protected floors | Implemented | `worker.limits.js` | optional-population scenarios in `common.test.js` |
| Brigade bodies cannot deadlock core recovery | Implemented | `population.control.js`, `main.js` | active-brigade and transition cases in `population.control.test.js` |
| Brigade readiness includes controller coverage | Implemented | `controller.brigade.readiness.js` | missing-upgrader case in `controller.brigade.readiness.test.js` |
| Remote maintenance and growth obey different gates | Implemented | `colony.policy.js`, `main.js` | healthy, strained, critical, and road-blocked cases in `policy.test.js` |
| Remote assignments do not reconstruct a larger emergency roster | Implemented locally | `remote.spawn.js`, `remote.recovery.js`, `remote.roster.js`, `worker.limits.js` | aggregate caps, lane distribution, paused recovery, and constrained carrier rosters are tested; live spawn-cycle verification remains |
| Optional building pauses without abandoning spawn/source access | Implemented | `colony.policy.js`, `main.js` | policy tests plus construction filtering; live verification remains |
| Links precede new extensions when link work is pending | Implemented | `main.js`, `construction.priority.js` | infrastructure scenarios in `common.test.js` and `rcl5.infrastructure.test.js` |
| Roads around essential infrastructure remain repair-eligible | Implemented | repair target selection in `main.js` | common construction/repair scenarios; live decay observation remains |
| Duplicate structure/site overlap is rejected | Implemented | `infrastructure.planner.js` | placement scenarios in `common.test.js` |
| Expansion obeys GCL capacity, functional claimer capacity, target validity, and sponsor health | Implemented | `colony.policy.js`, `expansion.planner.js`, `main.js` | healthy/strained sponsor and bootstrap-pause scenarios |
| CPU exhaustion sheds optional work before survival | Implemented locally | `cpu.policy.js`, `main.js` | bucket boundary cases in `cpu.policy.test.js`; live recovery remains |
| One retirement authority removes surplus safely | Implemented | `population.control.js`, recycle path in `main.js` | direct idle `suicide()` path removed; temporary defenders explicitly enter the same recycle path |
| RCL 6 industry | Specified; runtime missing | no executable owner | terminal, labs, extractor, minerals, and reserve gates are cataloged but need planners and executors |
| RCL 7 factory and mature multi-room sponsorship | Partial | expansion claim/bootstrap is capability- and health-gated, independent of RCL | factory and colony-wide allocation are missing |
| RCL 8 mature-room systems | Missing | no executable owner | observer, power, market, final defense, and support policy remain declarative |

## Audit rule

When a requirement changes, update its specification, this map, its code owner,
and a focused test together. Keep `live verification remains` until the colony
has been observed across multiple ticks and at least one relevant spawn or
replacement cycle.
