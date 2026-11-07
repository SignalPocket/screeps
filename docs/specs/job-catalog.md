# Colony job and capability catalog

Status: accepted taxonomy; implementation coverage varies by row.

This is the complete known job vocabulary for staffing design. It is not a
fixed roster. A **job** is an owned outcome with a lane or slot and exact
objects. A **body family** is a reusable part composition capable of jobs. An
**action** is one tick of execution. Scenario, RCL, infrastructure, health,
and measured demand decide which jobs exist now.

The invariant bootstrap jobs remain, in order: miner, upgrader, spawn filler,
and builder/fixer. Everything else is situational.

## Local survival and economy

| Job | Required capability | Durable ownership | Availability and demand |
| --- | --- | --- | --- |
| Miner | `WORK`; usually `MOVE`; bootstrap may need `CARRY` | source, station, local container/link | RCL 1+; one baseline miner, then measured WORK per source |
| Upgrader | `WORK+CARRY+MOVE` | controller, supply object, work position | RCL 1+; one baseline, more only for safety or surplus |
| Spawn filler | `CARRY+MOVE` | refill lane, load source, reserved spawn/extension target | RCL 1+; one baseline; scale by refill latency/areas |
| Builder/fixer | `WORK+CARRY+MOVE` | build/repair mission, energy source, exact target | RCL 1+; one baseline flexible slot |
| Local source hauler | `CARRY+MOVE` | source buffer pickup and named delivery sink | useful with separated mining; measured from throughput/distance |
| Store rebalancer | `CARRY+MOVE` | source store, target store, resource, desired band | when two or more buffers need balancing; commonly RCL 4+ |
| Controller supplier | `CARRY+MOVE` | controller supply source and buffer/link/container target | when upgrader supply is separated from refill logistics |
| Link attendant | `CARRY+MOVE` | adjacent container/link pair and direction | RCL 5+ with the relevant structures |
| Controller brigade relay | `CARRY+MOVE` | numbered relay seat and neighboring handoffs | RCL 5+, valid plan, health/readiness permission |
| Tower filler | `CARRY+MOVE` | tower reserve lane and exact tower | RCL 3+; may be a priority mission of a filler/hauler |
| Salvager | usually `CARRY+MOVE` | tombstone/ruin/drop and exact destination | temporary safe recovery job, never a permanent floor |

## Construction and maintenance

| Job | Required capability | Durable ownership | Availability and demand |
| --- | --- | --- | --- |
| Builder | `WORK+CARRY+MOVE` | authorized site and energy source | any RCL with a real site; bounded by remaining progress |
| Repairer | `WORK+CARRY+MOVE` | maintained structure and energy source | damage/backlog driven; critical repairs can preempt building |
| Road/tunnel builder | `WORK+CARRY+MOVE` | planned route segment/site | when an authorized route is feasible and budgeted |
| Rampart maintainer | `WORK+CARRY+MOVE` | defensive structure and target hit band | RCL 2+; defense/risk driven, not blanket maximum repair |
| Nuke-preparation repairer | high `WORK` throughput plus logistics support | impacted rampart and required-hit budget | only for an incoming-nuke plan |
| Dismantler | `WORK+MOVE`, often `TOUGH`/healing support | hostile or obsolete structure target | explicit military or approved deconstruction mission |

## Remote rooms and expansion

| Job | Required capability | Durable ownership | Availability and demand |
| --- | --- | --- | --- |
| Scout | `MOVE` | room/route observation slot | whenever intelligence is stale; no ownership claim implied |
| Reserver | `CLAIM+MOVE` | remote controller and reservation window | RCL/GCL-independent body ability; funded established remote plan |
| Claimer | `CLAIM+MOVE` | target controller and claim plan | available GCL slot and authorized expansion |
| Controller attacker | `CLAIM+MOVE` | hostile controller downgrade/reservation target | explicit military plan only |
| Remote miner | `WORK+MOVE`, sometimes `CARRY` | remote source and station | active remote source lane |
| Remote hauler | `CARRY+MOVE` | remote pickup, route slot, home sink | measured round-trip throughput |
| Remote builder/fixer | `WORK+CARRY+MOVE` | remote site/structure and supply source | active remote construction/maintenance demand |
| Pioneer/bootstrapper | `WORK+CARRY+MOVE` | new-room phase, source, and build/upgrade targets | claimed room without a self-sustaining baseline |
| Expansion supplier | `CARRY+MOVE` | sponsor source and new-room sink | bounded support while the new room cannot supply itself |

## Combat and healing

Combat jobs require a threat model and tactical target; hostile presence alone
does not authorize an unlimited combat population.

| Job | Required capability | Durable ownership | Availability and demand |
| --- | --- | --- | --- |
| Melee defender | `ATTACK+MOVE`, usually `TOUGH` | defended room/zone and hostile target | active threat or explicit standing defense budget |
| Ranged defender | `RANGED_ATTACK+MOVE`, often `HEAL`/`TOUGH` | engagement zone, target, range posture | kiting, mass attack, or ranged defense need |
| Healer | `HEAL+MOVE`, often `TOUGH` | patient/squad slot and retreat rule | wounded friendly or planned combat squad |
| Tank/blocker | `TOUGH+MOVE`, usually healing support | blocking tile/formation slot | siege or damage-soak plan; not ordinary traffic control |
| Escort | attack/ranged/heal capability appropriate to threat | protected creep/convoy and route | remote/expansion convoy has measured risk |
| Invader-core attacker | attack, ranged, dismantle, or heal mix | invader core and mission phase | blocked productive remote with feasible response |
| Siege attacker | `ATTACK` or `RANGED_ATTACK`, `MOVE`, support | hostile creep/structure objective | explicit offensive plan |
| Combat dismantler | `WORK+MOVE`, usually `TOUGH` and healer pairing | hostile barrier/structure | explicit breach plan |
| Squad healer | `HEAL+MOVE`, formation-compatible | squad member/formation seat | combat formation requires sustained healing |

## Industry, trade, and mature-room operations

| Job | Required capability | Durable ownership | Availability and demand |
| --- | --- | --- | --- |
| Mineral miner | `WORK+MOVE`, carry/haul support | extractor, mineral, station | RCL 6+, extractor, capacity, surplus budget |
| Mineral hauler | `CARRY+MOVE` | mineral pickup and terminal/storage sink | active extraction throughput |
| Lab technician | `CARRY+MOVE` | input/output lab, resource, amount, batch | RCL 6+, valid reaction/boost plan |
| Boost attendant | `CARRY+MOVE` | boost lab, mineral/energy load, recipient | funded boost request and compatible lab |
| Terminal courier | `CARRY+MOVE` | storage/terminal pair, resource, amount | RCL 6+, approved send/market order |
| Factory technician | `CARRY+MOVE` | factory input/output manifest | RCL 7+, funded production batch |
| Power-bank attacker | high attack/damage body with movement/support | power bank and damage schedule | scouted profitable mission |
| Power-bank healer | `HEAL+MOVE` | mission attacker(s) | power-bank combat mission |
| Power hauler | `CARRY+MOVE` | dropped power and destination | timed power-bank pickup or power logistics |
| Power-spawn attendant | `CARRY+MOVE` | power spawn energy/power inputs | RCL 8+, power processing budget |
| Nuker attendant | `CARRY+MOVE` | nuker energy/ghodium request | RCL 8+, explicitly authorized strategic plan |
| Observer operator | no creep body required | scheduled room observation target | RCL 8 observer; structure job, not population demand |

## Temporary execution overrides, not durable jobs

- Retreating from danger.
- Moving into tower or healer range.
- Yielding a traffic tile.
- Picking up adjacent safe salvage while already assigned to recovery.
- Temporarily covering an actually empty refill or brigade seat.
- Waiting for cooldown, regeneration, capacity, or a reserved target.

These actions preserve the creep's durable assignment unless policy records a
valid reassignment reason. Temporary work must not satisfy a missing permanent
slot or create a permanent substitute roster.

## Body families still needed

Current runtime families cover miner, hauler, controller, worker, field, and
claimer bodies. The taxonomy will need explicit combat families (melee,
ranged, healer, tank/dismantler) and may need industry-specialized sizing.
Adding the names to this catalog does not claim those factories or executors
exist.
