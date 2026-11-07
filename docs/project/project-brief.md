# Screeps stabilization project brief

Updated: November 6, 2026, 12:40 PM America/New_York.
Status: planning baseline; no gameplay changes authorized by this document.

## Purpose and confirmed direction

Make the home room reliable and explainable before pursuing growth. Katherine selected home room first, with outposts reconsidered afterward, and requested that the controller brigade be reassessed against simpler controller logistics. These are confirmed priorities, not assumptions.

Success means we can explain a creep's assignment, a spawn decision, and an energy destination through one traceable decision chain. A repair must survive interaction with adjacent systems, not just pass an isolated test.

## Scope

Active: home-room observation, staffing, spawning, source collection, refill, controller supply, defense, construction, movement, CPU scheduling, and their shared state. Map existing outpost effects on home population and energy as dependencies. Do not expand outpost behavior in this phase.

Deferred: outpost redesign, expansion, industry, market, later-RCL feature implementation, and broad module extraction without a demonstrated stability benefit. Deferral is a planning decision; existing runtime behavior has not been disabled.

Layout must work across progression. Katherine suggested locating storage near the link and room controller, then noted that this does not solve early levels. Evaluate that layout, early container/carrier supply, and the transition between them together. No layout, relocation, or brigade-removal decision has been made.

## Working agreement

Katherine owns goals, tradeoffs, and acceptance of changed behavior. The assistant maintains the map, backlog, evidence, and dependency analysis and asks about unresolved product choices before treating them as requirements.

Keep one implementation item active. New requests enter the backlog; discoveries that change authority or scope return to planning. Before editing, record the expected behavior, first incorrect decision layer, affected owners and overrides, acceptance scenarios, and rollback plan. Do not accumulate a chain of speculative fixes.

Statuses: captured; needs decision; ready; active; locally verified; live verification pending; complete; deferred; blocked. Complete requires the stated acceptance evidence. A recorded blocker is not completion.

## Gates

1. Establish a preserved working-tree baseline and read-only live baseline.
2. Reconcile authority and the home-room energy route; decide controller logistics by stage.
3. Select one bounded repair with neighboring regression checks.
4. Run local checks and observe the relevant live transition or spawn cycle.
5. Record the outcome and any remaining uncertainty before choosing the next item.

The source folder is Steam's synchronized script folder. Saving JavaScript can affect the colony. Prepare future gameplay edits in an isolated working copy with an explicit delivery plan. Publishing/pushing and live delivery require the applicable exact approval. This pass adds documentation only.

## Definition of stable: evidence still needed

Observe source coverage, refill continuity, controller progress, viable staffing, assignment changes, blocked work, energy reserve direction, and CPU bucket direction together. Agree numerical thresholds and observation duration after the baseline; do not invent them from a brief snapshot. Include at least one relevant replacement/spawn cycle for staffing work. A bounded [live baseline](home-room-baseline-2026-11-06.md) was collected later on November 6, covering 66 ticks and two completed spawn cycles. Sustained stability remains unverified.

## Entry points

- [System map](system-map.md): current code owners and interference points.
- [Backlog](backlog.md): sequence, acceptance criteria, dependencies, and questions.
- [Review record](review-record.md): exact source baseline and verification limits.
- Existing architecture/specifications remain in the parent documentation index. They describe intended contracts as well as implemented behavior; the map marks that distinction.

## November 6 authority review and subsequent priorities

The [authority review](authority-review-2026-11-06/assignment-authority-review.md) and [supply comparison](authority-review-2026-11-06/controller-supply-comparison.md) are complete. Katherine selected carriers with current structures as the default design; the [detailed contract](authority-review-2026-11-06/controller-supply-design.md) is prepared, with no implementation. She subsequently requested a brigade push for now and reservation of existing outposts. These are captured as immediate operational work requiring clarified code-change scope, a brigade stopping condition and budgeted execution. No gameplay change or reservation has been performed.
