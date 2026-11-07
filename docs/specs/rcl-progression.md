# RCL progression specification

`room.stages.js` is canonical. This document explains how stage intent affects
choices; it does not duplicate every constant.

| RCL | Stage | Primary objective | Optional work rule |
| --- | --- | --- | --- |
| 0 | unclaimed | claim and establish spawn | support only after ownership/reservation |
| 1 | bootstrap | continuous harvest, spawn, controller | flexible survival bodies only |
| 2 | energy network | containers, extensions, refill lane | roads follow energy structures |
| 3 | logistics | separate mining, hauling, refill, work | builders follow real demand |
| 4 | reserves | storage and durable reserve | upgrading scales from surplus |
| 5 | automation | links, mature roads, controller supply | remote growth and brigade require health |
| 6 | industry | terminal, labs, minerals | protect reserve before industry |
| 7 | expansion | establish another room | home floors remain protected |
| 8 | mature | resilient production and support | measured demand replaces fixed counts |

## Implementation status

| RCL | Current executable coverage | Remaining gap |
| --- | --- | --- |
| 0-4 | population, energy, construction, repair, storage, and logistics gates | continue extracting inline execution from `main.js` |
| 5 | links, towers, core roads, extensions, and controller brigade are policy-gated | live multi-tick tuning remains required |
| 6 | inherited RCL 5 economy and health scaling continue | terminal, labs, extractor, mineral, and industry policy are not implemented |
| 7 | healthy/core-road expansion claim and bootstrap gates are implemented | factory and broader expansion sponsorship are not implemented |
| 8 | inherited health/population control continues | observer, power, final defense, market, and mature support planners are not implemented |

The stage catalog records intent. A row is executable only when a planner or
runtime consumes its policy; stage text alone is not implementation.

## RCL 5 decisions

- Build links before new extensions when both are pending.
- The extension-side and controller-side links form a bidirectional balancing
  pair. When the spawn/extension network is fully charged and the controller
  buffers are below their working reserve, extension-side link energy moves up
  to the controller link. When the controller reserve is satisfied and the
  spawn/extension network needs energy, controller-side surplus may move down.
  Neither direction may consume the protected reserve of its sending side.
- The controller-side link is an input endpoint, not the final store. A local
  rebalancer hands its energy into controller containers below the 75% target,
  while direct upgrader withdrawals remain permitted.
- The controller brigade is a stage capability, not a survival role. A new
  line needs an RCL-appropriate plan, healthy policy permission, and complete
  essential staffing.
- An established stationary line may replace missing relays after full source
  coverage and at least one viable local hauler, refiller, and controller worker
  are present, with no critical repairs. It does not wait for construction or
  remote backlogs because a partial line cannot deliver energy to its endpoint.
- Containers, links, storage, and towers are service-road destinations. Their
  approach roads are planned when the structure or site appears and remain
  protected maintenance infrastructure after construction. The tile directly
  beside the endpoint is placed before lower-value corridor segments, and
  service routes are included in the authorized road budget.
- Dotted road plans use the same tile compatibility rules as construction.
  Roads may share containers and ramparts; links, extensions, towers, walls,
  and incompatible construction sites are blocked and pathfinding routes
  around them.
- Complete and maintain core road access before growing remote hauling toward
  full measured throughput.
- Established productive outposts retain a minimum income floor during a
  strained period.
- Construction remains divided: links outrank extensions; maintained roads and
  source/controller infrastructure are valid repair targets; decorative or
  abandoned infrastructure is not.

## Progression versus health

RCL unlocks capability. Health grants budget. A high RCL room in recovery must
regress its optional workload without pretending it lost the capability. When
health recovers, the same saved stage plans may resume through current policy.

See `job-catalog.md` for the full job vocabulary and
`staffing-decision-matrix.md` for the RCL/assets/health feasibility gates. The
stage catalog never creates a fixed roster merely because a level was reached.
