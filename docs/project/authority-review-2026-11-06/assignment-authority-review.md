# Assignment authority review

Stable key: screeps-assignment-authority-review-2026-11-06.
Reviewed November 6, 2026. Status: review complete; migration and repairs not implemented.

## Finding

The system has a final spawn gate and a useful durable-job reconciler, but it does not yet have one end-to-end assignment authority. Role identity, job retention, temporary borrowing, station reservations, and emergency missions are changed at different times by different owners. A valid earlier decision can be superseded without a shared decision record. This supports Katherine's concern about subsystems undoing work; it does not mean every fallback or module is wrong.

Evidence: current local source plus the previously captured live baseline, ticks 147291-147357. No new gameplay code or game-state writes were made. A static search found 123 candidate assignment-write lines across 17 modules; that is a search inventory, not 123 defects or an exhaustive AST analysis. See [write-site evidence](assignment-write-sites.md). Source hashes are retained with the raw review evidence outside the synchronized game directory.

## What happens in order

| Phase / source | Who can decide or change ownership | Trigger and fields | Protection / release / later override |
| --- | --- | --- | --- |
| Compatibility and startup, main.js:125, 251-269 | Legacy role migration; brigade birth identity; source reservations; creep.assignment.js | Reasserts role, preferredSource and assignmentRole before planning. | Source reservation and brigade identity can restore an older specialty next tick. Reconciler cleans incompatible fields; it does not authorize the role change or produce a full reason trail. |
| Builder roster, main.js:299-303; builder.roles.js; builder.roster.js:7-63 | Normalizes legacy builder names and retains remote builder slots. | Duplicate remote builders become local flexible builders; remote fields removed. | Based on survey target, not a common assignment transaction. Repair protection later in the same tick can reassert remote ownership. |
| Specialist intervention, main.js:617-620; role.capacity.js; repair.supply.js:41-50; outpost.rescue.js | Restores repair missions; hands off or removes excess upgraders; recruits emergency remote repair donors. | Bulk role/body/scope/slot mutations; often clears workJob and dispatchCommitment. | Separate rules, not the final spawn gate. Remote emergency recruitment does not inspect shared home safety floors; see finding A3. |
| Observation and target calculation, room.situation.js:303-358; colony.policy.js; labor.capacity.js:119-145; scenario.policy.js | Base policy -> bounded trend changes -> labor policy -> replacement capacity budget -> later scenario constraints in main.js. | Role min/desired/max, permissions, budgets and roomDecision. | These are successive transformations, not necessarily defects. Their precedence and exceptions must be explicit; the one-upgrader override is currently spread across layers. |
| Remote roster, main.js:1173-1201; remote.roster.js | Retains or moves existing carrier/miner slots, marks surplus, retires duplicate miners. | remoteRoom, remoteSlot/remoteHaulerSlot, overlap/surplus, role=retire. | Carrier loaded/in-transit handling and miner overlap rules provide real protection. A changed assignment requires checking delivery targets and later home dispatch. Outpost redesign remains deferred. |
| Source recovery and surplus reuse, main.js:1241-1379 | Selects home-source recovery, then fills authorized remote gaps from surplus. | Releases worker identities; promotes harvester/remote roles; binds source/remote slots. | Home sources get first access to this surplus pool. Protected-builder selection uses maxima here; later retirement retains desired counts. Different surplus definitions deserve one explicit contract. |
| Spawn planning, main.js:1405-1543; staffing.baseline.js; staffing.plan.js; spawn.authority.js; spawn.policy.js | Chooses one capability, final tier authorization, cap and charge timing, body and spawn call. | New creep identity, source/remote/builder assignment; spawnDecision. | This is a real boundary for spawning. It does not authorize later role changes, borrowing or local donor recruitment. A rejected request can still yield idle time rather than selecting another feasible request; SC-06 remains separate. |
| Home allocator, main.js:1805-2278; source.staffing.js:assignUnallocatedRoles | Protects selected specialists, fills upgraders/builders/repair crews, assigns source WORK, changes remaining roles. | role, preferredSource, reserves, builder mission, body type. | Uses assignedCreeps and source-recovery tick guards, so it does not arbitrarily rewrite every body. Nonetheless it is another identity writer after spawn selection. Some changes log prose but do not record a structured transition reason. |
| Surplus and retirement, main.js:2290-2425; population.control.js | Keeps desired builder capability, repurposes genuine gaps, retires remainder; reconciles incompatible fields again. | role/body type and retirement; workJob/source/builder fields cleared. | Bounded retirement is valuable. Coverage, source release and job invalidation should be one transition instead of separate cleanup conventions. |
| Group demand, main.js:2430-3300 | Assigns build/repair/upgrade and logistics lanes; plans stations, refill and salvage. | assignments, source/destination proposals, refill ownership, controller stations. | Has task/capacity reservations. Brigade geometry affects station candidates even when no real brigade is running. |
| Durable job selection, main.js:3325-3425; work.dispatch.js:21-129 | Retains useful workJob or accepts a proposal. | Lane, sourceId, targetId, priority, amount and timestamps. | Loaded destinations normally persist; cancelCurrent clears the job before that protection is evaluated. See A2. Object binding can occur later during execution, so not every job starts fully specified. |
| Substitute roster, main.js:3458-3503; controller.brigade.roster.js:177-245 | Borrows one ordinary carrier for an uncovered relay seat. | controllerRelaySubstituteSlot while keeping role and prior durable job. | Entry checks policy permission and a limited candidate filter. Existing keeper is retained until real arrival or invalid plan/home/slot; no shared expiry, live home-coverage check or membership revalidation against candidates. |
| Pickup allocator and execution, main.js:3652-3680, 4419-4480 and role queues | Grants exact pickup quantities; selects role/override action; binds job targets and commitments. | pickupReservation, workJob.targetId, dispatchCommitment, task/target. | Retire/standby/managed-pickup checks precede brigade execution; an eligible substitute marker then routes a nominal hauler into brigade tasks. Resource reservations constrain quantities, not role authority. |
| Blocked-work recovery, main.js:6727-6845; work.dispatch.js:recoverBlockedWork | Executes a permitted alternative and updates owned job plus saved demand evidence. | task, lane, target and reassignment record. | A useful bounded recovery mechanism, not automatically a defect. Review against the accepted specialty/override contract. Harvest recovery can remain without a durable workJob. |
| Defense, main.js:7019-7037; tower.control.js | Threat response and temporary defender retirement. | Combat movement/target; role=retire after threat clears. | Defender actions run after ordinary work to avoid overwrite. This explicit precedence is a model for other overrides; attack behavior remains outside this review's live evidence. |

## Findings that matter before implementation

### A1. Inactive brigade still owns space and can borrow a needed carrier

Confirmed in source: movement.service.js:34-42 builds a blocked right-of-way from the saved plan; lines 186-190 apply cost 255 for non-relay roles without an active/readiness check. controller.stations.js:39-57 likewise excludes saved plan seats and right-of-way. This is a real effect of a saved plan, distinct from replacement being paused.

main.js:3470-3499 accepts ordinary haulers/rebalancers among substitute candidates without requiring surplus above the home minimum. Keeping the original role means staffing can still count that carrier even while its task is controller-relay. The runtime branch is main.js:4471-4477. These paths use policy permission rather than the replacement-mode readiness decision.

Observed in the bounded baseline: real relays zero; replacement paused; one borrowed hauler at a time; substitute identity changes; no increase in recorded brigade intake, handoff or delivered totals while controller progress increases by 256. Those totals count successful scheduled actions, not independently resolved delivery; their zero change supports only no recorded brigade throughput in that window. It does not prove the full brigade could never work.

Static release gap: reconcileSubstitutes retains an existing keeper even if it would no longer qualify for the supplied candidate list. It has no explicit expiry or release on replacementMode='paused'. A real relay may never arrive when replacement remains paused. The assignment cleanup module does not clear this marker as part of ordinary non-relay role cleanup because preserving the original role is intentional. At baseline time the intended borrowing behavior was undecided. Katherine has since selected carrier supply as the default design; the proposed default therefore grants no brigade borrowing or tile ownership. That design choice has not changed the running behavior.

The offline route model found no increase in the shortest storage-to-buffer trip from applying the saved right-of-way in this geometry. Therefore, do not claim the reserved line caused all observed congestion. It still has unconditional authority over movement and available standing tiles.

### A2. Caller cancellation bypasses the documented loaded-delivery protection

work.dispatch.js:74-87 clears the retained job on proposal.cancelCurrent before checking priority-zero preemption. main.js:3380-3408 sets cancellation for changed refill targets, changed buffer targets, collection-source separation, blocked state and reserve-recovery conditions. The buffer cancellation condition checks for a different target ID, while its reason says the previous buffer became invalid; it does not establish that invalidity. The collection reason says 'changed rooms', while the predicate is range greater than two.

The narrower documented rule (retain a useful loaded destination except a priority-zero emergency) is not the whole executable rule. Some emergency cancellations may be correct, but ordinary target changes must not silently receive the same authority. Decide and record the exact permitted reasons; do not remove all cancellation blindly.

### A3. Remote emergency repair can independently recruit home workers

outpost.rescue.js:3-35 scans active surveys, targets containers below 25%, and recruits up to two eligible builders/workers/WORK-bearing haulers per remote room. It clears assignments and rewrites remote ownership directly. It does not consult current home minimum coverage, shared transition allowances or the room policy's remote-maintenance permission before recruiting. It also raises survey builder targets. Body/life checks and explicit emergency ownership are present; a unified safety-budget check is not.

repair.supply.js:41-50 later reasserts these missions while repair targets remain below 80%. builder.roster.js can demote duplicate outpost builders based on survey slots before protection restores them. That gives a concrete route for one roster rule to undo another; repeated oscillation is a risk identified in source, not established for every creep in the 66-tick baseline. This dependency matters even while outpost redesign is deferred.

### A4. Controller headcount and body improvement have competing owners

colony.policy.js:219-256 can request a second routine upgrader or emergency minimum. labor.capacity.js:119 and 143-145 normalizes the usual desired headcount to one while retaining a larger policy minimum when applicable. role.capacity.js:enforceSingleUpgrader demotes all but the strongest actual upgrader every tick, without reading that target or emergency minimum. Later allocation can select upgraders again. Therefore the duplicate-removal rule and policy are not one agreed authority.

The baseline labor plan requests 15 WORK worth of upgrade capacity, while the actual upgrader has four WORK and observed controller progress is about 3.88 per tick over the window. That is a target/capacity mismatch, not proof that extra upgrading is economically justified. The quality-relief planner returns immediately when desired===1 (role.capacity.js:4), so its quality-replacement branch does not resolve the normal single-upgrader mismatch. Ordinary life replacement still exists; this is not a claim the upgrader can never be replaced.

### A5. The relay line is outside the displayed sustainable replacement budget

spawn.capacity.js:getEntries includes policy roles and remote miners/haulers/builders. room.situation.js:341-356 supplies body times for those jobs, not controller-relay. population.control.js and main.js separately handle brigade population allowance. These mechanisms cap different things: a population allowance does not reserve spawn time.

The baseline published 1,200 planned replacement ticks per 1,500-tick lifetime, while a future 16-seat relay roster alone adds 144 spawn ticks before travel/overlap. Do not call that projected line funded within the displayed 80% replacement plan. Active brigade count was zero in the baseline, so this is a future planning omission, not a measured extra load already incurred then.

### A6. Specialty, current task and true capacity are conflated in diagnostics

A role can remain hauler while an override executes relay work; builder specialty can persist while fallback upgrades; a room total includes bodies traveling or spawning. These distinctions are legitimate if separately reported. They are misleading if the same role count is presented as available coverage. The useful durable mirrors in creep.assignment.js do not by themselves establish required/assigned/executing/blocked/borrowed coverage from one contract.

## Proposed authority contract for the next design decision

This is a recommendation, not an accepted migration or permission to edit code.

1. Room policy owns desired capability and energy/spawn/CPU budgets; transformations have a documented order and publish one version.
2. One staffing/assignment coordinator owns each creep's home, specialty, room and stable slot. Source, remote, builder and brigade planners propose changes; they do not independently commit them.
3. Every accepted transition records old/new owner, triggering evidence, reason, policy version, protection checks and expiry/release condition. A temporary override is separate from the durable specialty.
4. Work dispatch owns exact source/destination and current-load retention. Executors bind/execute only within the granted lane, or report an explicit failure. Blocked recovery returns a bounded proposal with an audit reason.
5. Coverage counts distinguish assigned, viable, available, executing, blocked, borrowed and replacement overlap. A borrowed carrier cannot count simultaneously as available core hauling.
6. A plan does not reserve tiles or workers until the coordinator grants an active commitment. Disabled/paused/recovering must have explicit and consistent effects on geometry, staffing, execution and release.

## Acceptance scenarios to specify before implementation

- Useful loaded delivery survives routine nearest-target changes; accepted emergency preemption records its actual reason.
- No real brigade plus paused replacement has the exact borrowed-worker and space-reservation behavior Katherine chooses.
- Remote repair cannot remove the last protected home capability, and its mission ends on a defined condition.
- Upgrader emergency/quality/lifetime replacement agrees with effective staffing and bounded overlap.
- Source replacement survives builder and generic allocation; released source surplus loses stale ownership once.
- A fully planned brigade appears in the same sustainable spawn budget as other capability.
- Each of the above survives repeated ticks and adjacent system interactions; a local isolated test is insufficient for live completion.

## Disposition

SC-03's review deliverable is complete. Authority consolidation, acceptance tests and any fixes remain unimplemented. Katherine selected carrier supply with current structures during SC-04. Next specify one bounded authority change that supports that direction, using controller-supply-design.md. Avoid making six separate point fixes from these findings.
