'use strict';

const assert = require('assert');
const { createOperatorConsole, installOperatorConsole } =
  require('./operator.console');

const Game = { time: 123, rooms: { W1N1: {}, W2N2: {} } };
const globalObject = {};
const api = installOperatorConsole({ Game, globalObject });
assert.strictEqual(globalObject.ops, api);
assert(Object.isFrozen(api));

const first = api.help();
const second = api.help();
assert.deepStrictEqual(second, first,
  'repeated help calls are deterministic and read-only');
assert.strictEqual(first.ok, true);
assert.strictEqual(first.tick, 123);
assert.strictEqual(first.freshness, 'current tick');
assert.deepStrictEqual(first.commands.map(command => command.name), ['help']);
assert.strictEqual(first.commands[0].mode, 'read-only');
assert.strictEqual(first.commands[0].writes, 'none');
assert.strictEqual(first.commands[0].expires, null);
assert.match(first.console, /ops\.help\(\[commandName\]\)/);
assert.match(first.console, /Example: ops\.help\(\)/);

const exact = api.help('help');
assert.strictEqual(exact.command, 'help');
assert.strictEqual(exact.commands.length, 1);
const unknown = api.help('missing');
assert.strictEqual(unknown.ok, false);
assert.strictEqual(unknown.tick, 123);
assert.deepStrictEqual(unknown.available, ['help']);
assert.match(unknown.error, /Unknown operator command/);

Game.time = 124;
assert.strictEqual(api.help().tick, 124,
  'help reports the current authoritative tick rather than install time');
const noClock = createOperatorConsole({ Game: null }).help();
assert.strictEqual(noClock.tick, null);

const future = createOperatorConsole({ Game, commands: [{
  definition: {
    name: 'room', signature: "ops.room('W1N1')",
    purpose: 'Inspect one room.', example: "ops.room('W1N1')",
    mode: 'read-only', writes: 'none', expires: null,
    related: ['energy', 'spawn']
  },
  run: roomName => ({ roomName })
}] });
assert.deepStrictEqual(future.help().commands.map(command => command.name),
  ['help', 'room']);
assert.deepStrictEqual(future.help('room').commands[0].related,
  ['energy', 'spawn']);
assert.deepStrictEqual(future.room('W2N2'), { roomName: 'W2N2' });

assert.throws(() => createOperatorConsole({ Game, commands: [{
  definition: { name: 'bad command' }
}] }), /Invalid operator command definition/);
assert.throws(() => createOperatorConsole({ Game, commands: [{
  definition: {
    name: 'defend', signature: 'ops.defend()', purpose: 'Defend.',
    example: 'ops.defend()', mode: 'bounded-write', writes: 'none',
    expires: null
  }, run: () => null
}] }), /require write scope and expiration/);
assert.throws(() => createOperatorConsole({ Game, commands: [{
  definition: {
    name: 'room', signature: 'ops.room()', purpose: 'Inspect.',
    example: 'ops.room()', mode: 'read-only'
  }
}] }), /requires a handler/);

console.log('operator console help is deterministic, current, discoverable and read-only');
