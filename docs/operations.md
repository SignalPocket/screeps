# Testing and live verification

## Local checks

Run:

```powershell
npm.cmd run check
git diff --check
```

`check.js` syntax-checks every JavaScript file, then runs every `*.test.js`
file. A new pure planner should have a focused test file and be automatically
included.

## Required policy scenarios

Tests should cover at least:

- relevant RCL below, at, and above the unlock;
- critical, recovering, strained, healthy, and surplus budgets;
- minimum versus desired behavior;
- replacement-life boundaries;
- missing/invalid saved memory;
- no-site, no-structure, and structure-plus-site geometry;
- active remote maintenance with growth disabled;
- population at, below, and above cap;
- repeated ticks so assignments do not churn.

## Live verification

Syntax and unit tests do not prove the running colony is healthy. Observe
multiple ticks long enough to include at least one assignment and, for spawn
changes, the relevant spawn cycle.

Record:

- tick range and room;
- policy health, mode, minimum, desired, and population;
- spawn assignment and wait state;
- local source coverage and high-energy/early-empty evidence;
- spawn/extension charge and stored reserve direction;
- remote roster coverage, backlog, and delivered-energy movement;
- construction/repair crews and target uniqueness;
- congestion, stuck counts, task flips, and CPU bucket direction.

## Success criteria

A change is live-verified only when the intended behavior occurs and adjacent
invariants remain intact. Examples:

- remote recovery: minimum lanes are restored without reopening desired growth
  while strained;
- brigade: relays replace only after readiness and health are true, and energy
  reaches the controller side;
- construction: links receive workers before extensions while other builders
  still cover required repair/build work;
- retirement: population declines without removing the last viable specialist;
- road maintenance: maintained roads near sources/controllers remain eligible
  and source access does not collapse.

## Failure handling

- Stop adding point fixes when the observed behavior contradicts the policy
  model. Trace observation -> policy -> staffing -> assignment -> execution.
- Do not repeat a placement or state mutation after an ambiguous result until
  the destination is inspected.
- Preserve logs that show the first wrong decision, not only the final stuck
  creep.
- If the CPU bucket is empty, reduce repeated planning/logging first; a frozen
  colony cannot validate functional behavior.

## Git delivery

Before publishing:

1. inspect `git status` and separate unrelated user work;
2. run both checks;
3. review the staged diff;
4. commit with a decision-oriented message;
5. verify the intended GitHub remote and branch;
6. push only after the final artifact and destination are approved;
7. verify remote HEAD matches the local commit.
