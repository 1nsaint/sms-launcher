'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const savestates = require('../src/savestates');

// A state file as the game writes it (platform/savestate/state_file.cpp): the description, a picture, and
// the game's memory, which the launcher never reads.
function stateFile(file, info, { thumbnail = Buffer.from('png!'), memory = 4096, version = 1 } = {}) {
  const chunk = (tag, data, codec = 0) => {
    const head = Buffer.alloc(24);
    head.write(tag, 0, 'latin1');
    head.writeUInt32LE(codec, 4);
    head.writeBigUInt64LE(BigInt(data.length), 8);
    head.writeBigUInt64LE(BigInt(data.length), 16);
    return Buffer.concat([head, data]);
  };
  const chunks = [chunk('JSON', Buffer.from(JSON.stringify(info)))];
  if (thumbnail) chunks.push(chunk('THMB', thumbnail));
  chunks.push(chunk('MEM1', Buffer.alloc(memory, 7), 1));
  const head = Buffer.alloc(16);
  head.write('SMSSTATE', 0, 'latin1');
  head.writeUInt32LE(version, 8);
  head.writeUInt32LE(chunks.length, 12);
  fs.writeFileSync(file, Buffer.concat([head, ...chunks]));
  return file;
}

const info = (stage, created, extra = {}) => ({ format: 1, created, game: 'GMSE01', flavor: 'sunshine', stage,
  episode: 'Road to the Big Windmill', area: 2, episodeIndex: 0, shines: 12, blueCoins: 30, coins: 45, lives: 4,
  build: 'ab'.repeat(32), exact: true, ...extra });

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'sms-states-')); }

test('states live beside the memory card folder unless the game is told otherwise', () => {
  const card = path.join('/data', 'sms-port', 'card-a');
  assert.equal(savestates.stateDirectory(card, {}), path.join('/data', 'sms-port', 'savestates'));
  assert.equal(savestates.stateDirectory(card, { SMS_SAVE_STATE_DIR: '/elsewhere' }), path.resolve('/elsewhere'));
});

test('a state reads as its description and picture, without the game memory', () => {
  const dir = tempDir();
  const file = stateFile(path.join(dir, 'a.smsstate'), info('BIANCO HILLS', '2026-10-13T08:42:02Z'), { memory: 1 << 20 });
  const state = savestates.readState(file);
  assert.equal(state.stage, 'BIANCO HILLS');
  assert.equal(state.episode, 'Road to the Big Windmill');
  assert.equal(state.created, '2026-10-13T08:42:02.000Z');
  assert.equal(state.exact, true);
  assert.equal(state.thumbnail, `data:image/png;base64,${Buffer.from('png!').toString('base64')}`);
  assert.equal(state.name, 'a.smsstate');
  assert.deepEqual(state.counts, { shines: 12, blueCoins: 30, coins: 45, lives: 4 });
});

test('states saved before their counts were recorded have none', () => {
  const dir = tempDir();
  const old = info('RICCO HARBOR', '2026-10-13T08:00:00Z');
  for (const key of ['shines', 'blueCoins', 'coins', 'lives']) delete old[key];
  assert.equal(savestates.readState(stateFile(path.join(dir, 'old.smsstate'), old)).counts, null);
});

test('files that are not states, or are cut short, are left out', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'junk.smsstate'), 'not a state at all');
  stateFile(path.join(dir, 'future.smsstate'), info('X', '2026-01-01T00:00:00Z'), { version: 2 });
  const whole = fs.readFileSync(stateFile(path.join(dir, 'cut.smsstate'), info('X', '2026-01-01T00:00:00Z')));
  fs.writeFileSync(path.join(dir, 'cut.smsstate'), whole.subarray(0, 40));
  stateFile(path.join(dir, 'other.txt'), info('X', '2026-01-01T00:00:00Z'));
  assert.deepEqual(savestates.listStates(dir), []);
  assert.deepEqual(savestates.listStates(path.join(dir, 'missing')), []);
});

test('states list newest first', () => {
  const dir = tempDir();
  stateFile(path.join(dir, 'old.smsstate'), info('RICCO HARBOR', '2026-10-01T10:00:00Z'));
  stateFile(path.join(dir, 'new.smsstate'), info('BIANCO HILLS', '2026-10-13T10:00:00Z'), { thumbnail: null });
  const states = savestates.listStates(dir);
  assert.deepEqual(states.map(state => state.stage), ['BIANCO HILLS', 'RICCO HARBOR']);
  assert.equal(states[0].thumbnail, null);
});

test('importing copies a shared state in without replacing one already there', () => {
  const from = tempDir(), dir = path.join(tempDir(), 'savestates');
  const shared = stateFile(path.join(from, 'Bianco.smsstate'), info('BIANCO HILLS', '2026-10-13T10:00:00Z'));
  assert.equal(savestates.importState(shared, dir).name, 'Bianco.smsstate');
  assert.equal(savestates.importState(shared, dir).name, 'Bianco (2).smsstate');
  assert.equal(savestates.listStates(dir).length, 2);
  fs.writeFileSync(path.join(from, 'fake.smsstate'), 'nope');
  assert.throws(() => savestates.importState(path.join(from, 'fake.smsstate'), dir), /not a Super Mario Sunshine save state/);
});

test('only states in the folder can be shown or deleted', () => {
  const dir = tempDir();
  stateFile(path.join(dir, 'a.smsstate'), info('BIANCO HILLS', '2026-10-13T10:00:00Z'));
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'keep');
  assert.throws(() => savestates.statePath(dir, '../a.smsstate'), /Choose a save state/);
  assert.throws(() => savestates.statePath(dir, 'notes.txt'), /Choose a save state/);
  assert.throws(() => savestates.statePath(dir, 'gone.smsstate'), /gone/);
  savestates.deleteState(dir, 'a.smsstate');
  assert.deepEqual(fs.readdirSync(dir), ['notes.txt']);
});
