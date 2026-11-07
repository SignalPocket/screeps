# Core colony jobs and creep requirements

Status: accepted bootstrap roster; dedicated baseline selector implemented;
durable-assignment audit continues.

This specification defines the minimum viable owned colony: exactly one creep
covering each of four core jobs, restored in this order:

1. miner;
2. upgrader;
3. spawn filler;
4. builder/fixer.

The colony establishes this four-creep baseline before adding a second miner,
extra controller work, additional fillers, specialist builders, general
haulers, remotes, or the controller brigade. Afterward, every additional job
is derived from the active scenario, Room Controller level, colony health,
physical positions, and measured backlog or throughput. A creep count alone
never proves that a job is covered: each of the four must have the required
capability and a valid assignment.

The baseline is invariant; the post-baseline roster is dynamic. No RCL unlock,
saved plan, or temporary emergency permanently changes the baseline or creates
a fixed batch of extra workers.

## Common staffing contract

Every job publishes three counts through colony policy:

- **minimum:** protected coverage required now;
- **desired:** sustainable coverage justified by current demand and health;
- **maximum:** a temporary surge ceiling, never a spawn target by itself.

A creep counts only when it has the required live body parts, enough remaining
life to reach and perform the job, and a valid durable assignment. Every
assignment names the room, lane or slot, source object when applicable, target
object when applicable, assignment reason, and validation tick.

The numbered order below is the bootstrap spawn and replacement order. The
planner first asks which of the four one-creep baseline slots is missing and
selects the earliest missing slot. Only after all four are viable does ordinary
minimum/desired scaling select another body. Exceptions must be explicit
emergencies: imminent controller downgrade, inability to charge the spawn at
all, active attack, or critical structure loss. An exception changes the next
action; it does not silently rewrite the durable roster.

## 1. Miner

**Purpose:** Keep every active local source producing energy.

**Required capability:** `WORK`; `MOVE` unless permanently stationed; `CARRY`
when the room has not yet established container-based mining.

**How many:**

- Bootstrap floor: exactly one viable miner before any other baseline slot.
  At RCL 1 it may be a flexible harvest body that carries its own output.
- Container economy: assign source WORK capacity, not a fixed number of creep
  names. Normal Screeps regeneration requires up to five effective `WORK`
  parts per continuously harvested source.
- Maintain at least one assigned viable body per active source before stacking
  additional WORK on another source.
- Additional source coverage begins only after the upgrader, spawn filler, and
  builder/fixer baseline slots are filled.
- Never request more miners merely because more walkable source tiles exist.

**Durable ownership:** One source ID and, when present, one mining station and
container ID. A replacement inherits the same slot before the incumbent is
released.

**Fallback:** A miner may deposit into its local container or perform bounded
bootstrap delivery. It does not become an ordinary builder while its source
slot remains required.

**Health response:** Source minimum survives every owned-room health state.
Desired mining cannot grow beyond usable source production.

## 2. Upgrader

**Purpose:** Consume controller-side energy and protect room ownership and RCL
progress.

**Required capability:** `WORK`, `CARRY`, and enough `MOVE` for the route or a
stationary controller position.

**How many:**

- No owned controller: zero.
- Owned controller: bootstrap floor of exactly one viable upgrader, selected
  after the first miner and before the spawn filler.
- Imminent downgrade: raise the protected minimum only as far as controller
  work positions and available energy support.
- Healthy surplus or a persistently full controller buffer may justify a
  second routine upgrader.
- Brigade relays and controller haulers do not count: they deliver energy but
  have no upgrader `WORK` capability.

**Durable ownership:** Controller ID, controller-side withdrawal source, and a
controller work position when one is reserved.

**Fallback:** When controller energy is temporarily absent, retain upgrader
ownership and wait or collect from an authorized controller supply source. Do
not relabel the creep as a builder because another work site is closer.

**Health response:** Critical controller safety overrides optional work.
Ordinary upgrade growth contracts to one during starvation or infrastructure
migration.

## 3. Spawn filler

**Purpose:** Move available energy into towers when needed, then into the
closest non-full spawn or extension so the colony can produce bodies.

**Required capability:** Primarily `CARRY` and `MOVE`; no `WORK` requirement.

**How many:**

- Owned spawn: bootstrap floor of exactly one viable filler, selected after
  the upgrader and before the builder/fixer. At low RCL it may collect loose or
  directly harvested energy; it does not require extensions to be useful.
- Scale desired coverage from physically distinct refill areas and measured
  delivery pressure, not raw extension count.
- Never add another filler while current filler capacity is idle solely because
  a historical cluster label differs.

**Durable ownership:** A refill lane and current load source. For each loaded
trip, assign one exact target from the shared per-tick list of towers, spawns,
and extensions. Reserve its free capacity before another filler is matched.

**Target choice:** Incomplete towers are the emergency tier. Otherwise spawn
and extensions are equal candidates and the closest non-full target wins. A
valid target remains owned until filled or invalid so fillers do not
flip-flop each tick.

**Fallback:** An authorized logistics creep may cover an actually empty refill
slot in the moment. That temporary action must not create a permanent
substitute roster or satisfy spawning for the real required capability.

**Health response:** Refill recovery is protected whenever the room cannot
reliably charge a replacement body. Optional buffer balancing waits.

## 4. Builder/fixer

**Purpose:** Build authorized structures and maintain structures the colony
still uses.

**Required capability:** `WORK`, `CARRY`, and sufficient `MOVE` to reach the
assigned site or structure.

**How many:**

- Owned colony: bootstrap floor of exactly one flexible builder/fixer, selected
  after miner, upgrader, and spawn filler coverage.
- With no active site or maintained damage, retain the job identity and use
  bounded controller work rather than deleting the baseline slot or spawning
  another worker.
- Construction demand scales from remaining progress and colony health.
- Repair demand scales from maintained damage, criticality, and available
  energy.
- A bounded crew may share a large site; shared never means every worker may
  crowd the same target.

**One labor pool, explicit missions:** `builder` and `repairBuilder` are policy
subtargets of the same builder/fixer capability family. A durable mission says
`build`, `repair`, or a special infrastructure mission such as `tunnel`.
Changing missions requires a completed/invalid target, critical repair,
explicit policy contraction, or another recorded assignment reason.

**Durable ownership:** Exact construction-site ID or damaged-structure ID,
plus the energy source selected for the current load.

**Fallback:** Finish a valid assignment first. If it completes, choose another
authorized object in the same mission. Cross from build to repair only for a
critical maintained structure; cross from repair to build only when the repair
queue is genuinely clear.

**Health response:** Essential container, spawn, controller-access, and road
recovery may retain a minimum worker. Optional construction and repair surges
contract before mining, controller safety, or refill coverage.

## Local logistics after the four-job baseline

Container mining requires transport between source buffers, storage, controller
buffers, towers, and the refill network. Current code represents this with
`hauler`, `rebalancer`, remote-hauler, and controller-brigade assignments.

This transport work cannot disappear from staffing merely because it is not in
the four names above. It belongs to a shared local-logistics capability family
with distinct durable jobs: spawn refill, source collection, store balancing,
controller supply, link attendance, and tower supply. The one baseline spawn
filler covers only the spawn-refill slot; it does not prove all logistics work
is staffed.

General hauling is therefore not a fifth invariant bootstrap job. After the
four-slot baseline exists, policy creates logistics slots from measured flow,
distance, buffer pressure, and physically distinct service areas. A compatible
hauler body may move between those jobs only through a recorded assignment
change. Existing measured hauler minimums remain protected, and brigade relay
bodies count only toward their numbered relay slots.

The complete situational taxonomy is in `job-catalog.md`; its RCL, health, and
scenario gates are in `staffing-decision-matrix.md`.

## Implementation status

`staffing.baseline.js` now selects the first missing viable one-of-each slot
ahead of ordinary minimum-gap ranking. The worker budget retains four local
baseline places, and a missing capability receives a bounded transition place
when the room is already full of differently assigned bodies. This prevents a
second miner or extra refill lane from preceding the first upgrader and keeps
the builder/fixer floor when its queues are empty.

The remaining audit must normalize every durable source, lane, mission, and
target assignment into the unified per-job and per-creep contracts below.

## Required dashboard view

For each job, report the same facts used by staffing and execution:

```text
job | minimum | desired | viable assigned | executing | blocked | replacing
```

For an individual creep, report:

```text
creep -> job -> lane/slot -> source object -> target object -> reason
```

This is the list that should explain both why a new creep is being spawned and
why every living creep is moving toward its current object.
