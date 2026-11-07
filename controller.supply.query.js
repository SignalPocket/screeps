'use strict';

// node controller.supply.query.js DATABASE USER [PREVIOUS_SNAPSHOT]
// Prints a compact snapshot and optional comparison; never writes the database.
const fs = require('fs');
const { captureSupply, compareSupply } = require('./controller.supply');
if (require.main === module) {
  try {
    const [, , database, user, previous] = process.argv;
    if (!database || !user) throw Error('Usage: node controller.supply.query.js DATABASE USER [PREVIOUS_SNAPSHOT]');
    const snapshot = captureSupply(JSON.parse(fs.readFileSync(database, 'utf8')), user);
    const result = { snapshot };
    if (previous) {
      const saved = JSON.parse(fs.readFileSync(previous, 'utf8'));
      result.comparison = compareSupply(saved.snapshot || saved, snapshot);
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
