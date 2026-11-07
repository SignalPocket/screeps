'use strict';
// Read captured authoritative snapshots; never connect to or mutate the server.
const fs = require('fs');
const { analyzeTraffic } = require('./traffic.hotspots');
if (require.main === module) {
  const paths = process.argv.slice(2);
  if (!paths.length) throw Error('Supply captured snapshot JSON paths');
  console.log(JSON.stringify(analyzeTraffic(paths.map(path =>
    JSON.parse(fs.readFileSync(path, 'utf8')))), null, 2));
}
