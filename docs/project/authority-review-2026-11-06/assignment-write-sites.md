# Assignment write search evidence

Static search candidates, not an AST proof of every write. Includes direct assignments, memory aliases and bulk/dynamic writers; deletions, computed aliases and helper effects require the accompanying manual authority review. Tests and CLI utilities excluded.

| Source | Kind | Statement |
| --- | --- | --- |
| body.archetypes.js:67 | direct | creep.memory.bodyType = bodyType; |
| builder.roles.js:9 | direct | memory.role = 'builder'; |
| builder.roles.js:11 | direct | memory.role = 'builder'; |
| builder.roles.js:12 | direct | memory.builderScope = 'local'; |
| builder.roles.js:13 | direct | memory.builderMission = 'repair'; |
| builder.roles.js:15 | direct | memory.role = 'builder'; |
| builder.roles.js:16 | direct | memory.builderScope = 'local'; |
| builder.roles.js:17 | direct | memory.builderMission = 'tunnel'; |
| builder.roles.js:20 | direct | memory.role = 'builder'; |
| builder.roles.js:21 | direct | memory.builderScope = 'outpost'; |
| builder.roles.js:22 | direct | memory.builderMission = 'maintenance'; |
| builder.roles.js:24 | direct | memory.role = 'builder'; |
| builder.roles.js:25 | direct | memory.builderScope = 'expansion'; |
| builder.roles.js:26 | direct | memory.builderMission = 'bootstrap'; |
| builder.roles.js:28 | direct | if (!memory.builderScope) memory.builderScope = 'local'; |
| builder.roles.js:29 | direct | if (!memory.builderMission) memory.builderMission = 'build'; |
| builder.roster.js:48 | direct | creep.memory.builderScope = 'local'; |
| builder.roster.js:49 | direct | creep.memory.builderMission = 'flexible'; |
| builder.roster.js:50 | direct | creep.memory.assignmentBuilderMission = 'flexible'; |
| controller.brigade.roster.js:103 | direct | creep.memory.role = 'hauler'; |
| controller.brigade.roster.js:141 | direct | replacement.memory.controllerRelaySlot = hole.slot; |
| controller.brigade.roster.js:238 | direct | candidate.memory.controllerRelaySubstituteSlot = slot; |
| controller.stations.js:90 | direct | upgrader.memory.controllerStation = { |
| creep.assignment.js:64 | direct | memory.builderMission = memory.assignmentBuilderMission; |
| creep.assignment.js:81 | direct | memory.assignmentRole = role; |
| labor.capacity.js:175 | direct | creep.memory.bodyType='controller';return true; |
| main.js:126 | direct | creep.memory.role = 'remote-miner'; |
| main.js:129 | direct | creep.memory.assignmentRole = 'remote-miner'; |
| main.js:256 | direct | creep.memory.role = CONTROLLER_BRIGADE_ROLE; |
| main.js:265 | direct | creep.memory.role = 'harvester'; |
| main.js:266 | direct | creep.memory.preferredSource = creep.memory.sourceReserve; |
| main.js:1135 | direct | creep.memory.role = 'hauler'; |
| main.js:1282 | direct | worker.memory.role = 'worker'; |
| main.js:1295 | direct | worker.memory.role = 'harvester'; |
| main.js:1296 | direct | worker.memory.preferredSource = sourcePlan.source.id; |
| main.js:1301 | direct | worker.memory.role = 'harvester'; |
| main.js:1302 | direct | worker.memory.preferredSource = sourcePlan.source.id; |
| main.js:1303 | direct | worker.memory.sourceReplacement = sourcePlan.source.id; |
| main.js:1304 | direct | worker.memory.sourceReserve = sourcePlan.source.id; |
| main.js:1345 | direct | worker.memory.remoteHome = room.name; |
| main.js:1346 | direct | worker.memory.remoteRoom = entry.survey.targetRoom; |
| main.js:1354 | direct | worker.memory.role = 'remote-hauler'; |
| main.js:1355 | direct | worker.memory.bodyType = BODY_TYPES.HAULER; |
| main.js:1356 | direct | worker.memory.remoteHaulerSlot = assignment.slot; |
| main.js:1362 | direct | worker.memory.role = 'remote-miner'; |
| main.js:1363 | direct | worker.memory.remoteSlot = assignment.need.slot; |
| main.js:1369 | direct | worker.memory.role = 'builder'; |
| main.js:1370 | direct | worker.memory.builderScope = 'outpost'; |
| main.js:1371 | direct | worker.memory.builderMission = 'maintenance'; |
| main.js:1372 | direct | worker.memory.remoteBuilderSlot = assignment.slot; |
| main.js:1415 | direct | worker.memory.role = 'harvester'; |
| main.js:1416 | direct | worker.memory.preferredSource = worker.memory.minerSource &#124;&#124; |
| main.js:1810 | direct | creep.memory.role = 'harvester'; |
| main.js:1811 | direct | creep.memory.preferredSource = reservedSource; |
| main.js:1924 | direct | upgrader.memory.role = 'upgrader'; |
| main.js:1941 | direct | builder.memory.role = 'builder'; |
| main.js:1942 | direct | builder.memory.builderScope = 'local'; |
| main.js:1943 | direct | builder.memory.builderMission = 'build'; |
| main.js:1944 | direct | builder.memory.assignmentBuilderMission = 'build'; |
| main.js:1957 | direct | repairBuilder.memory.role = 'builder'; |
| main.js:1958 | direct | repairBuilder.memory.builderScope = 'local'; |
| main.js:1959 | direct | repairBuilder.memory.builderMission = 'repair'; |
| main.js:1960 | direct | repairBuilder.memory.assignmentBuilderMission = 'repair'; |
| main.js:1996 | direct | miner.memory.role = 'harvester'; |
| main.js:1997 | direct | miner.memory.preferredSource = entry.source.id; |
| main.js:2053 | direct | miner.memory.role = 'harvester'; |
| main.js:2054 | direct | miner.memory.preferredSource = entry.source.id; |
| main.js:2112 | direct | creep.memory.role = 'harvester'; |
| main.js:2113 | direct | creep.memory.preferredSource = source.id; |
| main.js:2129 | direct | creep.memory.role = 'harvester'; |
| main.js:2130 | direct | creep.memory.preferredSource = source.id; |
| main.js:2147 | direct | creep.memory.role = 'worker'; |
| main.js:2181 | direct | creep.memory.role = 'upgrader'; |
| main.js:2199 | direct | creep.memory.preferredSource = creep.memory.minerSource; |
| main.js:2259 | direct | creep.memory.role = carryParts >= Math.max(2, workParts * 2) |
| main.js:2276 | direct | creep.memory.preferredSource = preferredSource; |
| main.js:2335 | direct | creep.memory.role = 'upgrader'; |
| main.js:2336 | direct | creep.memory.bodyType = BODY_TYPES.CONTROLLER; |
| main.js:2358 | direct | creep.memory.role = 'hauler'; |
| main.js:2359 | direct | creep.memory.bodyType = BODY_TYPES.HAULER; |
| main.js:2390 | direct | creep.memory.staffingRetire = true; |
| main.js:2391 | direct | creep.memory.role = 'retire'; |
| main.js:2411 | direct | creep.memory.role = 'builder'; |
| main.js:2412 | direct | creep.memory.builderScope = 'local'; |
| main.js:2413 | direct | creep.memory.builderMission = 'flexible'; |
| main.js:3757 | direct | creep.memory.demandLane = demandLane &#124;&#124; 'none'; |
| main.js:3806 | direct | creep.memory.dispatchCommitment = { |
| main.js:4036 | bulk/dynamic | if (target) creep.memory[memoryKey] = target.id; |
| main.js:4913 | direct | creep.memory.role = 'builder'; |
| main.js:4914 | direct | creep.memory.builderScope = 'local'; |
| main.js:4915 | direct | creep.memory.builderMission = 'flexible'; |
| main.js:6614 | direct | creep.memory.role = 'harvester'; |
| main.js:6615 | direct | if (sourceId) creep.memory.preferredSource = sourceId; |
| main.js:6826 | direct | creep.memory.demandLane = recovery.lane; |
| main.js:7025 | direct | creep.memory.staffingRetire = true; |
| main.js:7026 | direct | creep.memory.role = 'retire'; |
| outpost.rescue.js:25 | bulk/dynamic | Object.assign(m,{role:'builder',bodyType:'worker',builderScope:'outpost',builderMission:'maintenance', |
| refill.management.js:110 | direct | creep.memory.role = 'hauler'; |
| remote.corridors.js:152 | bulk/dynamic | room.memory[config.memoryKey] = plan; |
| remote.roster.js:78 | direct | replacement.memory.remoteRoom = need.roomName; |
| remote.roster.js:79 | direct | replacement.memory.remoteHaulerSlot = need.slot; |
| remote.roster.js:159 | direct | replacement.memory.remoteRoom = need.roomName; |
| remote.roster.js:160 | direct | replacement.memory.remoteSlot = need.slot; |
| remote.roster.js:179 | direct | miner.memory.role = 'retire'; |
| remote.roster.js:180 | direct | miner.memory.staffingRetire = true; |
| repair.supply.js:48 | bulk/dynamic | Object.assign(c.memory,{role:'builder',bodyType:'worker',builderScope:'outpost',builderMission:'maintenance',assignmentBuilderMission:'maintenance',remoteHome:home.name,remoteRoom:room.name,remoteBuilderSlot:slot,remoteTeam:home.memory.southSurvey?.targetRoom===room.name?'south':home.memory.southwestSurvey?.targetRoom===room.name?'southwest':'left'}); |
| role.capacity.js:19 | bulk/dynamic | Object.assign(old.memory,{role:'builder',bodyType:'worker',builderScope:'local',builderMission:'flexible',assignmentBuilderMission:'flexible'}); |
| role.capacity.js:22 | direct | if(old&&old.memory.role==='upgrader'&&!isRoadMobile(old)){old.memory.role='retire';old.memory.staffingRetire=true;} |
| role.capacity.js:36 | bulk/dynamic | if(isRoadMobile(c))Object.assign(c.memory,{role:'builder',bodyType:'worker',builderScope:'local',builderMission:'flexible',assignmentBuilderMission:'flexible'}); |
| role.capacity.js:37 | bulk/dynamic | else Object.assign(c.memory,{role:'retire',staffingRetire:true}); |
| salvage.dispatch.js:25 | bulk/dynamic | pair.collector.memory[memoryKey] = pair.item.id; |
| source.staffing.js:166 | direct | creep.memory.role = 'harvester'; |
| source.staffing.js:170 | direct | creep.memory.role = 'harvester'; |
| source.staffing.js:174 | direct | creep.memory.role='builder'; |
| source.staffing.js:175 | direct | creep.memory.bodyType='worker'; |
| source.staffing.js:176 | direct | creep.memory.builderScope='local'; |
| source.staffing.js:177 | direct | creep.memory.builderMission='flexible'; |
| source.staffing.js:179 | direct | creep.memory.role = 'hauler'; |
| source.staffing.js:184 | direct | creep.memory.role = carryParts >= Math.max(2, workParts * 2) |
| source.staffing.js:192 | direct | creep.memory.builderScope = 'local'; |
| source.staffing.js:195 | direct | creep.memory.builderMission = 'flexible'; |
| source.staffing.js:199 | direct | creep.memory.role = 'hauler'; |
| work.dispatch.js:92 | direct | creep.memory.workJob = job; |
