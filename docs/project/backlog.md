# Stabilization backlog

Updated: November 6, 2026. All entries are planning records; none authorize gameplay edits or live delivery.
Order follows reliable, explainable home-room operation before growth.

| ID | Priority / status | Outcome and next action | Dependencies / acceptance evidence |
| --- | --- | --- | --- |
| SC-01 | P0 / complete | Preserved and verified 1,990 files, including Git history and untracked work. [Recovery record](preservation-record.md). | ZIP integrity and per-file SHA-256 readback passed; all 142 gameplay JavaScript hashes remained unchanged after observation. No commit or push. |
| SC-02 | P0 / baseline captured; thresholds pending | [Live home-room baseline](home-room-baseline-2026-11-06.md): 13 read-only snapshots, ticks 147291-147357, including two complete spawn cycles. | W7N4 RCL 5 confirmed; all 142 running modules match local source after line normalization. Bounded progress observed; sustained-stability thresholds remain to be agreed. |
| SC-03 | P0 / review complete; changes unimplemented | [Assignment authority review](authority-review-2026-11-06/assignment-authority-review.md) maps ordered writers, overrides and release gaps; 123 static candidate write sites across 17 modules. | Review identifies inactive brigade geometry/borrowing, job cancellation, emergency remote donor recruitment, controller target/enforcer conflict and omitted relay replacement budget. No consolidation implemented. |
| SC-04 | P0 / comparison complete; direction selected | [Supply comparison](authority-review-2026-11-06/controller-supply-comparison.md) covers early RCLs, present layout and migration costs. Katherine selected carrier supply with current structures as the default; [detailed design](authority-review-2026-11-06/controller-supply-design.md) prepared. | Thresholds, transition details and implementation remain open. Katherine subsequently requested an immediate brigade push as an operational exception; duration and code-change scope are being clarified. |
| SC-05 | P1 / observed; implementation unstarted | Brigade has independent replacement, borrowing and geometry controls; baseline recorded a substitute despite zero real relays and paused replacement. | Future carrier-default design excludes dormant brigade ownership. Immediate brigade request is separate and must receive an explicit funded activation/exit contract. |
| SC-06 | P1 / captured | Trace spawn idle/denial and body affordability through selection -> final authority -> population limit -> charge wait -> body -> spawn result. | SC-02/03. Acceptance: a selected authorized feasible minimum slot progresses; infeasibility has an explicit reason; replacement overlap remains bounded. Capture relevant cycle, not only a unit assertion. |
| SC-07 | P1 / captured | Review home energy destinations and source/refill/controller priority, including link reverse transfers and storage intake. | SC-02/04. Acceptance: one consistent route per retained load; reserves and refill remain supplied; measured delivery and controller progress continue without assignment oscillation. |
| SC-08 | P1 / captured | Audit placement, retirement and migration before any layout change. | SC-02/04. Acceptance: map existing structures/sites/flags and automatic removal paths; propose a safe staged transition with rollback limits and explicit action approval where required. |
| SC-09 | P1 / captured | Verify CPU shedding and fair resumption against home survival and stale planning. | SC-02. Acceptance: sustained completed ticks, survival roles serviced, optional work deferred/resumed as designed; record CPU/bucket trend and adjacent functional behavior. Existing tests passing is insufficient. |
| SC-10 | P1 / captured | Reconcile documentation claims with code and dated verification evidence. | SC-03 and each completed repair. Acceptance: intended, implemented, locally tested and live-observed remain distinct; update existing specs/ADRs rather than create competing policy documents. |
| SC-11 | P2 / deferred | Reconsider outposts after home stability, including budget and assignment effects already mapped. | Home phase acceptance. Decide retain/reduce/redesign from measured income and burden; no current outpost shutdown implied. |
| SC-12 | P3 / deferred | Expansion, global coordination, industry and late-RCL systems. | Home stability and separate scope decision. Specification presence does not imply implementation or priority. |

## New immediate requests: November 6

| ID | Status | Requested outcome | Decision / evidence needed |
| --- | --- | --- | --- |
| SC-13 | Needs clarification; no action taken | Run a brigade to accelerate the home controller for now. | Clarify whether the no-code boundary is lifted for review preparation and whether the exit is RCL 6, GCL 2, or another agreed endpoint. Preserve future carrier-default decision separately. |
| SC-14 | Captured; no action taken | Reserve the existing outpost rooms. | Active survey targets are W8N4, W7N3 and W8N3; saved server state at tick 148163 shows neutral, unreserved controllers. Runtime search found no reserveController executor. Define reservation-body/replacement budgets and home safety before code or delivery. |

## Current work

This documentation baseline is complete when the brief, map, backlog and review record are saved, linked, and read back. Implementation WIP: zero. SC-01 is verified complete and SC-02 has a bounded live baseline. Numerical stability thresholds remain open. SC-03 review and SC-04 comparison are complete; carrier supply with current structures is the selected default design, with no implementation. New immediate requests are SC-13 (brigade push) and SC-14 (outpost reservation); code-change scope and brigade endpoint are pending clarification.

## Questions to resolve through the next review

- Resolved November 6: W7N4, RCL 5; live ticks 147291-147357. All 142 server modules match local source after line normalization. Future work must recheck version drift.
- What numerical reserve, CPU, controller and assignment-stability thresholds fit the measured room? Agree after observation.
- Should existing geometry be preserved unless a measured benefit justifies relocation, or should a larger layout redesign be considered? Ask before choosing a migration design.
- Resolved: Katherine selected carrier supply with current structures as the default design. A later request asks for a brigade push for now; keep its operational exception and stopping condition explicit.

## Implementation item template

ID and desired visible outcome; source version and reproduction; first incorrect layer; affected modules/state/override rules; decisions needed; bounded change; local scenarios; adjacent invariants; live tick/cycle evidence; delivery approval; rollback; final status and unresolved gaps.

Record a changed decision in the existing decisions directory when it changes ownership, priority or an invariant. Append dated evidence here or link a review record; never mark an item complete solely because code was saved.
