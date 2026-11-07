# Scenario, RCL, health, and staffing decision matrix

Status: accepted design; baseline selector, normalized scenario records, and
central spawn authorization gate implemented; full per-slot runtime matrix is
not yet fully implemented.

This matrix is the one source of truth the planner should produce. It connects
observed conditions to feasible capabilities, staffing demand, and exact creep
ownership. It is a decision model, not a table of fixed creep counts.

## Decision order

```text
room facts
  -> active scenario records
  -> RCL and built-infrastructure feasibility
  -> colony-health budget and prohibitions
  -> dedicated four-slot baseline selector
  -> situational min / desired / max job demand
  -> viable assigned coverage
  -> first authorized gap
  -> body family and cost
  -> durable creep assignment with exact objects
```

The baseline selector is deliberately before ordinary staffing calculations.
It returns the first missing viable slot in this exact order: miner, upgrader,
spawn filler, builder/fixer. Only when it returns no gap may situational demand
select another job.

## RCL and infrastructure capability matrix

RCL is necessary but not sufficient. A capability is usable only when its
required structures are built, reachable, supplied, and allowed by health.

| RCL | Native stage capability | Newly feasible job families | Still unavailable or gated |
| --- | --- | --- | --- |
| 0 | unclaimed controller; sponsored spawn construction | scout, reserver/claimer, pioneer, sponsor hauling/building | no owned-room baseline until ownership and spawn exist |
| 1 | spawn and basic harvesting/upgrading | four flexible baseline jobs, direct delivery, basic build/repair | no extensions, containers, tower, storage, or links |
| 2 | extensions, containers, roads, walls/ramparts | dedicated refill lane, container miner/hauler, road builder, rampart repair | no tower healing/attack or storage reserve |
| 3 | tower and larger extension network | tower filler, tower-based defense/healing, separated mining/haul/refill/build/repair | no storage or links |
| 4 | storage | store rebalancer, durable reserve logistics, storage-fed work | no link automation, terminal, labs, or minerals |
| 5 | links and additional tower/extension capacity | link attendant, bidirectional link balancing, controller brigade, health-gated remote growth | industry and expansion still unavailable |
| 6 | terminal, laboratories, extractor | terminal courier, lab/boost technician, mineral miner/hauler, market/transfer logistics | factory, observer, power spawn, nuker unavailable |
| 7 | second spawn, factory, larger defenses | factory technician, health-gated claim/bootstrap sponsorship, stronger multi-room support | observer, power spawn, nuker unavailable |
| 8 | observer, power spawn, nuker, maximum structure limits | observer schedule, power processing, nuker supply, mature support/defense | strategic actions still require explicit plans and reserves |

Built assets override assumptions. For example, an RCL 6 room with no terminal
cannot schedule a terminal courier, and an RCL 5 room with only one usable link
cannot schedule bidirectional link balancing.

## Health budget matrix

| Health | Protected | Allowed when evidenced | Prohibited by default |
| --- | --- | --- | --- |
| Critical | baseline recovery, spawn energy, controller safety, active defense | exact emergency repair/heal/haul response | growth, surplus upgrading, industry, new remotes, expansion |
| Recovering | baseline, full local energy loop, established income floor, critical repair | bounded hauling/refill/repair recovery | new capabilities and optional population |
| Strained | safety floors, existing productive lanes, maintained infrastructure | measured carrier or repair relief | ordinary growth, new brigade, expansion, discretionary industry |
| Healthy | all minimums and sustainable desired work | RCL-feasible growth and automation | only work lacking evidence or reserve |
| Surplus | all protected/desired work and reserve bands | optional upgrading, industry, market, expansion support | work exceeding max, positions, stores, or strategic authorization |

An active defense or code-recovery scenario may impose stricter prohibitions
than the health row. The strictest active constraint wins.

## Scenario-to-job contribution matrix

Each active scenario contributes deltas or gates; it does not replace the
whole staffing plan.

| Scenario family | Jobs it may protect or add | Jobs it normally pauses |
| --- | --- | --- |
| Foundation | missing baseline slot, exact replacement overlap, sponsor pioneer | all optional growth until foundational exit |
| Economy deficit | filler, source hauler, controller supplier, rebalancer | surplus upgrader, optional construction/industry |
| Infrastructure | bounded builder, repairer, road/tunnel or rampart specialist | lower-priority construction when critical repair exists |
| Defense | tower filler, melee/ranged defender, healer, tank/escort/dismantler | exposed ordinary work, growth, industry, surplus upgrading |
| Recovery | healer/tower support, salvage, filler, repairer, missing baseline | new remotes, expansion, discretionary production |
| Remote | scout, reserver, remote miner/hauler/builder, escort | new remote lanes when home gates fail |
| Expansion | scout, claimer, pioneer, expansion supplier/escort | claim when GCL, home floor, route, or budget fails |
| Industry | mineral, lab, terminal, factory, power/nuker logistics | all industrial jobs below their RCL/assets/reserve gate |
| Surplus | extra upgrader, optional builder, industry/market support | disappears immediately when a protected band fails |

## Per-job planning row

Every required job is represented once in the room plan:

```text
jobKey
capabilityFamily
baselineOrder?           # 1..4 or null
scenarioReasons[]
minimum / desired / maximum
minimumRcl
requiredAssets[]
healthFloor
workRoom
slots[]                  # stable lane/station/formation identities
sourceObjectIds[]
targetObjectIds[]
viableAssigned[]
executing[]
blocked[]
replacing[]
uncovered
spawnAuthorized
decisionReason
planVersion / evaluatedAt
```

Counts are derived from slots and measured work. The row may say a job is
desired but infeasible; infeasible demand remains visible and cannot silently
become a spawn request.

## Per-creep ownership row

```text
creepName
bodyFamily
homeRoom / workRoom
jobKey
slotId
sourceObjectId / targetObjectId
assignmentState         # assigned, executing, blocked, replacing, retiring
scenarioReason
assignedAt / validatedAt
changeReason
```

The dashboard joins these rows to show both sides of every decision:

```text
scenario -> job demand -> slot -> creep -> source -> target -> current action
```

## Gap-selection matrix

| Pass | Eligible gaps | Selection rule |
| --- | --- | --- |
| 1. Baseline | first missing viable miner, upgrader, filler, builder/fixer | fixed invariant order; dedicated selector |
| 2. Emergency | combat, healing, spawn lock, downgrade, critical repair | evidence severity, arrival time, and exact executable response |
| 3. Safety floors | remaining local sources, haul/refill/controller supply | lowest viable coverage; protect distinct slots before stacking |
| 4. Established income | active remote reservation/miner/haul/repair lanes | minimum only; retain productive lanes within health policy |
| 5. Stage capability | jobs unlocked by current RCL and built assets | only with scenario evidence and health permission |
| 6. Desired work | measured local/remote throughput and queues | lowest desired coverage within max and physical positions |
| 7. Surplus | upgrading, industry, market, expansion support | only after every protected reserve and permission passes |

Within a pass, compare coverage ratios and urgency, not raw role order alone.
One spawn request fills one uncovered authorized slot. Spawning/traveling
replacements reserve that slot so another request cannot duplicate it.

## Implementation boundary

Current code has policy targets, minimum-gap selection, body-family reporting,
several durable assignment fields, the dedicated four-slot selector, and a
final spawn authority gate. Body-family planning may size and report a chosen
job, but it cannot create population independently. The gate records the
authorized phase and concrete proposal in `room.memory.spawnDecision` and
rejects cross-phase requests. It does **not** yet implement every per-slot row
in this full matrix. Documentation acceptance and unit coverage are not live
runtime proof.

Implementation should proceed in narrow stages:

1. add and test the pure baseline selector; **implemented locally**
2. publish normalized scenario records from existing observations;
   **core registry implemented locally**
3. produce one per-job plan row from policy and slot planners;
4. join viable assignments to those rows;
5. make spawn selection consume only the first authorized uncovered slot;
   **central invariant gate implemented locally**
6. migrate remaining parallel role/target fields into the durable contract;
7. add dashboard readback and multi-tick live verification.
