# ADR 0002: Safety floors and optional work

Status: accepted

## Context

A single target cannot distinguish survival from sustainable throughput.
Urgent flags also became accidental cap bypasses, causing large populations and
rapid reserve loss.

## Decision

Every job uses `min`, `desired`, and `max`.

- `min` is protected viable coverage.
- `desired` is the current sustainable target.
- `max` is a surge ceiling.

Health and RCL permissions control optional work. `forceSpawn` affects waiting
for body energy but never population authorization. Replacement-life rules
remove dying creeps from coverage early enough to replace them without raising
the target.

## Consequences

- A strained RCL 5 room can keep one carrier per active remote room while
  postponing a seven-carrier desired roster.
- Construction and brigade work contract automatically in recovery.
- Composition gaps must be solved through minimum coverage and retirement,
  not an unlimited emergency exception.
