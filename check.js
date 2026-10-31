'use strict';

const { readdirSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');

const files = readdirSync(__dirname)
  .filter(file => file.endsWith('.js'))
  .sort();

const runNode = args => {
  const result = spawnSync(process.execPath, args, {
    cwd: __dirname,
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};

for (const file of files) runNode(['--check', join(__dirname, file)]);
for (const file of files.filter(file => file.endsWith('.test.js'))) {
  runNode([join(__dirname, file)]);
}

console.log(`checked ${files.length} scripts; ` +
  `ran ${files.filter(file => file.endsWith('.test.js')).length} test files`);
