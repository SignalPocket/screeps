# Immediate operations assessment

Stable key: screeps-immediate-brigade-reservations-2026-11-06.
Status: assessed and captured; no gameplay action or code change.

## Requests and scope

After selecting carriers with current structures as the future default, Katherine requested a brigade for now to accelerate the room controller, and reservation of existing outposts. These are new immediate operational priorities, not a reversal of the documented need for explicit ownership and budgets. Whether the earlier no-code restriction is lifted for preparation, and the endpoint of the brigade push, are pending questions.

## Existing outposts

Active surveys identify W8N4, W7N3 and W8N3. Server saved state at tick 148163 shows all three neutral and unreserved. Each has two sources; at tick 148213 all six sources have capacity 1,500. Source generation can increase under reservation, so successful reservation must not be treated as permission for unbounded miner/carrier growth.

Runtime source search found no reserveController call. Existing claimer execution in main.js:4865-4900 attacks a hostile controller/reservation or claims a neutral controller using expansionTarget. It is not safe to repurpose that path merely by naming a creep reserver. The requested behavior needs a distinct reserve-only contract: the correct target room/controller, CLAIM capability, reserveController action, bounded travel/replacement and explicit stop/retreat rules. No claiming, attacking another owner's controller or signing is included.

A candidate initial body is two CLAIM and two MOVE: 1,300 energy and 12 spawn ticks each, three initial bodies totaling 3,900 energy and 36 spawn ticks. These are calculated from installed constants, not a selected implementation. CLAIM bodies live only 600 ticks; reservation decays, so travel and reservation-bank coverage determine replacement timing. One CLAIM cannot build a useful positive-duration bank against ordinary one-tick decay while continuously present. More than one CLAIM and actual arrival/remaining-time evidence are needed for a sustainable design.

Official reference: [reserveController](https://docs.screeps.com/api/#Creep.reserveController). Reserving differs from claiming and can be done without an extra GCL ownership slot. Admission must share home survival, spawn capacity and CPU budgets with the requested brigade rather than introduce a second independent spawning policy.

## Brigade and controller throughput

At tick 148163, brigade readiness has changed since the original baseline: activeCount remains zero, targetCount 16, readiness true, replacementMode full. The baseline report's earlier paused state is historical evidence, not the permanent current state. At tick 148213 the home spawn is still executing a remote carrier request. The code balances remote hauling recovery against brigade requests; the existing final authority and readiness rules must be traced before choosing an activation change.

At tick 148223, controller containers hold 1,800 and 1,300 energy (each capacity 2,000). The sole upgrader has four WORK, two CARRY and two MOVE, carrying 92 energy. These facts show usable supply already exists. Spawning relay transport alone cannot exceed the consumer's four-WORK unboosted ceiling. An acceleration proposal must specify affordable upgrade WORK and its replacement/retention contract as well as transport.

A complete current plan requires 16 tiny relay bodies, 2,400 energy and 144 spawn ticks before travel and overlap. Its additional replacement demand must be included in the shared budget. It must not indefinitely borrow protected home workers while a partially built line cannot deliver. The future carrier default remains documented separately.

## Questions pending before dependent work

1. Is the earlier no-code boundary lifted to prepare changes for review, or should this remain an assessment of existing controls?
2. Does the temporary push end at RCL 6, GCL 2, or another agreed condition?

No numerical consumption target, deployment artifact, reservation schedule or game-state mutation has been approved or executed by this assessment. The requests are recorded in SC-13 and SC-14; the authority review and comparison remain completed analysis.
