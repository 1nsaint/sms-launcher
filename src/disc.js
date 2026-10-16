'use strict';

// Reads files straight out of the player's GameCube disc image (ISO/GCM or CISO)
// without unpacking the whole disc.

const fs = require('node:fs');

class Disc {
  constructor(file) {
    this.fd = fs.openSync(file, 'r');
    const head = this.readRaw(0, 0x20);
    this.blocks = null;
    if (head.toString('ascii', 0, 4) === 'CISO') {
      // CISO: a 0x8000-byte header whose map marks which blocks of the disc are stored, in order.
      this.blockSize = head.readUInt32LE(4);
      const map = this.readRaw(8, 0x8000 - 8);
      this.blocks = new Int32Array(map.length).fill(-1);
      for (let i = 0, stored = 0; i < map.length; i++) if (map[i]) this.blocks[i] = stored++;
    }
    const header = this.read(0, 0x440);
    this.gameId = header.toString('ascii', 0, 6);
    const fstOffset = header.readUInt32BE(0x424), fstSize = header.readUInt32BE(0x428);
    this.files = parseFst(this.read(fstOffset, fstSize));
  }

  readRaw(offset, length) {
    const out = Buffer.alloc(length);
    const got = fs.readSync(this.fd, out, 0, length, offset);
    if (got !== length) throw new Error('The game disc file ended early.');
    return out;
  }

  // Bytes at a disc offset, mapping through the CISO block table when compressed.
  read(offset, length) {
    if (!this.blocks) return this.readRaw(offset, length);
    const out = Buffer.alloc(length);
    for (let done = 0; done < length;) {
      const block = Math.floor((offset + done) / this.blockSize), within = (offset + done) % this.blockSize;
      const take = Math.min(length - done, this.blockSize - within);
      if (this.blocks[block] >= 0)
        out.set(this.readRaw(0x8000 + this.blocks[block] * this.blockSize + within, take), done);
      done += take;
    }
    return out;
  }

  file(name) {
    const entry = this.files.get(name.toLowerCase());
    if (!entry) throw new Error(`The game disc has no ${name}.`);
    return this.read(entry.offset, entry.size);
  }

  close() { fs.closeSync(this.fd); }
}

// The disc's file system table: path (lower case, "/"-separated) -> { offset, size }.
function parseFst(fst) {
  const count = fst.readUInt32BE(8), strings = count * 12;
  const files = new Map();
  const name = at => { const start = strings + at; return fst.toString('latin1', start, fst.indexOf(0, start)); };
  const dirs = [{ end: count, path: '' }];
  for (let i = 1; i < count; i++) {
    while (i >= dirs[dirs.length - 1].end) dirs.pop();
    const word = fst.readUInt32BE(i * 12), isDir = word >>> 24 === 1;
    const full = dirs[dirs.length - 1].path + name(word & 0xffffff);
    if (isDir) dirs.push({ end: fst.readUInt32BE(i * 12 + 8), path: `${full}/` });
    else files.set(full.toLowerCase(), { offset: fst.readUInt32BE(i * 12 + 4), size: fst.readUInt32BE(i * 12 + 8) });
  }
  return files;
}

module.exports = { Disc, parseFst };
