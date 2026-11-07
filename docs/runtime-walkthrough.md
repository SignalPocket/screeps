# What happens during a tick

This is the narrative map of the running colony. It complements the module
reference: the module reference says who owns a decision; this document says
what happens, in order, and what should be visible in the room.

## The short version

Every game tick follows the same control loop:

1. **Observe.** Read rooms, structures, sources, construction, stored energy,
   controller safety, outposts, creep bodies, and existing assignments.
2. **Classify.** Convert those facts into colony health and an RCL-aware mode.
3. **Budget.** Decide the protected minimum, sustainable desired, and absolute
   maximum for every capability.
4. **Plan the group.** Match the whole living roster to distinct lanes and
   objects before individual creeps run.
5. **Retain valid ownership.** Keep a creep's useful durable job instead of
   choosing again merely because another target is closer this tick.
6. **Execute.** Withdraw, transfer, harvest, build, repair, upgrade, defend, or
   move toward the exact object owned by the job.
7. **Explain.** Store policy, jobs, health, brigade state, and short speech
   labels so the same decisions can be inspected after the tick.

An executor may cope with a vanished or completed object. It must not invent a
new population target. A planner may recommend a new job. It must not make a
creep abandon a still-valid loaded delivery without an emergency reason.

## Remembered observations and refresh cadence

The room is indexed once per tick. Every subsystem shares the same source,
structure, construction-site, creep, and tombstone arrays, including arrays
grouped by structure type. Code must ask `room.index.js` for these lists rather
than repeat `room.find(...)` in each planner or for each creep.

The refresh schedule reflects how quickly the information can safely change:

- **Every tick:** object membership for visible rooms and volatile values such
  as current energy, free capacity, hits, cooldowns, and hostile presence.
- **Every 5 ticks:** only short reaction reviews that do not need to run in
  each creep executor. New code should use the shared staggered scheduler.
- **Every 10 ticks:** slow construction/repair inventory and ordinary roster
  reconciliation.
- **Every 20 ticks:** stable store-purpose inventory, infrastructure layout,
  outpost surveying, and diagnostic CPU windows.

Remembering an object list does not freeze the objects. A cached structure
reference still exposes its current `store`, `hits`, and cooldown during that
tick. Persistent ID lists are revalidated with `Game.getObjectById`; missing
objects are discarded instead of causing another room-wide search.

## From room facts to population

`room.situation.js` measures the live room once and builds a plain data
snapshot. `colony.policy.js` consumes that snapshot without touching the game
API. It returns:

- `mode`: what kind of room operation is currently dominant;
- `health`: critical, recovering, strained, healthy, or surplus;
- `permissions`: which optional systems may run;
- `budgets`: how much construction, repair, and growth the economy can carry;
- `roles`: minimum, desired, maximum, and reason for each role;
- `remote`: minimum and desired outpost coverage.

The three staffing numbers are intentionally different:

- **minimum** is a safety floor that must remain covered;
- **desired** is the sustainable target the spawn works toward;
- **maximum** permits a bounded surge but is not itself a spawn request.

The same distinction governs retention. When construction or repair demand
falls, the colony retains the desired builder roster, repurposes compatible
surplus into real logistics/controller gaps, and recycles only the remainder.
It must not retain every builder up to the maximum or relabel every leftover
WORK body as another builder.

`staffing.plan.js`, `body.archetypes.js`, and `worker.limits.js` then compare
that policy with viable bodies. This matters because ten creeps are not useful
coverage if none has the parts needed for the missing job.

## From population to one exact job

The room demand planner first assigns lanes across the whole group. Examples
are `collect`, `refill`, `refill-buffer`, `buffer`, `storage`, `build`,
`repair`, and `upgrade`. It then binds the lane to object IDs:

```text
creep -> lane -> source object -> destination object -> reason
```

`work.dispatch.js` retains that job while it is still useful. A loaded delivery
keeps its destination even if the relative priorities change on the next tick.
The executor in `main.js` performs the retained job. `taskTarget` and the speech
bubble describe execution; `workJob` is the durable ownership record.

When debugging, read those fields in that order. A role label describes the
body's specialty. It does not necessarily describe the action happening on the
current tick.

## Controller, brigade, and controller container

These are three separate jobs:

1. The **controller brigade** transports energy from storage to the controller
   side. Relay bodies are `CARRY, CARRY, MOVE`; they cannot upgrade.
2. The **controller container** buffers delivered energy. A full buffer applies
   backpressure, so the brigade waits instead of pushing more energy into it.
3. A dedicated **upgrader** has `WORK` parts, withdraws from the controller
   buffer, and spends that energy on the controller.

If a numbered relay is missing or its replacement is still traveling, an
uncommitted compatible carrier temporarily receives
`controllerRelaySubstituteSlot` and runs that seat as `SUBn`. Its real role and
durable job are preserved. The substitute leaves when the actual `BRIGn`
reaches the seat, preventing both a pipeline gap and a permanent reassignment.

Substitution is capped at one borrowed creep per room. A real `BRIGn` that is
already spawning or traveling owns its slot and does not recruit a stand-in.
If several slots are absent, the colony rebuilds the real roster instead of
converting the logistics roster into a second shadow brigade.

An established stationary brigade is maintained as one atomic capability.
Temporary colony-health restrictions still prevent a new brigade from being
started, but they do not leave a partially seated line consuming bodies while
unable to deliver. Once source, refill, hauling, and upgrader minimums have
coverage, missing real seats are replaced.

The brigade's intake is storage. When the controller side needs
energy, logistics balances the extension staging deficit against a bounded
storage intake target, then delivers the controller share to storage. Directly
stocking the controller buffer while storage is empty would bypass and starve
the entire seated line.

When established outpost containers are measurably blocked, remote hauling and
missing brigade seats enter balanced recovery after local survival minimums.
The least-covered capability is selected by `current / target`; equal coverage
goes to the lane least recently served by a successful spawn. In the observed
0/7 hauler and 13/17 brigade case, hauling starts first, then yields as its
proportional coverage catches the brigade instead of monopolizing all seven
spawns. Recovery haulers wait for at least a 300-energy functional body instead
of launching a nearly empty long-distance carrier.

Refillers, local haulers, rebalancers, and remote haulers use pure
`CARRY+MOVE` bodies. Their authorized lanes are logistics-only, so charging
them for an unusable `WORK` part reduces throughput and can prevent a viable
100-energy emergency refiller from spawning.

Before borrowing that one substitute, the roster reconciles the entire real
line. If one numbered slot has duplicate real relays while another slot is
empty, the waiting duplicate is reassigned to the empty number, its stale seat
and movement state are cleared, and its speech/task label follows the new
slot. Real relay coverage always outranks temporary substitution.

Therefore, a healthy full brigade does not replace every RC worker. One
upgrader is still required to drain the buffer. Conversely, a full controller
buffer means an upgrader should use that local buffer; it should not fetch the
same load from storage.

Current policy also interprets a controller buffer at least 90% full as
delivery outrunning consumption and may raise routine upgrading to two slots.
That rule is visible in `colony.policy.js`. It is a policy decision, not brigade
behavior. If this rule changes, update the adaptive-policy spec and tests as
well as the code.

## Energy routing

Energy has destinations with different purposes:

- source containers collect harvest output;
- storage holds the room reserve;
- the extension-side container/link stages spawn and extension energy;
- the controller container/link stages controller energy;
- towers take priority whenever they are not full;
- the brigade carries only along its planned controller pipeline.

Spawn and extensions are one refill network. `room.index.js` builds their
shared list once per tick. After incomplete towers are handled, every loaded
filler is matched to the closest non-full spawn or extension; reserved free
capacity prevents several fillers from selecting the same last opening.

Dedicated refillers provide stable coverage but do not hold an exclusive lock.
When the group demand plan detects more missing room energy than the specialist
crew can carry, loaded local haulers may enter the same refill lane and use the
same closest-target reservations until the network recovers.

Spawn `minimumEnergy` is a post-wait safety floor, not permission to launch a
small body immediately. Outside a real survival emergency, the spawn waits for
the extension network to charge until its bounded policy timer expires; even
then, the requested body must meet its functional floor.

The controller-side container and link are filled before controller-link
energy is treated as surplus. Only after the controller buffers reach their
reserve may the link beam excess down to the extension side for spawn and
extension filling.

The same pair can transfer in reverse. Once the spawn and extensions are fully
charged, energy already staged in the extension-side link may move up to the
controller link when controller buffers are below their working reserve. The
links therefore balance two protected sides; neither endpoint is permanently
the sender.

A carrier's lane determines which family of destination is legal. Resource and
capacity reservations prevent two creeps from believing they own the same last
energy or free capacity. Extension refill and controller supply are separate
lanes so a controller backlog cannot silently consume the spawn-side reserve.

`room.memory.energyStoreRegistry` is the shared remembered inventory of every
container and storage structure. It records stable IDs, positions, purposes,
and whether each structure may receive returning remote cargo. Each H-creep
then retains one exact `remoteDeliveryTarget` from that list for its current
load. A nearer eligible container beats storage; storage wins an exact tie.

## Construction and roads

Construction priority is not simply distance to the nearest site. Essential
containers and links establish energy flow; extensions add room capacity; roads
support the routes that make those structures usable. The planner checks both
completed structures and existing sites before placing anything, so it must
never place a site on top of its completed counterpart.

Shared construction targets have a finite crew claim. “Shared” permits the
small useful crew calculated from remaining construction cost; it never means
every builder may select the same extension or link. Once that claim is full,
later builders must take another reachable site or leave the build lane.

Strategic roads connect sources, containers, links, the controller, extensions,
storage, exits, and outpost corridors. If the direct dotted route crosses an
illegal tile, the pathfinder must return a legal route around it rather than
leaving an impossible desired segment.

## Fallback work

Fallbacks exist to avoid wasting a funded creep when its exact target completes
between planning and execution. They are deliberately lower authority than the
durable plan:

1. retain the assigned target while it is valid;
2. prefer another target in the same lane;
3. use repair, then construction, then controller work only when the lane
   permits flexible WORK;
4. park when the plan explicitly says `standby`.

A fallback action must not rewrite the creep's specialty or create a new spawn
requirement. If many creeps repeatedly fall through to the controller, the
problem is in group planning or target validity—not evidence that the room
needs more upgraders.

## What the speech bubbles mean

- `GetS1` / `GetS2`: collect from a source-side buffer.
- `GetSt`: collect from storage.
- `Fill`: fill spawn or extensions.
- `StockSp`: stock the extension-side staging buffer.
- `StockRC`: stock the controller-side buffer.
- `RC`: spend carried energy upgrading the controller.
- `BRIGn`: occupy and run controller relay slot n.
- `Ext`, `Cont`, `Road`: build that structure type.
- `Bal`: rebalance energy between fixed buffers.
- `Wait`: intentionally parked by the plan.

Speech reports the current action, not the entire route. `GetSt` followed later
by `RC` means that creep loaded at storage and then upgraded; it does not mean
the brigade itself upgraded.

## A practical trace

When room behavior looks wrong, inspect one decision chain instead of starting
with the visible role name:

1. room `populationPolicy`: was the capability authorized, and why?
2. room `demandPlan`: how many slots were assigned to the lane?
3. creep `workJob`: which source and target IDs does it own?
4. creep `dispatchCommitment`: is a loaded delivery being retained?
5. creep `task`, `taskTarget`, and speech: what is executing now?
6. reservations and target state: did the object fill, empty, vanish, or become
   claimed before execution?
7. operational history: is this one transition tick or a sustained failure?

The fix belongs at the first incorrect layer. Patching the final movement or
speech label cannot repair a wrong population or group assignment decision.
