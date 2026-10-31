# ADR 0001: One policy authority

Status: accepted

## Context

Spawn assignment, remote surveys, brigade plans, construction queues, and
population control had each inferred independent targets. Fixing one incident
could therefore overcorrect another: a hard cap stopped runaway production but
also prevented composition recovery; an established brigade could outrank an
empty remote roster; survey desired counts could become protected minimums.

## Decision

`colony.policy.js` owns role targets, remote minimum/desired totals, economic
health, optional-work permissions, and budgets. `room.situation.js` is its sole
live observation adapter. Downstream modules count coverage, map demand to
targets, and execute actions; they do not recreate policy.

## Consequences

- Policy scenarios are pure and testable.
- Saved plans no longer authorize their own replacement or growth.
- Domain modules may still measure geometry and throughput, but those
  measurements enter the policy input.
- `main.js` must continue shedding embedded decision logic.
- A future multi-room governor must coordinate room policies rather than
  silently overriding room safety floors.
