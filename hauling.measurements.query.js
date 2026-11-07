'use strict';
// Local snapshot query; no game-loop import, database write or policy change.
const fs = require('fs');
const { auditHauling } = require('./hauling.measurements');
if (require.main === module) {
  const snapshot = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  console.log(JSON.stringify(auditHauling({ tick: snapshot.tick,
    rooms: snapshot.rooms || snapshot.memory?.rooms,
    creeps: snapshot.roles || [] }), null, 2));
}
