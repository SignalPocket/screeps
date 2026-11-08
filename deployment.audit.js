'use strict';

// Read-only evidence of persisted uploads. A match is not proof of execution.
const { createHash } = require('crypto');
const { getCollectionRows } = require('./diagnostic.database');
const fingerprint = source => createHash('sha256')
  .update(source.replace(/\r\n/g, '\n')).digest('hex');

const auditDeployment = (database, localModules, { user, branch }) => {
  if (!user || !branch) throw Error('Explicit user and branch are required');
  const candidates = getCollectionRows(database, 'users.code')
    .filter(record => record.user === user && record.branch === branch);
  // Never silently inspect another account or select the first duplicate.
  if (candidates.length !== 1) {
    return { status: candidates.length ? 'ambiguous-code' : 'missing-code',
      user, branch, candidates: candidates.length, executed: 'unverified' };
  }
  const tick = getCollectionRows(database, 'env')[0]?.data?.gameTime;
  const uploaded = candidates[0].modules || {};
  const modules = Object.keys(localModules).sort().map(name => {
    const local = localModules[name];
    const remote = uploaded[name.replace(/\./g, '$DOT$')];
    const localHash = typeof local === 'string' ? fingerprint(local) : null;
    const uploadedHash = typeof remote === 'string' ? fingerprint(remote) : null;
    return { name, status: !localHash ? 'invalid-local' : !uploadedHash
      ? 'missing-upload' : localHash === uploadedHash ? 'match' : 'different',
    localHash, uploadedHash };
  });
  return { status: !modules.length ? 'no-modules' :
    modules.every(module => module.status === 'match') ? 'match' : 'mismatch',
  user, branch, tick: Number.isSafeInteger(tick) ? tick : null,
  executed: 'unverified', modules };
};

module.exports = { auditDeployment };

if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const [databasePath, user, branch, ...names] = process.argv.slice(2);
  if (!databasePath || !user || !branch || !names.length ||
      names.some(name => !/^[a-zA-Z0-9_.-]+$/.test(name))) {
    console.error('Usage: node deployment.audit.js <db.json> <user> <branch> <module> ...');
    process.exitCode = 2;
  } else {
    try {
      const local = Object.fromEntries(names.map(name => [name,
        fs.readFileSync(path.join(__dirname, name + '.js'), 'utf8')]));
      const report = auditDeployment(JSON.parse(fs.readFileSync(databasePath, 'utf8')),
        local, { user, branch });
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.status === 'match' ? 0 : 1;
    } catch (error) {
      console.error('Deployment audit failed: ' + error.message);
      process.exitCode = 2;
    }
  }
}
