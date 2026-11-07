# Adaptive colony policy specification

Status: normative for current code.

## Objective

Every staffing and optional-work decision must respond to:

- Room Controller level and ownership.
- Spawn capacity and current charge.
- stored energy and source-buffer pressure.
- controller downgrade risk.
- local source WORK demand and usable geometry.
- construction and maintained-repair demand.
- active outposts, measured route demand, and core road readiness.
- sustained operational trends rather than one noisy tick.

The output is a decision snapshot, not a collection of suggestions.

## Inputs

`room.situation.js` builds the API-free state passed to
`derivePopulationPolicy`. Important input families are:

| Family | Examples | Meaning |
| --- | --- | --- |
| Controller | `rcl`, `controllerTicks`, ownership | stage and safety |
| Energy | spawn ratio, stored energy, buffer ratios | immediate and reserve health |
| Sources | count, required WORK, usable spots, learned staffing | production capacity |
| Logistics | route distance, dropped energy, container imbalance | transport pressure |
| Work queues | build remaining, priority sites, maintained repairs | bounded labor demand |
| Remotes | active rooms, miner/carrier/builder demand | established income demand |
| Infrastructure | core-road access, containers, extensions | capability gates |

## Health states

Health is a budget class used by policy. It is not the dashboard label.

| State | Meaning | Optional behavior |
| --- | --- | --- |
| `critical` | bootstrap or controller danger | survival floors only |
| `recovering` | energy-starved or critical repair state | maintain core and established remote floor; minimal construction |
| `strained` | weak charge, buffers, or reserve | maintain income; reduced construction; no growth |
| `healthy` | safety and reserve tests pass | sustainable desired staffing and RCL features |
| `surplus` | strong buffers and reserve | full optional budget |

Thresholds scale with room energy capacity through `room.scaling.js`. A new
threshold must be expressed in normalized room terms, not tuned to one current
energy number.

## Permissions

The policy publishes permissions consumed by downstream modules:

- `remoteMaintenance`: keep the floor of established productive outposts.
- `remoteGrowth`: grow toward measured route demand only from RCL 5, with a
  healthy economy and complete core road access.
- `remoteHaulingRecovery`: while established outposts are measurably blocked,
  permit only the carrier delta from minimum room coverage toward measured
  route demand. It does not authorize more miners, remote builders, new rooms,
  or expansion.
- `controllerBrigade`: build or replace the brigade only from RCL 5 while
  healthy; staffing readiness is a second required gate.
- `optionalConstruction`: permit non-survival construction.
- `optionalPopulation`: permit growth beyond protected floors.
- `expansion`: permit a new claim when the sponsoring room is healthy. The
  expansion planner separately requires a valid target, a real GCL slot, and
  enough energy capacity for a functional claimer; RCL is not a claim gate.
- `expansionMaintenance`: permit an already-owned expansion bootstrap unless
  the home room is critical.

No module may infer an equivalent permission from a saved plan, survey target,
or current creep count.

## Budgets

`constructionCrewScale` maps health to a fraction of measured construction
demand. A positive valid queue retains at least one builder when controller
safety allows it. The policy also publishes reserve thresholds for reporting
and future consumers.

## Role targets

Staffing has two layers. The first is the invariant owned-room baseline from
`core-colony-jobs.md`: one miner, one upgrader, one spawn filler, and one
builder/fixer, restored in that order. The second layer begins only when all
four baseline capabilities have viable coverage. It derives additional jobs
from the active operating scenario, Room Controller level (RCL), colony
health, physical work positions, and measured demand.

The baseline does not claim that four creeps are sufficient for a mature room.
It prevents situational demand—such as a second source, construction surge,
remote plan, or brigade—from consuming spawn capacity while a fundamental job
is completely absent.

The complete situational vocabulary is maintained in `job-catalog.md`. The
composition and tracking contract is `staffing-decision-matrix.md`. Neither is
a fixed roster: the matrix first applies RCL and built-asset feasibility, then
health and scenario gates, before turning measured work into job slots.

Every local role has:

- `min`: protected coverage needed for safety or an active capability.
- `desired`: sustainable target under current conditions.
- `max`: surge ceiling. It is not a target.
- `reason`: human-readable source of demand.

Roles are source, refiller, hauler, builder, repair builder, upgrader,
rebalancer, and tunnel builder. Body families are a separate concern:
`body.archetypes.js` translates role demand into miner, hauler, controller,
worker, field, and claimer body coverage.

## Remote targets

Remote policy keeps separate minimum and desired totals:

- miners: WORK demand for active source lanes.
- haulers: minimum room coverage versus measured route throughput.
- builders: minimum maintenance coverage versus current remote work demand.

When growth is disallowed, desired equals minimum except for a bounded,
measured carrier surge under `remoteHaulingRecovery`. `staffing.plan.js`,
`worker.limits.js`, and the body roster must consume these values unchanged.
They may map a missing slot to a particular remote room, but may not reconstruct
the totals from survey memory. `remote.spawn.js` performs that slot mapping for
new bodies. `remote.recovery.js` may reuse existing local surplus only up to the
remote minimum totals, covering each source lane before stacking extra WORK on
one lane.

## Priority model

Staffing selection occurs in two passes.

First, restore the one-of-each baseline:

1. miner;
2. upgrader;
3. spawn filler;
4. builder/fixer.

Second, derive and rank additional demand:

1. respond to the active scenario, including combat, post-battle recovery, or
   code recovery;
2. restore additional safety floors such as full source coverage, controller
   downgrade protection, local transport, and critical repair;
3. restore minimum established remote lanes;
4. add capabilities unlocked by the current RCL only when health permits;
5. grow toward measured desired local and remote staffing;
6. use true surplus for optional upgrading, construction, industry, or
   expansion.

This order is a policy contract. Specific assignment code may rank simultaneous
gaps by coverage, but it must not elevate an optional saved plan over a missing
baseline or minimum. Scenario rules may interrupt a creep's immediate action
for defense or healing without erasing its baseline ownership.

## Population and replacement

`worker.limits.js` collapses policy targets into minimum and desired total
population. The desired total is effective only while `optionalPopulation` is
true; otherwise the effective cap is the minimum. `population.control.js` adds
the approved or still-living brigade body count plus a bounded transition
allowance for retiring, over-budget remote, current expansion, and up to four
missing required capabilities hidden by wrong-role bodies. That overlap permits
the correct replacement to spawn while the surplus body is reassigned or
retired; it does not raise the durable policy target. The spawn policy never
exceeds the resulting cap merely because an assignment is urgent. Retirement
reduces surplus without targeting protected specialists.

Replacement lead time belongs to lifecycle and staffing viability. A creep
that will die before its replacement can take over does not count as viable
coverage. This is how the colony replaces roles before they disappear without
continually increasing the target.

## Trend adjustment

Trend analysis samples sustained work, energy, population, routing, and
assignment behavior. It may add bounded repair or haul demand. It must:

- require multiple samples;
- decay when the pressure clears;
- preserve `min`, `desired`, and remote minimum/desired distinctions;
- record a reason;
- never introduce a new role or permission.

## Acceptance scenarios

- At RCL 2, no brigade or remote growth is permitted.
- At RCL 5 and healthy, links and brigade may operate after protected staffing.
- At RCL 5 and strained, ordinary remote growth waits. If established outposts
  are blocked with a sustained backlog, carrier recovery may scale toward the
  measured route target without reopening other remote growth.
- A lapsed core road pauses remote growth without deleting active remote plans.
- An established brigade cannot replace missing relays without full protected
  source coverage and at least one viable local hauler, refiller, and controller
  worker, or while repairs are critical. Construction and remote backlogs pause
  a new rollout but do not permanently starve replacement of an established
  atomic relay line.
- Construction crew size contracts with health but priority infrastructure is
  not confused with many duplicate workers choosing the same site.
- Full source buffers combined with a depleted spawn network are strained
  logistics recovery even when storage is rich. Remote and optional population
  growth pause; measured hauling pressure remains essential, and otherwise
  idle flexible workers may temporarily cover unmet refill capacity.
- Trend adjustment cannot turn remote desired staffing into remote minimum.
- Expansion waits when home health is strained; controller level and core-road
  completion do not independently block a claim. Capability, GCL, and target
  validity remain planner gates.
  an owned bootstrap may continue unless home health is critical.
- Below 1,000 CPU bucket, slow planning and visual work pause while survival
  execution continues.
