# Screeps

Personal Screeps colony, edited directly in Steam's local script folder.

The durable architecture, policy specifications, subsystem ownership, module
reference, decision records, and live-verification procedure are indexed in
[`docs/README.md`](docs/README.md).

## One-folder workflow

Open this folder in VS Code. Edit main.js and save; Steam synchronizes the
script to the local server's default branch. Saves can affect the running colony.
Commit and push separately to save version history in the private GitHub repository.
There is no second deployment folder or copy step.

Local server: 127.0.0.1:21025. Game account: ginaria. Branch: default.

## Colony policy

`colony.policy.js` is the single population model. Each owned room publishes a
minimum, desired, and maximum for harvesting, refilling, hauling, building,
repair, upgrading, and container balancing. The values respond to RCL, available
and stored energy, source routes, usable mining tiles, construction and repair
backlogs, controller downgrade risk, extensions, containers, and active outpost
rooms. `main.js` executes those roles and keeps the policy snapshot in
`room.memory.populationPolicy` for inspection.

`main.js` is the tick orchestrator. Reusable, game-independent behavior lives
in small modules: `colony.policy.js` derives staffing, `body.factory.js` builds
role bodies and log labels, and `resource.reservations.js` provides the shared
per-tick energy/capacity ledger. `room.index.js` owns cached room lookups and
`movement.service.js` owns navigation, traffic costs, and route reservations.
`creep.lifecycle.js` owns body-capability checks and local/remote replacement
lead-time rules, while `creep.reporting.js` owns compact role/task labels,
target descriptions, and death cleanup logs. `source.staffing.js` owns mining
capacity, walkable source slots, and adaptive staffing reviews;
`source.positions.js` owns miner-station and tunnel-site geometry;
`room.strategy.js` owns RCL/infrastructure/expansion progression gates, and
`room.status.js` derives an explainable health score from reserves, source
utilization, spawn fill, logistics pressure, controller safety, and work queues.
`outpost.status.js` applies the same model to visible remote rooms using remote
production and haul-backlog semantics rather than spawn-fill penalties.
`room.situation.js` is the live-room adapter that gathers structures, sources,
work queues, remote plans, and learned mining history before calling the pure
population-policy and room-health modules.
Active threats in owned rooms and their visible outposts immediately prioritize
at most one attack-capable defender per hostile room, ahead of baseline staffing
gaps. Defenders travel to the threat room and target its most dangerous hostile;
surplus defenders recycle, and the war timer alone does not trigger more
spawns. Nearby noncombat creeps use obstacle-aware flee paths. Observed damage sets the persistent
`Memory.war` flag (also exposed as `global.war`) for a bounded response window;
injured creeps seek a friendly healer or tower. Owned rooms and active outposts
also request a local worker when no resident or assigned remote worker can
cover the room. New defenders reserve a small carry payload when energy allows;
after the war window ends, a safe survivor with active CARRY and MOVE parts may
fill an open slot in an active controller brigade instead of being recycled.
`worker.limits.js` converts policy-owned local and remote role totals into the
room's minimum and desired population caps. When optional population is paused,
the effective cap contracts to the protected minimum while existing auxiliary
bodies age out through an explicit transition allowance.
`room.stages.js` is the canonical RCL 0-8 planning record. Each stage declares
its goal, operating logic, construction order, and advancement gates. The
active entry is copied to `room.memory.stagePlan` for live inspection.
`remote.hauling.js` owns outpost readiness, measured route throughput, carrier
capacity, and dispatch ranking. `remote.spawn.js` maps policy-owned minimum and
desired gaps to one eligible lane; `remote.recovery.js` reuses genuine local
surplus without exceeding remote minimum budgets. `energy.phase.js` owns the hysteresis
between filling spawn capacity and releasing workers to normal work.
`road.planner.js` owns strategic room routes, traffic history, hot-tile
selection, road visualization, road budgets, and ranked site placement.
`infrastructure.planner.js` owns extension clusters, source and extension
buffers, controller containers, container retirement, and the safeguards that
keep essential containers ahead of road construction.
`creep.routing.js` protects replacement-worthy role retention and routes
upgraders to the container they actually selected when the controller buffer
is empty.
Pure scenarios in `policy.test.js` and `common.test.js` protect those boundaries
while role executors are migrated out of `main.js` incrementally.

Outposts scale from their visible sources, route distance, construction sites,
and container pressure. A completed remote source container immediately opens a
haul lane; each ready source gets an essential carrier before surplus local work.
Returning inter-room haulers unload into the first reachable home buffer, while
the room rebalancers distribute that energy between extension and controller
buffers. One balancer covers the outpost handoff network; additional balancers
are assigned only while container imbalance exists and return to flexible work
when the buffers recover.
Empty remote haulers may switch away from an exhausted lane to the fullest
visible outpost container; loaded and in-transit carriers finish their trip.
An active, visible outpost can also receive a cache container on the corridor
near its border with the home room. Remote haulers stage source energy there,
then collect it on a later trip for delivery home; this adds a trip per staged
load without introducing a separate creep role.
When the controller buffer reaches 90%, healthy policy raises routine upgrading
to its two-station operating cap. The larger physical station count remains a
surge ceiling, not an automatic spawn target.

The room planner places source and controller containers on accessible,
low-swamp routes, clusters extensions away from established traffic, and queues
roads only after container and extension sites are clear.

## Check

Run `npm run check` for syntax validation plus pure population-policy scenarios.
This does not replace multi-tick verification in the live local server. Keep
credentials out of Git.

## References

- https://docs.screeps.com/
- https://docs.screeps.com/api/
