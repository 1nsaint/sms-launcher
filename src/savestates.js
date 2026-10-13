'use strict';
// Save states: the game writes them as *.smsstate files in a savestates folder beside the memory card
// (platform/savestate in sms-pc-port). Each is a list of chunks; the launcher reads only the first ones, the
// description (JSON) and the picture (THMB, a PNG), and skips the game's memory that follows.
//
//   "SMSSTATE"  u32 version (1)  u32 chunk count
//   per chunk: char tag[4], u32 codec, u64 stored bytes, u64 raw bytes, the stored bytes

const fs = require('node:fs');
const path = require('node:path');

const MAGIC = Buffer.from('SMSSTATE');
const EXTENSION = '.smsstate';
const MAX_SMALL_CHUNK = 4 * 1024 * 1024;

// Beside the memory card folder (card-a): where the game saves states unless SMS_SAVE_STATE_DIR says otherwise.
function stateDirectory(saveDir, env = process.env) {
  return env.SMS_SAVE_STATE_DIR ? path.resolve(env.SMS_SAVE_STATE_DIR) : path.join(path.dirname(saveDir), 'savestates');
}

function readExactly(fd, length, position) {
  const buffer = Buffer.alloc(length);
  const read = fs.readSync(fd, buffer, 0, length, position);
  if (read !== length) throw new Error('The save state file is cut short.');
  return buffer;
}

// The state's description and picture, or null when the file is not a save state.
function readState(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const head = readExactly(fd, 16, 0);
    if (!head.subarray(0, 8).equals(MAGIC) || head.readUInt32LE(8) !== 1) return null;
    const count = head.readUInt32LE(12);
    const size = fs.fstatSync(fd).size;
    let at = 16, info = null, thumbnail = null;
    for (let i = 0; i < count && at + 24 <= size && !(info && thumbnail); i++) {
      const chunk = readExactly(fd, 24, at);
      const tag = chunk.toString('latin1', 0, 4), codec = chunk.readUInt32LE(4);
      const stored = Number(chunk.readBigUInt64LE(8));
      at += 24;
      if (at + stored > size) return null;
      if ((tag === 'JSON' || tag === 'THMB') && codec === 0 && stored <= MAX_SMALL_CHUNK) {
        const data = readExactly(fd, stored, at);
        if (tag === 'JSON') info = JSON.parse(data.toString('utf8'));
        else thumbnail = `data:image/png;base64,${data.toString('base64')}`;
      }
      at += stored;
    }
    if (!info || info.format !== 1) return null;
    const created = Date.parse(info.created);
    return {
      name: path.basename(file), file, size,
      created: Number.isFinite(created) ? new Date(created).toISOString() : fs.statSync(file).mtime.toISOString(),
      stage: String(info.stage || ''), episode: String(info.episode || ''),
      game: String(info.game || ''), flavor: String(info.flavor || ''),
      exact: info.exact === true, build: typeof info.build === 'string' ? info.build : '',
      thumbnail
    };
  } catch (_) {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// Every state in the folder, newest first.
function listStates(dir) {
  let names;
  try { names = fs.readdirSync(dir); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  return names.filter(name => name.endsWith(EXTENSION) && !name.startsWith('.'))
    .map(name => readState(path.join(dir, name))).filter(Boolean)
    .sort((a, b) => b.created.localeCompare(a.created) || b.name.localeCompare(a.name));
}

// A file name in dir that is not taken yet: "name.smsstate", then "name (2).smsstate" and so on.
function freeName(dir, base) {
  const stem = base.replace(/\.smsstate$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').trim() || 'Save state';
  for (let n = 1; ; n++) {
    const name = `${stem}${n === 1 ? '' : ` (${n})`}${EXTENSION}`;
    if (!fs.existsSync(path.join(dir, name))) return name;
  }
}

// Copies a state someone shared into the folder, keeping any state already there.
function importState(file, dir) {
  const state = readState(file);
  if (!state) throw new Error(`${path.basename(file)} is not a Super Mario Sunshine save state.`);
  fs.mkdirSync(dir, { recursive: true });
  const name = freeName(dir, path.basename(file));
  fs.copyFileSync(file, path.join(dir, name), fs.constants.COPYFILE_EXCL);
  return { ...state, name, file: path.join(dir, name) };
}

// The path of a state in the folder by its file name; refuses anything else.
function statePath(dir, name) {
  if (typeof name !== 'string' || name !== path.basename(name) || !name.endsWith(EXTENSION))
    throw new Error('Choose a save state.');
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) throw new Error('That save state is gone.');
  return file;
}

function deleteState(dir, name) {
  fs.rmSync(statePath(dir, name));
}

module.exports = { EXTENSION, stateDirectory, readState, listStates, importState, statePath, deleteState };
