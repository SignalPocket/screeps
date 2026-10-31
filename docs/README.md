# Screeps colony documentation

This directory is the durable design record for the colony. Code comments
explain local mechanics; these documents explain ownership, contracts, and why
the system makes a decision.

## Read by layer

- High level: [Architecture](architecture.md) and
  [adaptive colony policy](specs/adaptive-colony-policy.md), plus the
  [multi-room colony coordinator specification](specs/colony-coordination.md).
- Middle level: [Subsystems and decision flow](subsystems.md),
  [RCL progression](specs/rcl-progression.md), and
  [memory and observability](memory-and-observability.md).
- Low level: [Module reference](module-reference.md) and the contract comments
  at the entry points of the core modules.
- Operations: [Testing and live verification](operations.md).
- Decisions: [Architecture decision records](decisions/README.md).

## Documentation rules

1. Document a policy change in the adaptive-policy spec and an ADR when it
   changes ownership, priority, or an invariant.
2. Update the module reference when a module is added, removed, or changes
   responsibility.
3. Keep current behavior and proposed behavior visibly separate.
4. Never claim live success from syntax or unit tests alone.
5. Prefer measured demand and normalized policy outputs over fixed headcounts.
