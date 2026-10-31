# ADR 0004: Verification requires live ticks

Status: accepted

## Context

Pure tests can prove rankings and bounds but cannot reproduce room visibility,
spawn duration, creep congestion, CPU exhaustion, or multi-tick assignment
churn.

## Decision

Every material runtime change requires:

1. `npm.cmd run check`;
2. `git diff --check`;
3. a focused review of the changed policy/ownership path;
4. multi-tick observation of the live colony when available.

The final report distinguishes locally tested, live-observed, and unverified
claims.

## Consequences

Tests remain fast and broad, while live claims carry explicit evidence and
limits. CPU-bucket exhaustion or lack of a full spawn cycle is reported as a
verification limit, not success.
