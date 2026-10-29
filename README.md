# Screeps

Personal Screeps colony, edited directly in Steam's local script folder.

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
When the controller buffer reaches 90%, the policy fills every usable controller
station with a WORK-heavy upgrader, capped by the room's RCL limit.

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
