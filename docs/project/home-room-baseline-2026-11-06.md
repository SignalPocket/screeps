# Home-room baseline: November 6, 2026

Stable key: screeps-W7N4-baseline-147291-147357.
Status: bounded live baseline captured; sustained stability and design decisions remain open.

## Evidence and preservation

Local server 127.0.0.1:21025; account ginaria; owned home room W7N4, RCL 5. The user started the server during this review. Initially only a November 1 saved database was available (tick 147132); it was captured before startup. Later HTTP status/time reads confirmed the server was running.

Collected 13 read-only server-storage snapshots from tick 147291 to 147357 (66 ticks), 2026-11-06T19:42:56.521Z through 2026-11-06T19:44:02.469Z. The configured localhost management interface was used exclusively for storage find/get queries. No console action was submitted to the colony, and no state write, configuration change, pause, restart, code upload or gameplay edit was performed by the assistant. The user's startup naturally resumed existing behavior.

Raw snapshots and derived summary: C:\Users\katie\.codex\automations\structured-ink\screeps-planning\live-2026-11-06T19-42-55-858Z.
Recovery details: [Preservation record](preservation-record.md).

All 142 server code modules matched local JavaScript after decoding database module names and normalizing line endings. Byte identity is not asserted. All 142 local JavaScript files matched their preserved SHA-256 hashes after observation. HEAD remains only the committed portion of the larger preserved working tree.

## Observed results

| Measure | Start -> end / range | Interpretation |
| --- | --- | --- |
| Controller progress | 148,414 -> 148,670 (+256) | Actual controller object progressed during the window; continuity on every tick is not established. |
| Storage energy | 343,959 -> 345,720 (+1,761) | Storage increased overall; this alone does not establish balanced logistics. |
| CPU bucket | 6,915 -> 8,140 | Recovery continued during this window. Memory reports normal mode and no deferred creeps in sampled execution records. |
| Spawn/extension fill | 58.3% to 100.0% | Refill varies around spawning; no starvation conclusion from a minimum snapshot alone. |
| Population | 47 -> 48 owned creep objects across rooms | Includes spawning and remote bodies; do not confuse with home-room occupancy or viable capability coverage. |
| Policy | Strained, construction, with traffic-congestion scenario | Policy classification; distinct from large reserves and a high dashboard score. |

Observed spawn completion transitions include remote miner 04-OM-S1-147295, followed by builder 02-BU-M1-147313, followed by 04-BU-M1-147340. The snapshots cover complete spawn lifecycles for the first two: their spawn object entries end and the same named creeps subsequently have completed bodies in room objects. Birth does not prove successful remote mission execution.

## Concrete interactions to investigate

1. **Brigade substitution despite paused replacement.** Sampled readiness records show zero real relays, saved target 16 and paused replacement. Policy nevertheless permits controllerBrigade, and substitute records assign local haulers to slot 0. Early samples name 01-LC-145765; later samples name 01-LC-147217. This is observed inconsistent activation vocabulary, not yet a decided defect. Katherine explicitly chose to leave the intended borrowing rule undecided until controller supply designs are compared.
2. **Outposts materially affect home decisions.** Three remote rooms remain in the policy. Remote miner and builder replacement requests use the home spawn during observation. Home-first project scope has not disabled existing outposts. Compare this load before any outpost retention/redesign decision.
3. **Congestion persists despite recovery.** Traffic-congestion remains in sampled scenarios. The current operational counter window contains stuck ticks and assignment/delivery warnings. These are software diagnostics, not independent proof of a particular bad route; counters cover a wider window than these samples. Identify affected creeps before selecting a repair.
4. **Several controller supply paths coexist.** The controller progresses while no real brigade relays exist. Links, containers, carriers and substitutes coexist; these snapshots do not attribute every delivered unit to a route. Trace actual supply before retaining or removing a mechanism.

## Layout facts

Storage is at (26,27); controller at (39,12); controller-side link at (36,9); other link at (3,38); spawn at (11,37). Controller-area containers are at (37,10) and (37,14). Storage is 15 tiles from the controller by Chebyshev distance and 18 from the controller-side link, before path obstacles. Those are coordinate distances, not measured walking routes. The room has 30 extensions, two towers, two sources and five containers. Snapshot geometry and construction sites are retained in raw evidence.

Katherine's proposal to consider storage near the controller/link remains an option. Compare early flexible/container supply, storage-era supply, and later links together, preserving a viable controller route through each transition. No structure movement or removal is authorized by this baseline.

## Limits and next work

Snapshots were sampled roughly every five seconds and use non-atomic parallel reads. Individual components and memory timestamps can differ by a tick; some planning records are older. Sixty-six ticks do not establish sustained economic health, a complete creep lifetime, remote profitability, defense under attack, or all assignments remaining stable.

The baseline exists; numerical acceptance thresholds remain to be agreed after analysis. Next: inventory home assignment writers (SC-03) and compare staged controller supply designs (SC-04), using this evidence. Do not patch the substitute behavior before resolving its intended rule.

Expansion clarification: the game requires GCL capacity for another owned room; GCL 2 permits a second room. The existing RCL 7 expansion gate is our code's policy, not a game-wide requirement. Source: https://docs.screeps.com/control.html. No expansion decision was made.
