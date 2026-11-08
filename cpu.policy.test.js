'use strict';

const assert = require('assert');
const fs = require('fs');
const { deriveCpuPolicy } = require('./cpu.policy');

assert.deepStrictEqual(deriveCpuPolicy(undefined), {
  bucket: null, mode: 'normal', allowSlowPlanning: true,
  executionCpuRatio: 0.8, minimumExecutionCreeps: null,
  fairExecutionLimit: 1, fairExecutionInterval: 5,
  fairDeferralThreshold: 10
});
assert.strictEqual(deriveCpuPolicy(500).mode, 'recovery');
assert.strictEqual(deriveCpuPolicy(500).allowSlowPlanning, false);
assert.strictEqual(deriveCpuPolicy(500).executionCpuRatio, 0.65);
assert.strictEqual(deriveCpuPolicy(500).minimumExecutionCreeps, 8);
assert.strictEqual(deriveCpuPolicy(500).fairExecutionLimit, 0);
assert.strictEqual(deriveCpuPolicy(1000).mode, 'constrained');
assert.strictEqual(deriveCpuPolicy(1000).executionCpuRatio, 0.75);
assert.strictEqual(deriveCpuPolicy(1000).fairExecutionLimit, 1);
assert.strictEqual(deriveCpuPolicy(3000).mode, 'normal');
assert.strictEqual(deriveCpuPolicy(3000).executionCpuRatio, 0.8);
assert.strictEqual(deriveCpuPolicy(3000).fairExecutionInterval, 5);
assert.match(fs.readFileSync(require.resolve('./main'), 'utf8'),
  /'claimer', 'remote-reserver', 'defender', 'retire',\s+CONTROLLER_BRIGADE_ROLE/,
  'claimers and remote reservers remain in the CPU-protected execution set');
assert.match(fs.readFileSync(require.resolve('./main'), 'utf8'),
  /cpuPolicy\.mode === 'recovery' && Game\.cpu\.bucket < 250/,
  'an empty-bucket emergency yields before broad per-tick scans');
assert.match(fs.readFileSync(require.resolve('./main'), 'utf8'),
  /optionalReportingCpuAvailable\(\)/,
  'scheduled diagnostics respect the remaining normal-mode CPU reserve');

console.log('CPU policy scenarios passed');
