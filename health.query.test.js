'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const reporting = require('./health.reporting');
const diagnosticDatabase = require('./diagnostic.database');
const source = fs.readFileSync(path.join(__dirname, 'health.query.js'), 'utf8');

// Exercise the actual CLI without real credentials, disk writes or requests.
const run = ({ room, memories = {}, config, rawDatabase, missing = false } = {}) => {
  const output = [], errors = [], reads = [];
  const processStub = { argv: ['node', 'health.query.js', ...(room ? [room] : [])],
    env: { SCREEPS_DB: '/fixture/db.json' } };
  const disk = {
    existsSync: file => file.endsWith('screeps.local.json') ? config !== undefined : !missing,
    readFileSync: file => {
      reads.push(file);
      if (file.endsWith('screeps.local.json')) return config;
      assert.strictEqual(file, '/fixture/db.json');
      return rawDatabase === undefined ? JSON.stringify({ collections: [
        { name: 'unrelated', data: [] },
        { name: 'env', data: [{ data: memories }] }
      ] }) : rawDatabase;
    }
  };
  const transport = { get: () => { throw Error('Unexpected network request'); } };
  vm.runInNewContext(source, {
    __dirname, process: processStub, URL,
    console: { log: value => output.push(value), error: value => errors.push(value) },
    require: name => {
      if (name === 'fs') return disk;
      if (name === 'path') return path;
      if (name === 'http' || name === 'https') return transport;
      if (name === './health.reporting') return reporting;
      if (name === './diagnostic.database') return diagnosticDatabase;
      throw Error('Unexpected dependency ' + name);
    }
  });
  return { output, errors, reads, code: processStub.exitCode || 0 };
};
const history = { records: [{ tick: 1234, stored: 12000, population: 4, desired: 5 }] };
const memory = rooms => JSON.stringify({ rooms });
let result = run({ room: 'W8N3', memories: {
  'not-memory': memory({ W8N3: { roomTrendHistory: { records: [] } } }),
  'memory:broken': '{',
  'memory:nonstring': 42,
  'memory:other': memory({ W7N4: { roomTrendHistory: { records: [] } } }),
  'memory:selected': memory({ W8N3: { roomTrendHistory: history } })
} });
assert.strictEqual(result.code, 0);
assert.deepStrictEqual(result.errors, []);
assert.match(result.output[0], /^W8N3 health 1\/32 @1234/);
assert.deepStrictEqual(JSON.parse(result.output[1]), history);
assert.strictEqual(result.reads.length, 1);

result = run({ memories: { 'memory:user': memory({ W7N4: {
  roomTrendHistory: { records: [], maxRecords: 64 }
} }) } });
assert.strictEqual(result.code, 0);
assert.strictEqual(result.output[0], 'W7N4 health: no snapshots yet');
assert.strictEqual(JSON.parse(result.output[1]).maxRecords, 64);

for (const options of [{ missing: true }, {}, { rawDatabase: '{}' },
  { rawDatabase: '{' }, { memories: { 'memory:bad': '{' } }]) {
  result = run(options);
  assert.strictEqual(result.code, 2);
  assert.deepStrictEqual(result.output, []);
  assert.ok(result.errors.some(error => error.includes('No token found.')));
}
result = run({ config: '{' });
assert.strictEqual(result.code, 2);
assert.match(result.errors[0], /^Could not parse screeps.local.json:/);
assert.deepStrictEqual(result.output, []);
assert.strictEqual(result.reads.length, 1, 'invalid config stops database and network access');

console.log('local health query selection and failure scenarios passed');
