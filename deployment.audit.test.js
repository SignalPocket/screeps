'use strict';
const assert = require('assert');
const { auditDeployment } = require('./deployment.audit');
const selection = { user: 'colony', branch: 'default' };
const record = (user, branch, modules) => ({ user, branch, modules });
const database = records => ({ collections: [
  { name: 'users.code', data: records },
  { name: 'env', data: [{ data: { gameTime: 42 } }] }
] });
const local = { main: 'loop();\n', 'movement.service': 'move();\r\n' };
const good = record('colony', 'default', {
  main: 'loop();\r\n', 'movement$DOT$service': 'move();\n'
});
const inspect = records => auditDeployment(database(records), local, selection);
// Matching another account or branch must not conceal this colony's stale upload.
const stale = record('colony', 'default', { ...good.modules,
  'movement$DOT$service': 'oldMove();\n' });
const report = inspect([record('other', 'default', good.modules),
  record('colony', 'development', good.modules), stale]);
assert.strictEqual(report.status, 'mismatch');
assert.strictEqual(report.tick, 42);
assert.strictEqual(report.executed, 'unverified');
assert.deepStrictEqual(report.modules.map(m => [m.name, m.status]),
  [['main', 'match'], ['movement.service', 'different']]);
assert.notStrictEqual(report.modules[1].localHash, report.modules[1].uploadedHash);
assert.strictEqual(inspect([good]).status, 'match');
assert.strictEqual(inspect([good]).executed, 'unverified');
assert.strictEqual(inspect([good, good]).status, 'ambiguous-code');
assert.strictEqual(inspect([record('other', 'default', good.modules)]).status, 'missing-code');
assert.strictEqual(inspect([record('colony', 'other', good.modules)]).status, 'missing-code');
assert.strictEqual(inspect([]).status, 'missing-code');
assert.strictEqual(inspect([record('colony', 'default', { main: local.main })])
  .modules[1].status, 'missing-upload');
assert.strictEqual(inspect([record('colony', 'default', { main: 123 })])
  .modules[0].status, 'missing-upload');
assert.strictEqual(auditDeployment(database([good]), { main: null }, selection)
  .modules[0].status, 'invalid-local');
assert.strictEqual(auditDeployment(database([good]), {}, selection).status, 'no-modules');
assert.strictEqual(auditDeployment({ collections: [
  { name: 'users.code', data: [good] }
] }, local, selection).tick, null);
assert.throws(() => auditDeployment(database([good]), local, {}), /Explicit/);
// Ignore only transport line endings, never meaningful whitespace or code changes.
assert.strictEqual(inspect([record('colony', 'default', {
  ...good.modules, main: 'loop(); \n'
})]).status, 'mismatch');
assert.strictEqual(inspect([record('colony', 'default', {
  ...good.modules, 'movement$DOT$service': 'move();'
})]).status, 'mismatch');
const before = JSON.stringify({ good, local });
inspect([good]);
assert.strictEqual(JSON.stringify({ good, local }), before);
assert.ok(!JSON.stringify(report).includes('oldMove()'));
console.log('deployment audit tests passed');
