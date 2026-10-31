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
- `controllerBrigade`: build or replace the brigade only from RCL 5 while
  healthy; staffing readiness is a second required gate.
- `optionalConstruction`: permit non-survival construction.
- `optionalPopulation`: permit growth beyond protected floors.

No module may infer an equivalent permission from a saved plan, survey target,
or current creep count.

## Budgets

`constructionCrewScale` maps health to a fraction of measured construction
demand. A positive valid queue retains at least one builder when controller
safety allows it. The policy also publishes reserve thresholds for reporting
and future consumers.

## Role targets

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

When growth is disallowed, desired equals minimum. `staffing.plan.js`,
`worker.limits.js`, and the body roster must consume these values unchanged.
They may map a missing slot to a particular remote room, but may not reconstruct
the totals from survey memory.

## Priority model

Safety floors are restored before optional desired staffing. Within the floor:

1. recover spawn/extension refill if the room cannot bootstrap bodies;
2. retain controller downgrade protection;
3. restore required local source WORK;
4. restore minimum local logistics and maintained repair capability;
5. restore the minimum established remote lanes;
6. allow stage features such as the controller brigade;
7. grow toward desired local and remote staffing;
8. use true surplus for optional upgrading, construction, or expansion.

This order is a policy contract. Specific assignment code may rank simultaneous
gaps by coverage, but it must not elevate an optional saved plan over a missing
minimum.

## Population and replacement

`worker.limits.js` collapses policy targets into minimum and desired total
population. `population.control.js` may add an approved brigade budget. The
spawn policy never exceeds this cap merely because an assignment is urgent.
Retirement reduces surplus without targeting protected specialists.

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
- At RCL 5 and strained, active remotes keep minimum miners/carriers while the
  seven-carrier desired roster waits.
- A lapsed core road pauses remote growth without deleting active remote plans.
- An established brigade cannot replace missing relays while essential jobs are
  below minimum or health disallows it.
- Construction crew size contracts with health but priority infrastructure is
  not confused with many duplicate workers choosing the same site.
- Trend adjustment cannot turn remote desired staffing into remote minimum.
