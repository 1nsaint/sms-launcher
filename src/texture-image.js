'use strict';

// Texture pack images: reads DDS (BC1, BC2, BC3, BC7 or uncompressed) and
// PNG into RGBA, and writes RGBA as PNG, for repainting Mario's HD textures.

const fs = require('node:fs');
const zlib = require('node:zlib');

// From bcdec.h (Sergii Kudlai, MIT or Unlicense): every 2- and 3-subset BC7
// partition, texel by texel: the subset (0-2), or a-c for that subset's anchor.
const PARTITIONS = [null, null, [
    'a01100110011001b', 'a00100010001000b', 'a11101110111011b', 'a00100110011011b',
    'a00000010001001b', 'a01101110111111b', 'a00100110111111b', 'a00000010011011b',
    'a00000000001001b', 'a01101111111111b', 'a00000010111111b', 'a00000000001011b',
    'a00101111111111b', 'a00000001111111b', 'a00011111111111b', 'a00000000000111b',
    'a00010001110111b', 'a1b1000100000000', 'a0000000b0001110', 'a1b1001100010000',
    'a0b1000100000000', 'a0001000b1001110', 'a0000000b0001100', 'a11100110011000b',
    'a0b1000100010000', 'a0001000b0001100', 'a1b0011001100110', 'a0b1011001101100',
    'a0010111b1101000', 'a0001111b1110000', 'a1b1000110001110', 'a0b1100110011100',
    'a10101010101010b', 'a00011110000111b', 'a10110b001011010', 'a0110011b1001100',
    'a0b1110000111100', 'a1010101b0101010', 'a11010010110100b', 'a10110101010010b',
    'a1b1001111001110', 'a0010011b1001000', 'a0b1001001001100', 'a0b1101111011100',
    'a1b0100110010110', 'a01111001100001b', 'a11001101001100b', 'a00001b001100000',
    'a10011b001000000', 'a0b0011100100000', 'a00000b001110010', 'a0000100b1100100',
    'a11011001001001b', 'a01101101100100b', 'a1b0001110011100', 'a0b1100111000110',
    'a11011001100100b', 'a11000110011100b', 'a11111101000000b', 'a00110001110011b',
    'a00011110011001b', 'a0b1001111110000', 'a0b0001011101110', 'a10001000111011b'], [
    'a01b00110221222c', 'a00b0011c2112221', 'a0002001c211221b', 'a22c00220011011b',
    'a0000000b122112c', 'a01b00110022002c', 'a02c00221111111b', 'a0110011c211221b',
    'a0000000b111222c', 'a0001111b111222c', 'a00011b12222222c', 'a01200b20012001c',
    'a11201b20112011c', 'a1220b220122012c', 'a01b01121122122c', 'a01b2001c2002220',
    'a00b00110112112c', 'a11b0011c0012200', 'a0001122b122112c', 'a02c00220022111b',
    'a11b01110222022c', 'a00b0001c2212221', 'a00000b10122012c', 'a0001100c2b02210',
    'a12c0b2200110000', 'a0120012b122222c', 'a11012c1b2210110', 'a00001b012c11221',
    'a0221102b102002c', 'a1100b102002222c', 'a011012201c2001b', 'a0002000c211222b',
    'a0000002b122122c', 'a22c00220012001b', 'a01b00120022022c', 'a1200b2001c00120',
    'a00011b122c20000', 'a1201201c0b20120', 'a1202012bc010120', 'a011220011c2001b',
    'a01111c22200001b', 'a10b01012222222c', 'a0000000c121212b', 'a0221b220022112c',
    'a02c00110022001b', 'a22012c10220122b', 'a10122c22222010b', 'a0002121c121212b',
    'a10b01010101222c', 'a22c01110222011b', 'a0021b120002111c', 'a0002b122112211c',
    'a2220b110111022c', 'a0021112b112000c', 'a1100b100110222c', 'a000000021b2211c',
    'a1100b102222222c', 'a022001100b1002c', 'a0221122b122002c', 'a000000000002b1c',
    'a00c00010002000b', 'a22212220222b22c', 'a10b22222222222c', 'a11b2011c2012220']];

const WEIGHTS = [null, null, [0, 21, 43, 64], [0, 9, 18, 27, 37, 46, 55, 64], [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64]];
// Per mode: subsets, partition bits, colour and alpha endpoint bits, p-bits
// (0 none, 1 one per endpoint, 2 one per subset), index bits and second index bits.
const MODES = [
  { subsets: 3, partitionBits: 4, colorBits: 4, alphaBits: 0, pbits: 1, indexBits: 3, index2Bits: 0 },
  { subsets: 2, partitionBits: 6, colorBits: 6, alphaBits: 0, pbits: 2, indexBits: 3, index2Bits: 0 },
  { subsets: 3, partitionBits: 6, colorBits: 5, alphaBits: 0, pbits: 0, indexBits: 2, index2Bits: 0 },
  { subsets: 2, partitionBits: 6, colorBits: 7, alphaBits: 0, pbits: 1, indexBits: 2, index2Bits: 0 },
  { subsets: 1, partitionBits: 0, colorBits: 5, alphaBits: 6, pbits: 0, indexBits: 2, index2Bits: 3 },
  { subsets: 1, partitionBits: 0, colorBits: 7, alphaBits: 8, pbits: 0, indexBits: 2, index2Bits: 2 },
  { subsets: 1, partitionBits: 0, colorBits: 7, alphaBits: 7, pbits: 1, indexBits: 4, index2Bits: 0 },
  { subsets: 2, partitionBits: 6, colorBits: 5, alphaBits: 5, pbits: 1, indexBits: 2, index2Bits: 0 },
];

// One 16-byte BC7 block into `out` (RGBA) at texel (x, y) of a `width`-wide image.
function bc7Block(src, at, out, x, y, width, height) {
  let bit = 0;
  const read = n => {
    let v = 0;
    for (let k = 0; k < n; k++, bit++) v |= ((src[at + (bit >> 3)] >> (bit & 7)) & 1) << k;
    return v;
  };
  let mode = 0;
  while (mode < 8 && !read(1)) mode++;
  const put = (i, r, g, b, a) => {
    const px = x + (i & 3), py = y + (i >> 2);
    if (px >= width || py >= height) return;
    const o = (py * width + px) * 4;
    out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
  };
  if (mode === 8) { for (let i = 0; i < 16; i++) put(i, 0, 0, 0, 0); return; }
  const m = MODES[mode];
  const partition = m.partitionBits ? read(m.partitionBits) : 0;
  const rotation = mode === 4 || mode === 5 ? read(2) : 0;
  const selection = mode === 4 ? read(1) : 0;
  const ends = m.subsets * 2, e = Array.from({ length: ends }, () => [0, 0, 0, 255]);
  for (let c = 0; c < 3; c++) for (let j = 0; j < ends; j++) e[j][c] = read(m.colorBits);
  if (m.alphaBits) for (let j = 0; j < ends; j++) e[j][3] = read(m.alphaBits);
  let colorBits = m.colorBits, alphaBits = m.alphaBits;
  if (m.pbits) {
    const p = m.pbits === 2 ? [read(1), read(1)] : null;
    for (let j = 0; j < ends; j++) {
      const pbit = p ? p[j >> 1] : read(1);
      for (let c = 0; c < 4; c++) e[j][c] = (e[j][c] << 1) | pbit;
    }
    colorBits++; if (alphaBits) alphaBits++;
  }
  for (const end of e) {
    for (let c = 0; c < 3; c++) end[c] = (end[c] << (8 - colorBits)) | (end[c] >> (2 * colorBits - 8));
    end[3] = alphaBits ? (end[3] << (8 - alphaBits)) | (end[3] >> (2 * alphaBits - 8)) : 255;
  }
  const shape = m.subsets > 1 ? PARTITIONS[m.subsets][partition] : 'a000000000000000';
  const subset = i => { const c = shape.charCodeAt(i); return c >= 97 ? c - 97 : c - 48; };
  const anchor = i => shape.charCodeAt(i) >= 97;
  const index = new Array(16), index2 = new Array(16);
  for (let i = 0; i < 16; i++) index[i] = read(m.indexBits - (anchor(i) ? 1 : 0));
  if (m.index2Bits) for (let i = 0; i < 16; i++) index2[i] = read(m.index2Bits - (i === 0 ? 1 : 0));
  const lerp = (a, b, w) => (a * (64 - w) + b * w + 32) >> 6;
  for (let i = 0; i < 16; i++) {
    const s = subset(i), e0 = e[s * 2], e1 = e[s * 2 + 1];
    let colorWeight = WEIGHTS[m.indexBits][index[i]], alphaWeight = colorWeight;
    if (m.index2Bits) {
      const second = WEIGHTS[m.index2Bits][index2[i]];
      if (selection) { colorWeight = second; } else { alphaWeight = second; }
    }
    const px = [lerp(e0[0], e1[0], colorWeight), lerp(e0[1], e1[1], colorWeight), lerp(e0[2], e1[2], colorWeight), lerp(e0[3], e1[3], alphaWeight)];
    if (rotation) [px[3], px[rotation - 1]] = [px[rotation - 1], px[3]];
    put(i, ...px);
  }
}

// BC1's colour block (opaque: BC2/BC3's, always four colours).
function colorBlock(src, at, out, x, y, width, height, opaque) {
  const c0 = src.readUInt16LE(at), c1 = src.readUInt16LE(at + 2);
  const rgb = v => [((v >> 11) * 527 + 23) >> 6, (((v >> 5) & 63) * 259 + 33) >> 6, ((v & 31) * 527 + 23) >> 6];
  const a = rgb(c0), b = rgb(c1);
  const colors = [[...a, 255], [...b, 255]];
  if (opaque || c0 > c1) colors.push([...a.map((v, i) => (2 * v + b[i] + 1) / 3 | 0), 255], [...a.map((v, i) => (v + 2 * b[i] + 1) / 3 | 0), 255]);
  else colors.push([...a.map((v, i) => (v + b[i] + 1) >> 1), 255], [0, 0, 0, 0]);
  const bits = src.readUInt32LE(at + 4);
  for (let i = 0; i < 16; i++) {
    const px = x + (i & 3), py = y + (i >> 2);
    if (px < width && py < height) out.set(colors[(bits >>> (i * 2)) & 3], (py * width + px) * 4);
  }
}

function alphaBlock(src, at, out, x, y, width, height, explicit) {
  const alpha = new Array(16);
  if (explicit) for (let i = 0; i < 16; i++) alpha[i] = ((src[at + (i >> 1)] >> ((i & 1) * 4)) & 15) * 17;
  else {
    const a0 = src[at], a1 = src[at + 1], table = [a0, a1];
    if (a0 > a1) for (let k = 1; k < 7; k++) table.push(((7 - k) * a0 + k * a1 + 3) / 7 | 0);
    else { for (let k = 1; k < 5; k++) table.push(((5 - k) * a0 + k * a1 + 2) / 5 | 0); table.push(0, 255); }
    let bits = 0n;
    for (let k = 7; k >= 2; k--) bits = (bits << 8n) | BigInt(src[at + k]);
    for (let i = 0; i < 16; i++) alpha[i] = table[Number((bits >> BigInt(i * 3)) & 7n)];
  }
  for (let i = 0; i < 16; i++) {
    const px = x + (i & 3), py = y + (i >> 2);
    if (px < width && py < height) out[(py * width + px) * 4 + 3] = alpha[i];
  }
}

// A DDS file's first level, as { width, height, rgba }.
function readDds(file) {
  if (file.toString('ascii', 0, 4) !== 'DDS ') throw new Error('This texture is not a DDS file.');
  const height = file.readUInt32LE(12), width = file.readUInt32LE(16);
  const flags = file.readUInt32LE(80), fourCC = file.toString('ascii', 84, 88);
  let kind, at = 128;
  if (fourCC === 'DX10') {
    const dxgi = file.readUInt32LE(128);
    at += 20;
    kind = dxgi >= 70 && dxgi <= 72 ? 'bc1' : dxgi >= 73 && dxgi <= 75 ? 'bc2' : dxgi >= 76 && dxgi <= 78 ? 'bc3'
      : dxgi >= 97 && dxgi <= 99 ? 'bc7' : dxgi === 28 || dxgi === 29 ? 'rgba' : dxgi === 87 || dxgi === 91 ? 'bgra' : null;
  } else kind = { DXT1: 'bc1', DXT2: 'bc2', DXT3: 'bc2', DXT4: 'bc3', DXT5: 'bc3' }[fourCC]
    || (flags & 0x40 && file.readUInt32LE(88) === 32 ? (file.readUInt32LE(92) === 0xff ? 'rgba' : 'bgra') : null);
  if (!kind) throw new Error('This DDS texture uses a format the launcher cannot read.');
  const rgba = new Uint8Array(width * height * 4);
  if (kind === 'rgba' || kind === 'bgra') {
    for (let i = 0; i < width * height; i++) {
      const o = at + i * 4;
      if (kind === 'rgba') rgba.set(file.subarray(o, o + 4), i * 4);
      else rgba.set([file[o + 2], file[o + 1], file[o], file[o + 3]], i * 4);
    }
    return { width, height, rgba };
  }
  const size = kind === 'bc1' ? 8 : 16;
  for (let by = 0; by < height; by += 4) for (let bx = 0; bx < width; bx += 4, at += size) {
    if (kind === 'bc7') bc7Block(file, at, rgba, bx, by, width, height);
    else if (kind === 'bc1') colorBlock(file, at, rgba, bx, by, width, height, false);
    else { colorBlock(file, at + 8, rgba, bx, by, width, height, true); alphaBlock(file, at, rgba, bx, by, width, height, kind === 'bc2'); }
  }
  return { width, height, rgba };
}

// An 8-bit, non-interlaced PNG, as { width, height, rgba }.
function readPng(file) {
  if (file.readUInt32BE(0) !== 0x89504e47) throw new Error('This texture is not a PNG file.');
  let width, height, depth, type, interlace, palette = null, transparency = null;
  const data = [];
  for (let at = 8; at < file.length;) {
    const length = file.readUInt32BE(at), name = file.toString('ascii', at + 4, at + 8), body = file.subarray(at + 8, at + 8 + length);
    if (name === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (name === 'PLTE') palette = body;
    else if (name === 'tRNS') transparency = body;
    else if (name === 'IDAT') data.push(body);
    else if (name === 'IEND') break;
    at += 12 + length;
  }
  if (depth !== 8 || interlace) throw new Error('This PNG texture uses a format the launcher cannot read.');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!channels) throw new Error('This PNG texture uses a format the launcher cannot read.');
  const raw = zlib.inflateSync(Buffer.concat(data)), stride = width * channels, pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), o = y * stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? pixels[o + i - channels] : 0, up = y ? pixels[o - stride + i] : 0;
      const corner = y && i >= channels ? pixels[o - stride + i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += left;
      else if (filter === 2) v += up;
      else if (filter === 3) v += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - corner);
        v += pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
      }
      pixels[o + i] = v;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const p = pixels.subarray(i * channels, i * channels + channels);
    if (type === 6) rgba.set(p, i * 4);
    else if (type === 2) rgba.set([p[0], p[1], p[2], 255], i * 4);
    else if (type === 0) rgba.set([p[0], p[0], p[0], 255], i * 4);
    else if (type === 4) rgba.set([p[0], p[0], p[0], p[1]], i * 4);
    else rgba.set([palette[p[0] * 3], palette[p[0] * 3 + 1], palette[p[0] * 3 + 2], transparency && p[0] < transparency.length ? transparency[p[0]] : 255], i * 4);
  }
  return { width, height, rgba };
}

function readImage(file) {
  const data = fs.readFileSync(file);
  return /\.dds$/i.test(file) ? readDds(data) : readPng(data);
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data) {
  let c = 0xffffffff;
  for (const v of data) c = CRC[(c ^ v) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function writePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  const chunk = (name, body) => {
    const head = Buffer.alloc(8), tail = Buffer.alloc(4);
    head.writeUInt32BE(body.length, 0); head.write(name, 4, 'ascii');
    tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = { readDds, readPng, readImage, writePng, bc7Block };
