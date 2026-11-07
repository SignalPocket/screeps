'use strict';

// node replacement.query.js DATABASE USER [TICK_MATCHED_EVIDENCE]
// Prints read-only scenarios; redirect output to preserve a diagnostic snapshot.
if (require.main === module) {
  try {
    const fs = require('fs');
    const { captureReplacements } = require('./replacement.arrival');
    const [, , database, user, evidence] = process.argv;
    if (!database || !user) throw Error('Usage: node replacement.query.js DATABASE USER [TICK_MATCHED_EVIDENCE]');
    const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
    console.log(JSON.stringify(captureReplacements(read(database), user,
      evidence ? read(evidence) : null), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
