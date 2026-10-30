'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { summarizeRoomHealth } = require('./health.reporting');

const roomName = process.argv[2] || 'W7N4';
const localConfigPath = path.join(__dirname, 'screeps.local.json');
let localConfig = {};
if (fs.existsSync(localConfigPath)) {
  try {
    localConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
  } catch (error) {
    console.error(`Could not parse screeps.local.json: ${error.message}`);
    process.exitCode = 2;
  }
}
const server = process.env.SCREEPS_SERVER || localConfig.server ||
  'http://127.0.0.1:21025';
const token = process.env.SCREEPS_TOKEN || localConfig.token;
const databasePath = process.env.SCREEPS_DB || localConfig.database ||
  'C:/Program Files (x86)/Steam/steamapps/common/Screeps/server/db.json';

const printHealth = database => {
  const summary = summarizeRoomHealth(roomName, database);
  console.log(summary.console);
  console.log(JSON.stringify(database, null, 2));
};

const readLocalHealth = () => {
  if (!fs.existsSync(databasePath)) return null;
  const serverDatabase = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
  const environment = (serverDatabase.collections || [])
    .find(collection => collection.name === 'env');
  const data = environment && environment.data && environment.data[0] &&
    environment.data[0].data || {};
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith('memory:') || typeof value !== 'string') continue;
    let memory;
    try {
      memory = JSON.parse(value);
    } catch (error) {
      continue;
    }
    const database = memory.rooms && memory.rooms[roomName] &&
      memory.rooms[roomName].roomTrendHistory;
    if (database) return database;
  }
  return null;
};

let localHealth;
if (!process.exitCode) {
  try {
    localHealth = readLocalHealth();
  } catch (error) {
    console.error(`Could not read local Screeps database: ${error.message}`);
  }
}

if (localHealth) {
  printHealth(localHealth);
} else if (!process.exitCode && !token) {
  console.error('No token found. Set SCREEPS_TOKEN or create the ignored ' +
    'screeps.local.json from screeps.local.example.json. The local database ' +
    'did not contain health data for ' + roomName + '.');
  process.exitCode = 2;
} else if (!process.exitCode) {
  const url = new URL('/api/user/memory', server);
  url.searchParams.set('path', `rooms.${roomName}.roomTrendHistory`);
  const transport = url.protocol === 'https:' ? https : http;
  const request = transport.get(url, {
    headers: { 'X-Token': token, Authorization: `Bearer ${token}` }
  }, response => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', chunk => { body += chunk; });
    response.on('end', () => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        console.error(`Screeps API returned ${response.statusCode}.`);
        process.exitCode = 1;
        return;
      }
      try {
        const payload = JSON.parse(body);
        const database = typeof payload.data === 'string'
          ? JSON.parse(payload.data) : payload.data || payload;
        printHealth(database);
      } catch (error) {
        console.error(`Could not parse Screeps memory: ${error.message}`);
        process.exitCode = 1;
      }
    });
  });
  request.on('error', error => {
    console.error(`Could not reach ${server}: ${error.message}`);
    process.exitCode = 1;
  });
}
