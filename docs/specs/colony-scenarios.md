# Colony operating scenarios

Status: accepted framework; core observation registry implemented; scenario
catalog remains extensible.

This playbook applies the four-job bootstrap roster defined in
`core-colony-jobs.md`:

1. one miner;
2. one upgrader;
3. one spawn filler;
4. one builder/fixer.

Each scenario identifies what happened, what the colony protects, what it
pauses, and when it may return to ordinary RCL- and health-scaled behavior.
Existing viable creeps are reassigned before a new body is requested. A spawn
request fills one authorized gap; it never raises the population target merely
because the situation is urgent.

The catalog below is a registry of known operating conditions, not an
exhaustive hard-coded enum. Runtime classification may report several active
scenarios at once. New scenarios may be added when they have observable
evidence, bounded staffing effects, explicit exit conditions, and tests. Once
the four baseline jobs exist, active scenarios combine with RCL, available
infrastructure, health, positions, and measured work to determine every
additional job.

## Five foundational playbooks

| Scenario | Immediate objective | First staffing decision | Optional work |
| --- | --- | --- | --- |
| Just starting out | establish renewable energy and ownership | fill the four bootstrap slots in order | paused until baseline exists |
| During attack | survive the active threat | preserve safe core coverage; towers and healing take priority | paused |
| After attack | heal, recover resources, and restore infrastructure | repair missing bootstrap slots before growth | resumes after safety and energy stabilize |
| Rebuilding after bad code | stop compounding the failure | reconcile living creeps into the four slots before spawning | frozen during audit and recovery |
| RC upgrade | adopt newly unlocked capability without destabilizing the room | preserve the four slots; add only measured stage demand | health-gated |

The detailed playbooks below cover these five high-risk transitions. The full
catalog also includes ordinary, logistical, remote, military, and advanced
economy conditions.

## Extensible scenario catalog

Scenario keys are stable reporting labels, not a closed switch statement. A
classifier emits evidence-backed scenario records. Policy composes their
effects by precedence and available capability instead of selecting one fixed
roster from a scenario name.

| Family | Scenario | Observable evidence | Policy effect | Exit evidence |
| --- | --- | --- | --- | --- |
| Foundation | Baseline gap | one of the four viable baseline capabilities is absent | dedicated baseline selector requests the first missing slot | all four slots viable |
| Foundation | Initial bootstrap | owned room has a spawn but no sustainable energy loop | flexible bodies, direct delivery, no optional growth | baseline covered and spawn reliably recharges |
| Foundation | Spawnless bootstrap | room is owned but has no operational spawn | sponsor claimer/pioneer/build supply from another room | spawn built and able to produce |
| Foundation | Replacement handoff | protected creep will expire before a replacement can arrive | bounded overlap for the exact slot | replacement owns and can reach the slot |
| Economy | Ordinary operation | no higher-precedence condition; queues and reserves are within bounds | measured minimum/desired staffing | replaced by stronger evidence |
| Economy | Spawn-energy lock | spawn cannot afford the smallest needed recovery body | redirect compatible carriers and harvesters to exact spawn targets | recovery body is affordable and refill flow persists |
| Economy | Refill deficit | spawn/extensions remain incomplete despite available energy | protect refill lanes; add only measured filler capacity | charge and refill latency recover |
| Economy | Source-buffer overflow | source containers, drops, or miners are blocked by undelivered energy | protect local hauling and exact pickup reservations | buffers drain at sustainable rate |
| Economy | Controller-supply deficit | downgrade risk or empty controller buffers despite available energy | protect controller delivery and one upgrader | downgrade margin and controller reserve recover |
| Economy | Storage imbalance | stores are too empty, too full, or energy is stranded in the wrong buffer | authorize bounded rebalancing between named stores | reserve bands and critical consumers recover |
| Economy | Surplus energy | safety, spawn charge, buffers, repairs, and reserves all exceed targets | permit extra upgrading or other health-gated work | any protected threshold falls |
| Infrastructure | Construction wave | newly authorized sites have measured remaining progress | bounded builders with distinct/shared target reservations | authorized queue clears or health contracts |
| Infrastructure | Critical repair | maintained structure is below its critical threshold | preempt optional building with bounded repair power | critical damage clears |
| Infrastructure | Access-road failure | a maintained road near a source, controller, spawn network, store, link, or tower is missing/decaying | restore service access before growth traffic | route is usable and maintenance backlog stabilizes |
| Infrastructure | Layout migration | saved plan and built layout differ but current flow still works | migrate incrementally; preserve the working path | replacement path is built and verified |
| Transition | RC upgrade | controller level changed or new limits became available | refresh stage inventory; add capability only through health gates | stage plan reconciled and new work bounded |
| Transition | Bad-code recovery | termination, runaway population, assignment churn, energy collapse, or widespread blockage | freeze optional systems and reconcile living capabilities first | multi-tick stability and correct assignments |
| Transition | CPU emergency | bucket or per-tick execution threatens the survival loop | run survival execution; defer 5/10/20-tick work and visuals | bucket and execution trend recover |
| Defense | Active attack | hostile combat body or hostile structure threatens an owned room | towers, retreat, defenders, and healing outrank optional work | hostile threat is gone; enter post-attack recovery |
| Defense | Wounded friendly | damaged friendly creep can reach available healing | tower or creep healing and safe movement override ordinary action | creep healed or no healing is safely available |
| Defense | Tower reserve deficit | active/recent threat with towers below protected energy | tower refill outranks ordinary spawn/extension refill as policy permits | tower reserve restored |
| Defense | Breach or siege | hostile damage threatens spawn, storage, controller access, or defensive perimeter | focus fire, heal, repair/rampart response, and evacuation decisions | breach closed and threat gone |
| Defense | Incoming nuke | nuke landing timer and blast footprint intersect protected assets | calculate rampart work and evacuation/supply plan | impact survived or assets deliberately abandoned |
| Recovery | Post-attack recovery | no hostiles, but wounds, salvage, drained towers, or damage remain | heal, refill towers, salvage, restore baseline and critical structures | recovery checklist clears |
| Recovery | Salvage opportunity | tombstone, ruin, or dropped resource can be collected safely | temporary exact pickup/delivery jobs for available logistics bodies | salvage exhausted or unsafe |
| Remote | Remote maintenance | established productive outpost has valid lanes | preserve measured minimum miners, carriers, reservation, and repair | plan retired or room unsafe beyond policy |
| Remote | Remote hauling recovery | established remote source is blocked by sustained carrier backlog | bounded carrier delta only | throughput and backlog recover |
| Remote | Remote threat | hostile or invader core blocks remote work | retreat/defend, retain ownership records, suspend unsafe traffic | threat clears and route is revalidated |
| Remote | Remote growth | candidate source lane is surveyed and home economy is healthy | add measured remote slots only when RCL/policy permit | lane reaches sustainable operation or is rejected |
| Expansion | Claim preparation | GCL slot, target, route, and sponsor budget exist | scout, reserve/claim, and stage exact bootstrap support | ownership result is known |
| Expansion | New-room bootstrap | owned room lacks a self-sustaining spawn/energy loop | sponsor pioneer, energy, and construction without weakening home floors | new room reaches its own baseline |
| Industry | Mineral extraction | RCL 6+, extractor/mineral access, terminal/storage space, and surplus budget | mineral miner plus measured haul lane | target stock or mineral exhaustion |
| Industry | Laboratory operation | RCL 6+, valid lab topology, inputs, outputs, and reserve budget | lab supply, reaction/boost, and cleanup jobs | batch completes or budget/gate closes |
| Industry | Terminal/market transfer | RCL 6+, terminal, transaction energy, and approved resource order | exact terminal load/unload and send intent | transfer confirmed or canceled |
| Industry | Factory production | RCL 7+, factory, components, output capacity, and surplus budget | factory supply, production, and output jobs | batch completes or a dependency fails |
| Mature | Observer scan | RCL 8 observer exists and scan schedule has a due target | observe one scheduled room; update intelligence cache | observation recorded |
| Mature | Power operation | power-bank mission or owned power spawn has a funded plan | combat/haul mission or power-spawn supply and processing | mission or processing batch completes |
| Mature | Nuker supply | RCL 8 nuker exists and an explicitly approved strategic plan needs it | supply energy/ghodium without crossing reserve floors | requested stock reached or plan canceled |

### Scenario record contract

Every emitted scenario record contains:

```text
key | family | priority | evidence | firstSeen | lastSeen | exitEvidence
```

Its policy adapter may contribute permissions, prohibitions, reserve changes,
or job demand, but cannot spawn directly. A scenario that requires a structure
the room cannot yet build remains an observed condition with an unavailable
response; the planner must choose a lower-tech response rather than inventing
the structure.

`colony.scenarios.js` now publishes the first normalized observation set for
foundation gaps, attacks and post-attack recovery, CPU emergency, tower and
controller supply, refill and source-buffer pressure, critical repair,
construction, and ordinary operation. The active records are persisted in
room memory with stable `firstSeen` and refreshed `lastSeen` ticks. Scenario
records remain descriptive inputs and do not call spawn code.

`scenario.policy.js` is the executable adapter. It composes those records into
the room's shared prohibitions, protected capability floors, and bounded
desired work. `roomDecision` persists the resulting health, scenarios,
permissions, staffing, and spawn-capacity budget as one inspectable record.
Scenario records still never call spawn code directly.

## 1. Just starting out

### Trigger

The room has a spawn and owned controller but does not yet have one viable
creep in every bootstrap job.

### Staffing order

Select the first missing viable slot, exactly in this order:

1. **Miner:** harvests a specific source and can carry during bootstrap.
2. **Upgrader:** protects the owned controller.
3. **Spawn filler:** brings available energy to the spawn, then extensions.
4. **Builder/fixer:** builds initial infrastructure and repairs damage.

Do not spawn a second miner merely because the room has a second source until
the other three baseline jobs exist. Do not count a body by its label if it
lacks the parts, remaining life, or assignment required for that slot.

### Work rules

- The miner may deliver directly until containers and carriers exist.
- The upgrader may harvest only as a bounded survival fallback when no stored
  controller energy exists.
- The filler chooses the closest non-full spawn or extension from the shared
  refill list.
- The builder/fixer builds spawn-supporting containers and extensions first,
  then maintained roads and other authorized stage infrastructure.
- Remotes, brigade rollout, expansion, and construction surges remain off.

### Exit

All four jobs have viable assigned creeps, the spawn can recharge, and the
controller is not in downgrade danger. Ordinary policy may then add measured
source coverage, hauling, and stage work.

## 2. After an attack

### Trigger

No hostiles remain, but creeps are injured, towers or energy structures are
drained, hostile corpses or ruins contain resources, or maintained structures
are damaged.

### Recovery order

1. Towers heal injured friendly creeps before routine repairs.
2. Injured creeps move into effective tower range and suspend ordinary work.
3. Fillers restore tower energy before routine spawn/extension filling.
4. Available mobile carriers collect Invader tombstones, ruins, and dropped
   resources; non-energy resources return to storage.
5. Reconcile the four bootstrap jobs and fill the first genuinely missing
   slot in their normal order.
6. Assign the builder/fixer to critical maintained structures, then roads,
   containers, links, towers, spawn, and extension infrastructure that the
   colony still uses.
7. Resume ordinary spawn/extension refill and measured local production.

Post-battle salvage is temporary work, not a new permanent role. Protected
miners, the required upgrader, active fillers, and seated brigade relays remain
on their essential assignments unless the colony cannot otherwise recover the
resources safely.

### Paused work

New remotes, expansion, optional upgrading, brigade growth, and nonessential
construction remain paused while healing, tower energy, critical repair, or a
bootstrap gap remains.

### Exit

Hostiles remain absent, no creep needs tower healing, towers have their
protected reserve, critical maintained damage is cleared, salvage is exhausted
or assigned, and all four bootstrap slots are viable.

## 3. During an attack

### Trigger

At least one hostile creep is present in an owned room.

### Defense order

1. Towers attack the highest-priority hostile while they have energy.
2. Fillers deliver to incomplete towers ahead of spawn and extensions.
3. Injured friendly creeps stop ordinary work and move into tower healing
   range when a charged tower can help them.
4. Noncombat creeps avoid exposed work positions; durable assignments remain
   recorded so they can resume after the threat.
5. Keep one miner working only when its assigned position is safe enough to
   preserve energy production.
6. Keep the upgrader active only when controller downgrade safety requires it
   and the route is safe.
7. Spawn only a policy-authorized defender or a truly missing survival body;
   never respond by mass-producing generic workers.

Do not begin post-battle salvage while a hostile remains. Towers do not spend
energy on routine repairs during combat. Builder/fixer construction, remote
growth, optional controller work, and brigade growth pause.

### Exit

The hostile count reaches zero. The room enters **After an attack** rather than
jumping directly to healthy operation.

## 4. Rebuilding after a bad coding session

### Trigger

Evidence includes script termination, an exhausted CPU bucket, rapidly falling
energy, runaway population, many creeps sharing one target, assignment
flip-flopping, a badly miscomposed roster, or essential work with no executor.

### Stabilization order

1. Enter code-recovery mode and freeze optional population, remote growth,
   expansion, brigade growth, layout migration, visuals, and slow planning.
2. Read the live room and current assignments. Do not clear all Memory or
   destroy infrastructure to make the symptoms disappear.
3. Build one inventory of living creep capabilities, remaining life, current
   loads, valid assignments, room structures, sites, and energy stores.
4. Reconcile compatible living creeps into the four bootstrap slots in order:
   miner, upgrader, spawn filler, builder/fixer.
5. Preserve loaded deliveries and valid object ownership. Release duplicates
   and surplus from the mistaken role without creating permanent substitutes.
6. Request at most the first missing baseline body. Do not request a second
   body for the same gap while one is spawning or traveling to its handoff.
7. Restore source transport and spawn energy before optional construction,
   remotes, brigade capacity, or additional source throughput.
8. Keep survival execution every tick. Reuse cached room lists and defer work
   that can safely run on the 5-, 10-, or 20-tick schedules.

### Evidence required before declaring recovery

- the script runs across multiple live ticks without termination;
- CPU use and bucket trend are stable rather than observed once;
- population is no longer increasing without an authorized gap;
- every core creep has one durable job and exact object target;
- spawn energy and source buffers move in the expected direction;
- no construction or repair target has an unbounded crowd;
- optional systems resume one gate at a time.

Passing unit tests is necessary but does not prove this scenario recovered in
the live room.

## 5. RC upgrades

### Trigger

The owned Room Controller reaches a new level.

### Transition rules

1. Preserve the four bootstrap assignments. An RC upgrade never makes the
   miner, upgrader, filler, or builder/fixer temporarily optional.
2. Refresh the stage plan and structure limits once; do not make every creep
   rediscover the same structures independently.
3. Inventory completed structures and existing construction sites before
   placing anything. Never place a site on a completed counterpart.
4. Add newly unlocked work only when current colony health and reserve permit
   it. RCL unlocks capability; health grants budget.
5. Construct energy-flow infrastructure before capacity decoration: required
   containers and links, then extensions, then their service roads and other
   stage structures according to priority.
6. Increase staffing from measured work, transport, and physical positions.
   Do not add a fixed batch of workers simply because the level changed.
7. Keep the previous stage behavior operating until the replacement
   infrastructure is actually built and usable.

### Stage expectations

| RC level | Newly emphasized behavior |
| --- | --- |
| 1 | establish the four-job bootstrap roster with flexible small bodies |
| 2 | containers, extensions, and a stable refill lane |
| 3 | towers and separated mining, hauling, refill, build, and repair work |
| 4 | storage and reserve-aware logistics |
| 5 | links, mature roads, and health-gated controller brigade automation |
| 6 | preserve the RCL 5 economy; industry remains an implementation gap |
| 7 | health-gated expansion after home floors and core roads are secure |
| 8 | mature measured support; advanced systems remain separately specified |

### Exit

The stage plan reflects the new RC level, the four bootstrap jobs remain
covered, new construction is bounded and non-duplicated, and any new staffing
is justified by a measured policy target. The room then returns to its current
health mode rather than being assumed healthy solely because it leveled up.

## Scenario composition and precedence

Multiple scenarios remain visible at once. Their contributions compose under
these rules:

1. An active threat controls immediate safe execution and may pause exposed
   work without erasing durable ownership.
2. Code/CPU recovery constrains how much planning may execute but cannot skip
   the survival loop.
3. The dedicated baseline selector protects the first missing one-of-each slot
   before ordinary staffing demand.
4. Recovery and safety-floor scenarios may add bounded minimums.
5. RCL transition, growth, surplus, and industry may add work only when every
   stricter prohibition and health gate permits it.

Prohibitions win over optional permissions. Required responses from different
scenarios may coexist—for example, post-attack tower refill, salvage, and a
missing baseline upgrader—but each must own distinct slots and exact targets.
The staffing decision matrix defines the complete selection order.
