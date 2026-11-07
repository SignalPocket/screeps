'use strict';
const assert = require('assert');
const { inspectSync } = require('./sync.preflight');
const base = { user: 'colony', checkpoint: '10000\ncolony', checkpointMtime: 20000,
  localMtime: 23000, remoteTimestamp: 13000 };
const run = patch => inspectSync({ ...base, ...patch });
assert.strictEqual(run({}).status, 'checkpoint-current');
assert.strictEqual(run({ localMtime: 23001 }).status, 'local-pending');
assert.strictEqual(run({ remoteTimestamp: 13001 }).status, 'remote-pending');
assert.strictEqual(run({ localMtime: 23001, remoteTimestamp: 13001 }).status, 'conflict');
// Local comparison uses marker FILE time; remote comparison uses its CONTENT time.
assert.strictEqual(run({ localMtime: 15000 }).localPending, false);
assert.strictEqual(run({ remoteTimestamp: 20000 }).remotePending, true);
assert.strictEqual(run({ checkpoint: '10000\nother' }).identityChanged, true);
assert.strictEqual(run({ checkpoint: '10000\nother', localMtime: 23001 }).status, 'conflict');
assert.strictEqual(run({ checkpoint: '10000\r\ncolony\r\n' }).status, 'checkpoint-current');
assert.strictEqual(run({ checkpointMtime: 0, checkpoint: '' }).status, 'uninitialized');
for (const patch of [{ checkpoint: '' }, { checkpoint: 'bogus\ncolony' },
  { checkpoint: '10000\ncolony\nother' }, { checkpoint: '9007199254740992\ncolony' },
  { localMtime: NaN }, { localMtime: -1 }, { remoteTimestamp: null },
  { checkpointMtime: 1.5 }, { user: '' }]) {
  assert.strictEqual(run(patch).status, 'invalid-evidence', JSON.stringify(patch));
}
const before = JSON.stringify(base);
const report = inspectSync(base);
assert.strictEqual(JSON.stringify(base), before);
assert.strictEqual(report.watcher, 'unverified');
assert.strictEqual(report.executed, 'unverified');
assert.ok(!JSON.stringify(report).includes('colony'));
console.log('sync preflight tests passed');
