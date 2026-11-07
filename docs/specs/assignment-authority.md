# Assignment authority

Status: accepted; migration in progress

## Invariant

Every staffing and work decision has one authority at each layer:

1. The room staffing plan owns which capability slots are required.
2. A durable creep assignment owns one creep's role, room, and slot.
3. A durable job owns the exact source and target object IDs it will use.
4. The executor performs that job; it does not select a competing role,
   destination, or population target.

Headcount is not capability. The population cap must include every protected
slot, authorized recovery slot, living brigade relay, and a bounded overlap
while a wrong-role body is being reassigned or retired.

## Durable assignment contract

A creep assignment must identify:

- owning home room;
- role and body capability family;
- work room and stable slot or lane;
- source object ID when the job collects or harvests;
- target object ID when the job delivers, builds, repairs, or interacts;
- policy/staffing plan version;
- assignment time and last validation time;
- the reason for the latest change.

Valid reassignment reasons are limited to:

- assigned object vanished or became invalid;
- threat retreat or post-battle recovery;
- creep can no longer perform the required capability;
- replacement handoff;
- explicit policy contraction or expansion;
- measured lane recovery with an unfilled authorized slot.

Convenience, proximity alone, a stale role label, or another subsystem finding
work are not sufficient reasons. Neither is a review timer expiring while the
assigned object remains valid and still needs the assigned work.

## Stability rules

- A valid assignment persists across ticks.
- A temporarily empty work queue does not erase the assigned specialty; the
  creep may execute fallback work while retaining its durable ownership.
- A loaded logistics creep finishes its exact Store, extension-buffer, or
  controller-buffer delivery before routine priority changes can reassign it.
  Only a priority-zero room-energy emergency may interrupt that load.
- A planner may refresh evidence without rewriting the assignment.
- Reassignment compares the existing contract with the proposed contract and
  records the reason before changing ownership.
- A replacement owns its protected slot before an aging incumbent is released.
- Group planning assigns distinct or explicitly shared targets before creep
  execution. Individual creeps do not race to the first visible object.
- Emergency actions such as retreat may temporarily override execution but do
  not silently erase the durable assignment.

## Migration

Current fields such as `role`, `remoteRoom`, `remoteHaulerSlot`, source fields,
`demandLane`, `workJob`, and `taskTarget` are parallel authorities in parts of
the legacy loop. During migration they may mirror the durable contract, but
new code must not treat them as independent permission to reassign a creep.
`assignmentBuilderMission` is the first durable specialty mirror: fallback
dispatch may change the current task, but not the owned builder specialty.

Migration order:

1. source replacement and handoff;
2. remote miner, carrier, and builder roster ownership;
3. refill, buffer, and controller logistics;
4. construction, repair, and upgrade jobs;
5. remove legacy decision paths and retain only compatibility mirrors needed
   for reporting.

## Acceptance scenarios

- A newly spawned source replacement cannot become a builder while its source
  slot still requires replacement coverage.
- A blocked outpost carrier slot can use a compatible genuine surplus body or
  a bounded transition spawn without raising unrelated population targets.
- Existing wrong-role bodies are counted separately from missing-capability
  transition slots, so a full but mis-composed roster cannot deadlock its own
  correction.
- A creep with a valid remote carrier assignment does not enter local refill
  work unless the assignment contract records an emergency override.
- Two creeps cannot independently claim an exclusive source or target.
- Every changed role, room, slot, source, or target has a recorded reason.
- The dashboard can report required, assigned, executing, blocked, and
  transitioning counts from the same contracts used by the executors.
