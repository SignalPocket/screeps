# ADR 0006: CPU pressure sheds slow work first

Status: accepted

## Context

An exhausted CPU bucket can freeze all creeps. Drawing, corridor planning,
expansion scans, infrastructure placement, and aggregate metrics are useful but
can be deferred; harvesting, delivery, repair, controller work, and spawning
cannot.

## Decision

`cpu.policy.js` derives a global mode from the bucket. Below 1,000, `main.js`
continues survival execution but pauses slow planning, drawing, and dashboard
metrics. From 1,000 through 2,999 the mode remains observable as constrained,
without yet suppressing slow work. At 3,000 and above it is normal.

## Consequences

- CPU recovery has a deterministic, testable boundary.
- Deferred planners revalidate current policy and objects when they resume.
- The threshold is a first operational setting and still requires live bucket
  recovery observation.
