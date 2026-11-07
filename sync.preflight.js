'use strict';

// Model the installed desktop client's 3000ms sync gates without starting sync.
// A checkpoint is transport metadata, never proof that code executed.
const inspectSync = ({ user, checkpoint, checkpointMtime, localMtime, remoteTimestamp }) => {
  const result = { status: 'invalid-evidence', watcher: 'unverified', executed: 'unverified' };
  if (!user || typeof checkpoint !== 'string' ||
      ![checkpointMtime, localMtime, remoteTimestamp].every(n =>
        Number.isSafeInteger(n) && n >= 0)) return result;
  if (!checkpointMtime) return { ...result, status: 'uninitialized',
    reason: 'Client initial sync may download remote scripts; preserve local files first' };
  const lines = checkpoint.trimEnd().split(/\r?\n/);
  if (lines.length !== 2 || !/^\d+$/.test(lines[0]) || !lines[1] ||
      !Number.isSafeInteger(Number(lines[0]))) return result;
  const localPending = localMtime > checkpointMtime + 3000;
  const identityChanged = lines[1] !== user;
  const remotePending = identityChanged || remoteTimestamp > Number(lines[0]) + 3000;
  return { ...result, status: localPending && remotePending ? 'conflict' :
    localPending ? 'local-pending' : remotePending ? 'remote-pending' : 'checkpoint-current',
  localPending, remotePending, identityChanged,
  reason: remotePending ? 'Client may offer to replace local scripts; preserve local files first' :
    'Checkpoint gates only; compare persisted module hashes separately' };
};

module.exports = { inspectSync };

if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const [databasePath, user] = process.argv.slice(2);
  try {
    if (!databasePath || !user) throw Error('Usage: node sync.preflight.js <db.json> <user>');
    const db = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
    const records = db.collections.find(c => c.name === 'users.code').data
      .filter(record => record.user === user);
    if (!records.length || new Set(records.map(r => r.branch)).size !== records.length ||
        records.some(r => !Number.isSafeInteger(r.timestamp))) throw Error('Ambiguous or missing user code');
    const world = path.dirname(__dirname);
    const marker = path.join(world, '.sync');
    let localMtime = 0;
    // The client sync checkpoint covers every local branch, not only default.
    for (const entry of fs.readdirSync(world, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const branch = path.join(world, entry.name);
      for (const file of fs.readdirSync(branch, { withFileTypes: true })) {
        if (file.isFile() && /\.(js|wasm)$/.test(file.name)) {
          localMtime = Math.max(localMtime, Math.trunc(fs.statSync(path.join(branch, file.name)).mtimeMs));
        }
      }
    }
    const exists = fs.existsSync(marker);
    const evidence = { user, checkpoint: exists ? fs.readFileSync(marker, 'utf8') : '',
      checkpointMtime: exists ? Math.trunc(fs.statSync(marker).mtimeMs) : 0,
      localMtime, remoteTimestamp: Math.max(...records.map(r => r.timestamp)) };
    const report = inspectSync(evidence);
    console.log(JSON.stringify({ ...report, checkpointMtime: evidence.checkpointMtime,
      localMtime, remoteTimestamp: evidence.remoteTimestamp }, null, 2));
    process.exitCode = report.status === 'checkpoint-current' ? 0 : 1;
  } catch (error) {
    console.error('Sync preflight failed: ' + error.message);
    process.exitCode = 2;
  }
}
