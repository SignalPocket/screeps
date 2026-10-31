# Colony architecture

## Purpose

The colony is a state-driven control system. It observes each owned room,
derives one authoritative policy from RCL, infrastructure, health, demand, and
history, then lets specialized planners and executors carry out that policy.
The architecture exists to prevent individual roles from reacting to the same
incident with conflicting headcounts or priorities.

## Control loop

```text
live room and creep state
          |
          v
room.situation.js  -----> room.status.js / health.operations.js
          |                         |
          v                         v
colony.policy.js <---------- room.trends.js
          |
          +------ roles: min / desired / max
          +------ remote: minimum / desired
          +------ health and permissions
          +------ construction and reserve budgets
          |
          v
staffing.plan.js + worker.limits.js + body.archetypes.js
          |
          v
spawn selection / assignment planners / infrastructure planners
          |
          v
role executors in main.js and bounded runtime modules
          |
          v
memory, logs, dashboard, operational measurements
```

## Layer ownership

### Observation layer

`room.situation.js` is the live-to-pure adapter. It may inspect Screeps objects
and normalize facts, but it does not choose a role outside the policy model.
Room status and operational health describe what is happening; they do not
spawn creeps themselves.

### Policy layer

`colony.policy.js` owns staffing targets, economic health, optional-work gates,
and budgets. `room.stages.js` owns the declarative intent of RCL 0 through 8.
`room.trends.js` may make bounded adjustments to policy targets from sustained
measurements. It must preserve minimum/desired distinctions.

The present implementation derives policy per owned room. This is enough for
the current single-colony-room economy. A future multi-room colony governor may
rank transfers, expansion, and shared CPU across rooms, but it must consume
room policies rather than replacing their safety floors. Its normative target
contract is in `specs/colony-coordination.md`.

### Planning layer

Planners compare policy with viable coverage, reserve destinations, select
construction, and choose the next bounded action. A planner may use geometry or
route measurements to satisfy a target. It may not create a second target that
competes with policy.

### Execution layer

Executors move, withdraw, transfer, harvest, build, repair, upgrade, and spawn.
They honor reservations and retained assignments. Execution code may fall back
when a target disappears, but a fallback must not mutate the population model.

### Observation and feedback layer

The dashboard, status summaries, operational windows, and trend history make
decisions inspectable. Feedback enters policy only through an explicit bounded
adapter such as `applyTrendAdjustments`.

## Invariants

- No intentional `creep.drop()` behavior. Energy is held, transferred, built,
  repaired, or upgraded.
- The controller always retains a minimum viable upgrade path.
- Every productive local source retains required WORK coverage.
- Spawn and extension refill retains an emergency recovery path.
- Population caps apply even when an assignment is marked urgent.
- `forceSpawn` changes charge timing; it does not bypass population policy.
- Existing plans do not grant themselves permanent priority. Brigade,
  construction, remote growth, and expansion re-enter through current policy.
- Remote minimums preserve established income; remote desired staffing grows
  only when the RCL, roads, and economic health allow it.
- One target has one owner unless a subsystem explicitly supports shared work.
- Construction sites and completed structures are different facts; placement
  must check both and never treat an overlap as valid.
- Tests establish local correctness. Only multi-tick observation establishes
  live behavior.

## Known architectural debt

- `main.js` still contains orchestration and several large execution paths.
  Continue extracting pure planners or bounded runtimes, not new policy.
- The health vocabulary is split between economic policy health, explanatory
  room status, and operational counters. Their responsibilities are documented
  in `memory-and-observability.md`; they should not be casually merged.
- There is no colony-wide allocator across multiple owned rooms yet.
- Some infrastructure placement is stage-aware but not yet expressed as a
  generic policy budget. New infrastructure must not add another independent
  affordability rule.
