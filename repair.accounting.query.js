'use strict';
// Read existing full captures; never connects to or changes the server.
const { readFileSync } = require('fs');
const { accountRepairs } = require('./repair.accounting');
if (require.main === module) {
  const [before, after] = process.argv.slice(2);
  if (!before || !after) throw Error('Usage: node repair.accounting.query.js BEFORE.json AFTER.json');
  console.log(JSON.stringify(accountRepairs(
    JSON.parse(readFileSync(before, 'utf8')),
    JSON.parse(readFileSync(after, 'utf8'))), null, 2));
}
