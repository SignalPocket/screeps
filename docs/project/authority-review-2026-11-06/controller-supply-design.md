# Controller supply design: carriers and existing buffers

Stable key: screeps-controller-supply-design-2026-11-06.
Status: design direction accepted by Katherine; detailed contract prepared for review. No implementation or live-delivery authorization.

## Confirmed direction

Use carrier supply with current structures as the default. The brigade becomes an optional experiment outside the default controller path. Katherine selected this direction after the authority review and comparison; this is not approval to change code, remove structures, disable running behavior or deploy anything.

## Initial home-room route

For W7N4, retain storage at (26,27), both current controller containers, both links, current sources and the existing upgrader position. The current upgrader at (37,13) consumes from its assigned container at (37,14), ID 2bdae3c57f81e36. That makes this container the initial supply endpoint candidate. Revalidate IDs, geometry and the upgrader's current station before implementation; do not blindly restore stale snapshot fields.

The initial routine route is owned storage -> dedicated controller-supply carrier -> the upgrader's current controller container -> upgrader. Storage withdrawal obeys the existing room policy's protected reserve, with a defined controller-emergency exception. It does not force every source delivery through storage. At lower RCLs or without storage, the same job binds an eligible source/container with surplus after protected spawn/refill demand. No future structure is a dependency of the early route.

The second controller container can remain as infrastructure and a secondary endpoint when real consumption or temporary blockage warrants it. Do not generate an independent permanent fill quota solely because it exists. Current links remain in place; their existing transfers must be accounted for as incoming supply to avoid double-funding. Links cannot independently preempt the controller/spawn reserve contract.

## Owners and boundaries

| Concern | Proposed authority | Rule |
| --- | --- | --- |
| Affordable upgrading and safety | Effective room policy | Publish desired energy per tick and emergency floor from actual budget. Keep safety distinct from optional growth. |
| Supply capacity and roster | Staffing/assignment coordinator | Convert consumption, measured route time and current stock into carrier capability. Assign a stable controller-supply slot and fund its body/spawn overlap in the same budget as other jobs. |
| Current load | Work dispatch | Own exact pickup, quantity and destination for the load. Retain a useful loaded delivery through routine replanning. |
| Upgrading | Controller work assignment | Consume from the bound local container while within upgrade range; do not commute to storage while the assigned container is usable and funded. |
| Temporary interruption | Same assignment coordinator | Record cause, priority, old/new action and release condition. A subsystem proposes an exception rather than silently taking the creep. |
| Geometry | Active job/station planner | Reserve only the active work tiles and short-lived movement claims. A dormant brigade plan grants no default worker or tile ownership in the new design. |
| Observation | Reporting/measurement | Record assigned versus executing versus blocked capacity and actual resolved deliveries. Successful action scheduling alone is insufficient. |

This names responsibilities; it does not require adding a large new framework or adopting a particular module layout. The first implementation proposal should reuse useful existing boundaries and remove competing decision paths within its bounded scope.

## Capability and budget rules

Start from the observed four-WORK consumer and measured effective consumption rather than spawning a 15-WORK consumer merely because an old labor plan requests one. Preserve the ability to improve consumer capacity later through the same policy and replacement contract. The old policy-versus-enforcer headcount conflict must be resolved in the implementation specification; it must not remain an invisible extra rule.

For a dedicated lane, sustainable supply equals confirmed energy delivered over complete cycle time. Carrier capacity and count must exceed affordable consumption with an agreed margin and fit replacement production. The offline 200-capacity estimate is a candidate body for evaluation, not an approved fixed headcount or performance promise. Existing 350-capacity bodies may be reused only if releasing their former duties leaves all home floors covered.

Do not count an assigned controller supplier as simultaneously available for source collection or spawn refill. If a body shares time between duties, measure that allocation explicitly and budget the reduced controller throughput. Optional remote repair cannot seize this protected capability by directly rewriting role fields.

## Controller-buffer control

Define low/high stock thresholds from affordable consumption, observed delivery/replacement lead time and buffer capacity. Use separate enter/exit thresholds to avoid changing lanes every tick. Before coding, the bounded implementation plan must state the actual initial values and why the baseline supports them. No arbitrary numerical reserve has been declared accepted in this document.

Normal behavior: fill the active consumer's buffer to its funded working target, stop withdrawing for that lane when funded, and retain the supply specialty while parking or doing explicitly permitted bounded work. Temporary idleness does not erase the owned slot or create another supplier request. A full buffer is normal backpressure, not failure. An empty source or vanished destination is a validated failure requiring a reasoned rebind.

## Priority and interruption proposal

The accepted overall priority is reliability before growth. For this lane, specify these exceptions before implementation:

- Hostile retreat/healing can interrupt execution while retaining durable specialty, with an explicit safe/resume condition.
- A genuine home spawn-energy emergency can temporarily redirect a load through the shared coordinator; ordinary nearest-target changes cannot.
- Controller downgrade danger invokes the shared emergency consumption/supply policy, rather than a second role enforcer or an unbounded population increase.
- Construction, surplus remote repair and brigade experiments cannot silently claim the protected supplier.

Detailed numeric emergency triggers remain part of the bounded implementation proposal. No new priority values were written to the running colony.

## Replacement and recovery

One stable supply slot may have one bounded preventive replacement overlap. Lead time includes spawn duration, travel to pickup/delivery and measured delay. The new body must demonstrate usable coverage and a resolved first delivery before releasing the incumbent, except for an independently required safety action. A dead/incapable owner triggers slot recovery; it must not be mistaken for a reason to create a separate target in another planner.

If the supplier is unavailable while stocked buffer remains, continue upgrading within the budget and request its replacement. If supply fails, use one explicitly authorized compatible surplus donor or direct mobile upgrading as a bounded fallback after home survival checks. Reuse the same slot/mission evidence. Do not create a hidden relay-substitution pool.

## Early progression and future optimization

RCL 1: direct mobile worker remains a sufficient bootstrap path; a container is optional and legally available. RCL 2-3: carriers plus container buffers as affordable. RCL 4: storage joins the same source contract when built and funded. RCL 5+: links may replace a measured travel leg while preserving carrier fallback. No storage/link dependency is allowed in the early path.

For future rooms, choose the storage/core position with controller access, source distances, spawn/refill access, defense, terrain and future structures together. A compact handoff arrangement is a layout option, not a universal rule to put storage next to the controller at any cost. Current-room relocation remains deferred pending a separate case for its benefit and a safe holding plan for reserves.

## Brigade disposition

The accepted default design excludes brigade ownership of controller supply. A future experiment needs its own explicit enablement, funded roster/spawn budget, measured success criterion and end condition. A saved geometry plan alone must not reserve tiles or borrow workers in the default design. This describes the desired end state; current running behavior remains unchanged until an approved implementation and delivery.

## Proposed delivery sequence: no action taken

1. Write one bounded implementation plan covering effective controller staffing, supply ownership and the brigade overrides that can defeat it. Include thresholds, compatibility cleanup, exact changed files and rollback.
2. Prepare in an isolated copy. No edits to Steam's synchronized JavaScript during review.
3. Verify local repeated-tick interactions: source/refill safety, loaded retention, full/empty buffers, death/arrival handoff, emergency override/release, links, dormant brigade geometry and remote repair donor protection.
4. Obtain exact approval for the reviewed gameplay artifact and live delivery.
5. Observe completed supply cycles and a replacement transition. Attribute deliveries to the selected route and confirm adjacent duties remain covered. Then resolve legacy brigade behavior without a period where both systems compete or the upgrader loses supply.

This is one coherent behavior change with explicit boundaries. If the affected authority paths prove too broad for safe delivery, split implementation by a documented dependency sequence while preserving one agreed final contract; do not leave contradictory rules as permanent fallbacks.
