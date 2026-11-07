# Controller supply comparison

Stable key: screeps-controller-supply-comparison-2026-11-06.
Status: comparison complete; Katherine selected carriers with current structures as the default design to specify. No code or layout changes.

## Recommendation

Use a simple, budgeted carrier-to-controller-buffer route as the baseline design, retaining today's structures first. Add link transport only where it replaces measured travel. Treat the 16-seat brigade as an optional experiment requiring a demonstrated advantage, rather than a prerequisite for a functioning controller. Plan an improved storage/link/controller area for future placement or a separately justified migration; do not relocate today's loaded storage just to simplify this one lane.

This follows the confirmed preference for reliable, explainable home operation. It is an engineering recommendation based on code and a bounded observation, not a tested replacement. Katherine requested comparison of both preserved and redesigned layouts, with costs and disruption explicit.

## The job that stays the same at every RCL

Energy acquisition -> protected controller supply -> local buffer or direct worker inventory -> WORK creep upgrades controller.

Transport and upgrading are separate capacities. Count desired upgrade energy per tick, affordable WORK, actual consumption, supply throughput, replacement demand and emergency fallback together. Increasing transport cannot make four WORK consume 15 energy per tick. Nor does having 15 energy per tick in a planning budget prove that spending it is safe or desirable.

## What is available when

| Stage | Working baseline | Transition and safeguards |
| --- | --- | --- |
| RCL 1, startup | A mobile WORK/CARRY/MOVE creep acquires energy and upgrades directly; early source/spawn survival comes first. | No storage or links required. Containers are legally available even at RCL 1, but spending on them is an affordability choice rather than a bootstrap prerequisite. Keep one funded upgrade path. |
| RCL 2-3, established early room | Source containers plus a measured carrier lane to a controller container; upgrader stands within withdrawal and upgrade range where terrain permits. | Retain direct mobile supply until the container is built and actually funded. Introduce a separate carrier only when throughput/affordability supports it; a role label is not proof of a functioning lane. |
| RCL 4, storage unlocked | Existing source/carrier/controller-buffer route continues; storage becomes an available reserve/source. | Storage does not automatically become a mandatory detour for all energy. Choose the future core position before construction. Early routes remain usable if storage is empty or under construction. |
| RCL 5, two links available | Preserve carrier supply, or use a feeder at a suitable sending link -> controller receiving link -> upgrader/local buffer handoff. | Links teleport between links, not from storage directly. Adjacency needs an actual creep/handoff arrangement. Preserve spawn/refill budgets and carrier fallback while a link is cooling or empty. Two links are a hard slot budget at this stage. |
| RCL 6+, optional optimization | Additional links may support source/core/controller routes if useful. | The same controller-demand contract remains; later structures should replace transport cost instead of adding a competing policy. Outpost/industry/expansion implementation remains deferred. |

Legality cross-check: installed server constants allow five containers from RCL 0/1 onward, storage from RCL 4 (one), and links at RCL 5/6/7/8 (2/3/4/6). Public documentation agrees on storage and link progression. Our room.stages.js defers containers until stage 2 as a project sequence, not an engine minimum. References: [Container](https://docs.screeps.com/api/#StructureContainer), [Storage](https://docs.screeps.com/api/#StructureStorage), [Link](https://docs.screeps.com/api/#StructureLink). Installed constants and the baseline are the authority for this local server.

## Options in the current room

| Option | What changes conceptually | Cost / burden | Failure behavior / disruption |
| --- | --- | --- | --- |
| Direct mobile upgrader | Worker fetches its own energy and returns to upgrade. | Fewest separate ownership rules; WORK spends travel time idle. Useful bootstrap/fallback, poor default for long routine commutes. | No infrastructure migration; one body loss interrupts both transport and upgrading. Replacement safety and safe sourcing still needed. |
| Carrier -> controller container -> upgrader | Give a measured supply lane an explicit owner; upgrader consumes nearby buffer. Reuse the existing two controller containers initially. | One 200-capacity example carrier costs 300 energy and 18 spawn ticks; larger/slower/faster bodies sized from route and demand. No new structure required for this room. | Carrier loss is buffered; explicit bounded replacement/fallback is simpler than a whole chain. Requires resolving competing overrides and source/destination ownership, not merely changing a task priority. |
| Existing links plus carriers | Use today's controller/extension link pair with one agreed direction/priority and explicit loading/unloading owners. | Existing infrastructure has no new construction cost. Per-transfer 3% energy loss and distance cooldown; some local creep handling remains. | Today's sender (3,38) is far from storage (26,27). Calling it a storage link would not remove the long feeding route. Existing bidirectional spawn/controller balancing needs a chosen contract. |
| Storage-adjacent sender + controller receiver | Keep storage, relocate/reassign the other link to serve it; retain controller receiver. | Rebuild one link: 5,000 construction progress, ordinarily 1,000 construction energy at 5 progress/energy, plus labor, delivery and feeder body. Existing invested cost is sunk. | At RCL 5 both link slots are occupied, so a third cannot be added first. Drain/remove/rebuild a chosen link, temporarily replacing its existing extension service; preserve carrier fallback. Not selected or authorized. |
| Compact future storage/controller/link core | Choose mutually accessible standing tiles so short local handoffs replace long supply trips. | Future room: same basic structures, better placement. Current room: storage rebuild 30,000 construction progress, ordinarily 6,000 construction energy, plus drain/temporary holding, roads, layout and supply disruption. | Storage limit is one: cannot build a second while retaining the old. Current storage holds about 345,720 energy plus minerals, and all five container slots are occupied (10,000 total container capacity). Current containers cannot hold the reserve. A safe migration needs a separate consumption/export/holding plan, not a simple move. |
| Existing stationary brigade | Maintain the 16-seat saved relay chain from storage to two controller containers, plus a separate upgrader. | Sixteen CARRY/CARRY/MOVE bodies: 2,400 energy, 144 spawn ticks per roster, 16 execution participants and permanent seats. It has no transport energy loss but substantial replacement/ownership overhead. | One missing upstream relay can interrupt downstream delivery until coverage returns. Branch points can feed nearer buffers even if later seats are missing, so not every hole necessarily stops all output. Current readiness, substitutes, reservations and staffing rules need consolidation. |

Links require two endpoint structures and a path for energy into/out of them. They do not automatically transfer into containers or creeps. Official link behavior: 800 capacity, 3% loss, distance-based cooldown. Build and part costs above are from installed server constants; ordinary construction energy is a calculation assuming unboosted effective build power and no wasted actions. They exclude replacement service, transport, road work and interruption costs.

## Current-room numbers and what they mean

The bounded live baseline shows one four-WORK upgrader at (37,13), adjacent to the container at (37,14). Controller progress increases 256 over 66 ticks, about 3.88 per tick. The labor plan's 15-WORK target is higher than the present consumer's capacity. Routine quality replacement is also constrained by the single-upgrader relief rule; see the [authority review](assignment-authority-review.md).

The saved stationary brigade has 16 seats. Its constant permits up to 17, but that is not the current plan length. Zero real relays were active; a substitute occupied slot 0. Brigade recorded intake/handoff/delivery totals did not increase during the baseline. This does not measure a full chain's throughput. It does show that controller progress currently occurs without recorded brigade delivery in that window.

For an explicit cost comparison, a 16-seat line replaces 48 body parts per 1,500-tick nominal creep lifetime: 144 spawn ticks (9.6% of one spawn), 2,400 energy, averaging 1.6 replacement energy per tick. This omits travel, early replacement overlap and accidental losses. A 4-CARRY/2-MOVE carrier replaces six parts: 18 spawn ticks (1.2%), 300 energy, average 0.2 replacement energy per tick. Existing 7-CARRY/7-MOVE local carriers are larger: 700 energy and 42 spawn ticks each. All designs still require the upgrader and any pickup/refill work elsewhere in the economy.

These are prospective full-roster costs. With zero real relays, the current colony is not paying sixteen active relays' ongoing cost at that moment. The displayed sustainable replacement planner currently omits relay bodies; a future complete brigade cannot claim to fit that published budget without recalculation.

## Offline carrier feasibility estimate

I modeled shortest trips using saved terrain and baseline structures, with fully loaded CARRY weight, MOVE recovery, road/plain/swamp fatigue and one withdrawal plus one delivery action. No game execution or path-memory writes occurred. This deliberately optimistic model excludes live creep traffic, directional restrictions, queues, replacement travel and other jobs; empty/loaded endpoints are optimized independently. These are optimistic capacity estimates, not promised sustained rates.

| Example dedicated carrier | Capacity | To near controller buffer: ideal cycle / rate | To farther buffer: ideal cycle / rate |
| --- | --- | --- | --- |
| 4 CARRY, 2 MOVE | 200 | 25 ticks / 8.0 energy per tick | 32 ticks / 6.25 energy per tick |
| Existing body shape: 7 CARRY, 7 MOVE | 350 | 24 ticks / 14.58 energy per tick | 32 ticks / 10.94 energy per tick |
| 8 CARRY, 4 MOVE | 400 | 25 ticks / 16.0 energy per tick | 32 ticks / 12.5 energy per tick |

The estimates suggest that a small dedicated carrier is worth evaluating against the present four-WORK consumer before maintaining sixteen relays. They do not prove one carrier will meet a future 15-WORK goal. A shared carrier also spending time on spawn/refill cannot be credited with the whole dedicated rate. Use measured complete-cycle deliveries and a safety margin before deciding staffing.

Adding/removing saved brigade right-of-way restrictions did not change these shortest route estimates. Its unconditional reservations are still an authority problem; this model does not support blaming them for all current congestion.

Raw calculations: comparison-metrics.json in the local authority-review-2026-11-06 evidence directory. Baseline raw snapshots remain referenced in home-room-baseline-2026-11-06.md.

## Safe transition concept, after a design is chosen

1. Agree affordable controller consumption and minimum safety behavior, separate from optional fast upgrading.
2. Identify the controller supply owner, its exact source/buffer, reserve thresholds and replacement overlap. Specify who can interrupt it and when that interruption ends.
3. Keep present structures and a working controller buffer path while preparing the alternative in an isolated source copy.
4. Validate complete loaded delivery, refill/source protection, death replacement, blocked route, low energy and emergency downgrade scenarios together.
5. Only after a separately approved live change, observe complete supply and replacement cycles. Retire the old transport mechanism and its reservations only when the replacement is verified. No structure removal is implied.
6. Revisit link or storage migration only if measured benefit justifies the explicit disruption cost.

## Decision and remaining review

Katherine selected carriers plus existing controller buffers, retaining current structures. Links remain a later measured optimization and the brigade sits outside the default path as an optional experiment. The [detailed design contract](controller-supply-design.md) specifies this direction. Initial thresholds, transition details and the eventual implementation artifact still need review; no implementation is underway.
