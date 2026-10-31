# Multi-room colony coordination specification

Status: target specification; not yet implemented as a global allocator.

## Purpose

Per-room policy protects each owned room. A multi-room colony coordinator will
make only decisions that are genuinely shared: CPU allocation, cross-room
energy support, expansion sponsorship, and optional global work. It must not
become a second source of local staffing targets.

## Inputs

Each owned room publishes:

- RCL and stage;
- policy health, permissions, role/remote totals, and reserve thresholds;
- actual and viable population;
- stored energy and reserve ratio;
- controller risk and spawn availability;
- operational warning counters;
- support capacity and current external commitments.

## Colony health

The coordinator derives a colony state from the weakest safety-critical room
and aggregate capacity:

- `emergency`: any owned room risks controller loss or cannot sustain local
  source/spawn recovery.
- `recovery`: one or more rooms are below protected staffing or reserve floors.
- `balanced`: every room meets floors; some remain below desired.
- `growth`: every room meets floors and sponsor rooms meet healthy reserves.
- `surplus`: all rooms are stable with spare energy, spawn time, and CPU.

The colony state can reduce optional global work. It cannot lower a room's
local survival floor.

## Shared decisions

### Cross-room support

Support is permitted when the donor remains at or above its reserve floor and
the receiver has a concrete protected deficit. Transfers have an owner, amount,
destination, expiry, and completion evidence.

### Expansion

Expansion requires an available GCL slot, a viable target, colony `growth` or
`surplus`, and a sponsor room that remains healthy after reserving the bodies
and energy required to bootstrap the new room.

### CPU

Critical room control, spawning, and creep execution outrank visualization and
slow planning. When the bucket falls, reduce the frequency or depth of slow
planning; do not skip the survival loop.

### Global optional work

Market, industry, power, deep upgrading, and nonessential construction use
only residual budget after every room's protected floors and explicit support
commitments.

## Output contract

The future coordinator publishes permissions and commitments, for example:

```js
Memory.colonyPolicy = {
  updated: Game.time,
  health: 'balanced',
  permissions: {
    expansion: false,
    industry: false,
    crossRoomSupport: true
  },
  roomBudgets: {
    W7N4: { supportEnergy: 0, optionalSpawnTicks: 0 }
  },
  commitments: []
};
```

Room policy may consume a granted budget, but the coordinator never edits
individual role targets directly.

## Acceptance criteria

- A healthy donor cannot be drained below its reserve floor.
- A controller emergency in any owned room pauses new expansion.
- A recovering room can receive bounded help without causing another room to
  enter recovery.
- CPU pressure suppresses slow planners and drawing before survival behavior.
- Every cross-room commitment is visible, expires, and has one owner.
