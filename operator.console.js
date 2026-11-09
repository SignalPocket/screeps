'use strict';

const HELP_DEFINITION = Object.freeze({
  name: 'help',
  signature: 'ops.help([commandName])',
  purpose: 'List live operator commands or explain one exact command.',
  example: 'ops.help()',
  mode: 'read-only',
  writes: 'none',
  expires: null,
  related: Object.freeze(['cancel', 'colony', 'creep', 'defend', 'directives',
    'energy', 'room', 'spawn', 'work'])
});

const normalizeDefinition = definition => {
  if (!definition || typeof definition.name !== 'string' ||
      !/^[a-z][a-zA-Z0-9]*$/.test(definition.name) ||
      typeof definition.signature !== 'string' ||
      typeof definition.purpose !== 'string' ||
      typeof definition.example !== 'string' ||
      !['read-only', 'bounded-write'].includes(definition.mode)) {
    throw new Error('Invalid operator command definition');
  }
  if (definition.mode === 'bounded-write' &&
      (!definition.writes || definition.writes === 'none' ||
       !Number.isSafeInteger(definition.expires) || definition.expires <= 0)) {
    throw new Error('Bounded operator commands require write scope and expiration');
  }
  return Object.freeze({
    name: definition.name,
    signature: definition.signature,
    purpose: definition.purpose,
    example: definition.example,
    mode: definition.mode,
    writes: definition.writes || 'none',
    expires: definition.expires == null ? null : definition.expires,
    related: Object.freeze([...(definition.related || [])].sort())
  });
};

const publicDefinition = definition => ({
  name: definition.name,
  signature: definition.signature,
  purpose: definition.purpose,
  example: definition.example,
  mode: definition.mode,
  writes: definition.writes,
  expires: definition.expires,
  related: [...definition.related]
});

const createOperatorConsole = ({ Game, commands = [] }) => {
  const entries = [
    { definition: HELP_DEFINITION, run: null },
    ...commands
  ].map(entry => ({
    definition: normalizeDefinition(entry.definition || entry),
    run: entry.run
  })).sort((left, right) =>
    left.definition.name.localeCompare(right.definition.name));
  const duplicate = entries.find((entry, index) =>
    index > 0 && entry.definition.name === entries[index - 1].definition.name);
  if (duplicate) throw new Error('Duplicate operator command: ' +
    duplicate.definition.name);

  const byName = new Map(entries.map(entry => [entry.definition.name, entry]));
  const tick = () => Number.isSafeInteger(Game && Game.time) ? Game.time : null;
  const help = commandName => {
    const selected = commandName == null ? entries :
      byName.has(commandName) ? [byName.get(commandName)] : null;
    if (!selected) {
      const available = entries.map(entry => entry.definition.name);
      return {
        ok: false,
        tick: tick(),
        freshness: 'current tick',
        error: `Unknown operator command: ${String(commandName)}`,
        available,
        console: `Unknown operator command: ${String(commandName)}. ` +
          `Available: ${available.join(', ')}`
      };
    }
    const definitions = selected.map(entry =>
      publicDefinition(entry.definition));
    const lines = definitions.map(definition =>
      `${definition.signature} | ${definition.mode} | ${definition.purpose} ` +
      `Example: ${definition.example}`);
    return {
      ok: true,
      tick: tick(),
      freshness: 'current tick',
      command: commandName == null ? null : commandName,
      commands: definitions,
      console: lines.join('\n')
    };
  };

  const api = { help };
  for (const entry of entries) {
    if (entry.definition.name === 'help') continue;
    if (typeof entry.run !== 'function') {
      throw new Error('Operator command requires a handler: ' +
        entry.definition.name);
    }
    api[entry.definition.name] = (...args) => entry.run(...args);
  }
  return Object.freeze(api);
};

const installOperatorConsole = ({ Game, globalObject = global,
  commands = [] }) => {
  const api = createOperatorConsole({ Game, commands });
  globalObject.ops = api;
  return api;
};

module.exports = { createOperatorConsole, installOperatorConsole };
