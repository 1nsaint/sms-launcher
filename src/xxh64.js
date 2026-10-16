'use strict';

// XXH64 with seed 0, which the game uses to name texture pack images
// (platform/gx/src/gx_hires.cpp). Returns 16 hex digits.

const M = (1n << 64n) - 1n;
const P1 = 11400714785074694791n, P2 = 14029467366897019727n, P3 = 1609587929392839161n;
const P4 = 9650029242287828579n, P5 = 2870177450012600261n;
const rotl = (x, r) => ((x << BigInt(r)) | (x >> BigInt(64 - r))) & M;
const round = (acc, v) => rotl((acc + v * P2) & M, 31) * P1 & M;
const merge = (acc, v) => (((acc ^ round(0n, v)) * P1 & M) + P4) & M;

function xxh64(bytes) {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length), n = b.length;
  let i = 0, h;
  if (n >= 32) {
    let v1 = (P1 + P2) & M, v2 = P2, v3 = 0n, v4 = (0n - P1) & M;
    for (; i + 32 <= n; i += 32) {
      v1 = round(v1, b.readBigUInt64LE(i)); v2 = round(v2, b.readBigUInt64LE(i + 8));
      v3 = round(v3, b.readBigUInt64LE(i + 16)); v4 = round(v4, b.readBigUInt64LE(i + 24));
    }
    h = (rotl(v1, 1) + rotl(v2, 7) + rotl(v3, 12) + rotl(v4, 18)) & M;
    h = merge(merge(merge(merge(h, v1), v2), v3), v4);
  } else h = P5;
  h = (h + BigInt(n)) & M;
  for (; i + 8 <= n; i += 8) h = ((rotl(h ^ round(0n, b.readBigUInt64LE(i)), 27) * P1 & M) + P4) & M;
  if (i + 4 <= n) { h = ((rotl(h ^ (BigInt(b.readUInt32LE(i)) * P1 & M), 23) * P2 & M) + P3) & M; i += 4; }
  for (; i < n; i++) h = rotl(h ^ (BigInt(b[i]) * P5 & M), 11) * P1 & M;
  h ^= h >> 33n; h = h * P2 & M; h ^= h >> 29n; h = h * P3 & M; h ^= h >> 32n;
  return h.toString(16).padStart(16, '0');
}

module.exports = { xxh64 };
