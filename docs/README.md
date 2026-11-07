# Screeps colony documentation

This directory is the durable design record for the colony. Code comments
explain local mechanics; these documents explain ownership, contracts, and why
the system makes a decision.

## Stabilization project

Start with the [project brief](project/project-brief.md),
[current system map](project/system-map.md), and
[prioritized backlog](project/backlog.md) before changing gameplay code.
The [November 6 review record](project/review-record.md) records the baseline,
confirmed priorities, passing local checks, and outstanding live evidence.

The [preservation record](project/preservation-record.md) identifies the verified recovery copy; the [live home-room baseline](project/home-room-baseline-2026-11-06.md) records ticks 147291-147357 and remaining uncertainties.

The [assignment authority review](project/authority-review-2026-11-06/assignment-authority-review.md), [controller supply comparison](project/authority-review-2026-11-06/controller-supply-comparison.md) and [selected carrier-default design](project/authority-review-2026-11-06/controller-supply-design.md) record the next planning layer. These are analysis and design records, not implemented behavior.

## Read by layer

- High level: [Architecture](architecture.md) and
  [adaptive colony policy](specs/adaptive-colony-policy.md), plus the
  [multi-room colony coordinator specification](specs/colony-coordination.md)
  and [assignment authority](specs/assignment-authority.md). The baseline
  roster is [core colony jobs](specs/core-colony-jobs.md), with
  the broader [job and capability catalog](specs/job-catalog.md), operational
  behavior in the [colony scenario playbook](specs/colony-scenarios.md), and
  their connection in the
  [staffing decision matrix](specs/staffing-decision-matrix.md).
- Runtime tour: [What happens during a tick](runtime-walkthrough.md). This is
  the best starting point when the room is visibly doing something surprising.
- Middle level: [Subsystems and decision flow](subsystems.md),
  [RCL progression](specs/rcl-progression.md), and
  [memory and observability](memory-and-observability.md).
- Low level: [Module reference](module-reference.md) and the contract comments
  at the entry points of the core modules.
- Operations: [Testing and live verification](operations.md).
- Audit: [Policy-to-code compliance map](compliance.md).
- Decisions: [Architecture decision records](decisions/README.md).

## Documentation rules

1. Document a policy change in the adaptive-policy spec and an ADR when it
   changes ownership, priority, or an invariant.
2. Update the module reference when a module is added, removed, or changes
   responsibility.
3. Keep current behavior and proposed behavior visibly separate.
4. Never claim live success from syntax or unit tests alone.
5. Prefer measured demand and normalized policy outputs over fixed headcounts.
6. Comments at a handoff must explain both sides: what fact was measured, what
   decision it authorizes, and what visible behavior should result.
