# ADR 0005: Auxiliary bodies use transition allowances

Status: accepted

## Context

Brigade, remote, expansion, and retiring bodies can remain alive after current
health withdraws replacement permission. Counting those bodies inside the core
worker cap can block a missing harvester, refiller, or upgrader from spawning.
Ignoring them entirely can instead authorize permanent growth.

## Decision

`population.control.js` adds a bounded auxiliary allowance to the policy-owned
worker cap. The allowance covers the larger of the approved or currently living
brigade roster, plus current over-budget remote bodies, expansion bodies, and
creeps already retiring. Current policy still decides every replacement.

## Consequences

- Living auxiliary bodies cannot deadlock core recovery.
- Withdrawing a permission stops replacement without requiring destructive
  immediate removal.
- Allowances must be derived from current bodies and current policy, never a
  fixed emergency number.
