# ADR 0007: Four-job baseline and situational staffing

Status: accepted

## Context

Deriving every body directly from source count, backlogs, remote plans, or RCL
features can produce a large but nonfunctional population. A colony may have
many miners or builders while lacking any upgrader or spawn filler. Conversely,
a fixed roster sized for one moment does not adapt to combat, recovery, RCL
progression, or mature throughput.

## Decision

Every owned colony first protects one viable creep for each core job, restored
in this order:

1. miner;
2. upgrader;
3. spawn filler;
4. builder/fixer.

Only after all four baseline capabilities are covered may the planner add
jobs. Post-baseline demand is derived from the active operating scenario, Room
Controller level, colony health, physical work positions, and measured
backlog or throughput. It is not a fixed role table per RCL.

Scenario overrides may change immediate actions for defense, healing, salvage,
or recovery. They do not erase baseline ownership or authorize unbounded
population. Living compatible creeps are reconciled before spawning a body for
a missing slot.

## Consequences

- A second source does not receive a second miner before the first upgrader,
  filler, and builder/fixer exist.
- The four-creep baseline remains visible inside mature RCL 5+ staffing.
- Extra miners, haulers, fillers, workers, remotes, defenders, claimers, and
  brigade relays require situational and RCL-aware policy evidence.
- Implementing this requires a bootstrap selector ahead of ordinary minimum
  gap ranking; rearranging one general priority array is insufficient.
- Dashboard and tests must distinguish baseline coverage from situational
  minimum, desired, maximum, and transition bodies.
