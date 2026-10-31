# RCL progression specification

`room.stages.js` is canonical. This document explains how stage intent affects
choices; it does not duplicate every constant.

| RCL | Stage | Primary objective | Optional work rule |
| --- | --- | --- | --- |
| 0 | unclaimed | claim and establish spawn | support only after ownership/reservation |
| 1 | bootstrap | continuous harvest, spawn, controller | flexible survival bodies only |
| 2 | energy network | containers, extensions, refill lane | roads follow energy structures |
| 3 | logistics | separate mining, hauling, refill, work | builders follow real demand |
| 4 | reserves | storage and durable reserve | upgrading scales from surplus |
| 5 | automation | links, mature roads, controller supply | remote growth and brigade require health |
| 6 | industry | terminal, labs, minerals | protect reserve before industry |
| 7 | expansion | establish another room | home floors remain protected |
| 8 | mature | resilient production and support | measured demand replaces fixed counts |

## RCL 5 decisions

- Build links before new extensions when both are pending.
- The link network moves energy from the spawn/storage side toward the
  controller side.
- The controller brigade is a stage capability, not a survival role. It needs
  an RCL-appropriate plan, healthy policy permission, and complete essential
  staffing before replacement.
- Existing brigade creeps may finish useful work during a downturn, but the
  existence of their saved plan does not grant spawn priority.
- Complete and maintain core road access before growing remote hauling toward
  full measured throughput.
- Established productive outposts retain a minimum income floor during a
  strained period.
- Construction remains divided: links outrank extensions; maintained roads and
  source/controller infrastructure are valid repair targets; decorative or
  abandoned infrastructure is not.

## Progression versus health

RCL unlocks capability. Health grants budget. A high RCL room in recovery must
regress its optional workload without pretending it lost the capability. When
health recovers, the same saved stage plans may resume through current policy.
