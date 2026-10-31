# Memory and observability

Memory is both runtime state and the audit surface. Fields listed here are
contracts; ephemeral helper fields should still be documented near their code.

## Room policy records

- `room.memory.populationPolicy`: current mode, role targets, remote targets,
  and totals published by `room.situation.js`.
- `room.memory.workerLimitsPlan`: short-lived cached total population budget.
- `room.memory.bodyRosterPlan`: body-family counts, viability, targets, and
  next shortage.
- `room.memory.strategy`: earliest unmet progression gate.
- `room.memory.stagePlan`: declarative RCL stage snapshot.
- `room.memory.roomStatus`: explanatory status label, score, and reasons.
- `room.memory.roomTrendHistory`: sampled metrics, bounded adjustments, and
  recovery directive.
- `room.memory.operationalHealth`: current/previous behavioral windows and
  per-creep transition state.

## Spawn records

- `spawnWaitSince`, `spawnWaitRole`, `spawnWaitLimit`: charge-wait state for
  the selected assignment. Clear these when no worker is needed.
- `workerTarget`: desired policy population, not permission to exceed the cap.
- `populationRoutingVersion`: migration/debug marker for target logic.

## Remote records

- `leftSurvey`, `southSurvey`, `southwestSurvey`: active remote plans and
  measured miner/carrier/builder demand.
- `remoteHaulRoutes`: cached route lengths, body capacity, and target.
- carrier ownership: `remoteRoom`, `remoteHaulerSlot`, `remoteTeam`, and
  `remoteRosterSurplus`.
- temporary dispatch does not replace roster ownership.

## Infrastructure records

- `extensionCluster`, `extensionOverflowCluster`: extension anchors.
- `linkNetworkPlan`, `linkNetworkStatus`: intended endpoint and live transfer.
- `controllerBrigadePlan`: physical pipeline only.
- `controllerBrigadeReadiness`: current policy/staffing blockers.
- `controllerBrigadeStats`: observed handoff performance.
- `travelPathPlan`, road heat/history, and corridor plans: route evidence.

## Creep identity and assignment

- `home`: owning room for population policy.
- `role`: current job identity.
- `birthRole`: original specialized identity; protects brigade and other
  dedicated bodies from generic reassignment.
- `bodyType`: capability family, separate from role.
- source, refill-cluster, remote-slot, builder-scope, and task-target fields
  establish ownership of a lane or object.
- `idleNow`, navigation-stuck state, and task/lane labels feed operational
  health; they are not population targets.

## Versioning rules

- Add a version when stored semantics change, not for cosmetic fields.
- Migrate or discard stale state explicitly.
- A saved plan is evidence, not authorization. Revalidate current objects,
  policy permission, and ownership before acting.
- After an interrupted or ambiguous action, inspect current memory/object
  state before repeating it.

## Health vocabulary

Three health views intentionally answer different questions:

- policy health: how much optional load can the room afford now?
- room status: what concise explanation should a human see?
- operational health: are assignments, movement, and deliveries behaving over
  a measurement window?

Do not use a dashboard label directly as a spawn target. If operational or
status evidence should change staffing, add a bounded adapter and a test.
