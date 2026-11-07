# ADR 0003: RCL 5 energy automation

Status: accepted

## Context

RCL 5 unlocks links and makes controller-side delivery automation possible.
The controller brigade is useful, but its many relay bodies can consume spawn
time and energy if treated as an unconditional permanent roster.

## Decision

- Links precede extensions when both are pending at RCL 5.
- The link network is bidirectional. While spawn or extensions need energy,
  controller-side surplus moves to the spawn/extensions endpoint for the
  refill lane. Only after the spawn network is healthy may spawn-side surplus
  move toward a controller deficit.
- Every controller or extension link is placed exactly one tile from a
  container with the matching purpose. Existing legacy endpoints remain
  operational while draining, are removed only at zero energy, and are then
  rebuilt beside the container they serve.
- A rebalancer drains the controller link into controller containers below
  their health-aware 75% operating target. Upgraders may also withdraw from
  the controller link directly.
- While spawn or extensions need energy, the rebalancer draws only controller
  container surplus above a 25% reserve into the controller link. The link
  network then sends it to the extension endpoint.
- The brigade remains part of the RCL 5 design.
- A new brigade rollout requires a valid plan, RCL/health permission, and
  complete essential staffing readiness.
- An established stationary brigade is an atomic line. Once local mining has
  full protected coverage and at least one viable hauling, refilling, and
  controller worker remains, its missing relays may be replaced without
  waiting for construction or remote backlogs to clear. Critical repairs still
  pause replacement.
- The saved brigade plan persists through downturns but cannot bypass current
  policy.
- Remote growth waits for healthy core road access; established remote income
  retains its minimum floor.

## Consequences

The automation resumes when affordable instead of being deleted during a
downturn. Local income and controller safety recover before relay replacement;
construction and remote shortfalls do not permanently starve an already-built
energy line.
