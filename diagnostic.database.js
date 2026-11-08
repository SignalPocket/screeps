'use strict';

// Read-only adapter for the Loki database export. Missing collections retain
// the existing empty-row fallback; callers continue to own identity and
// selection rules beyond the exact user requested here.
const getCollectionRows = (database, name) =>
  database.collections?.find(collection => collection.name === name)?.data || [];

const decodeExplicitUser = (database, user, options = {}) => {
  if (typeof user !== 'string' || !user) throw Error('Require explicit user');
  const env = getCollectionRows(database, 'env')[0]?.data;
  if (!Number.isSafeInteger(env?.gameTime)) {
    throw Error('Missing authoritative tick');
  }
  if (typeof env[`memory:${user}`] !== 'string') {
    throw Error('Missing user memory');
  }
  if (typeof options.beforeMemoryDecode === 'function') {
    options.beforeMemoryDecode({ tick: env.gameTime, user });
  }
  return {
    tick: env.gameTime,
    memory: JSON.parse(env[`memory:${user}`]),
    objects: getCollectionRows(database, 'rooms.objects')
  };
};

module.exports = { getCollectionRows, decodeExplicitUser };
