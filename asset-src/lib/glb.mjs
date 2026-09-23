/**
 * Minimal GLB container helpers for the asset build scripts. They read and write the JSON
 * and BIN chunks only; meshopt-compressed buffers pass through untouched, so a script can
 * add glTF extensions without decoding geometry.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

export function readGlb(path) {
  const bytes = readFileSync(path);
  if (bytes.readUInt32LE(0) !== MAGIC) throw new Error(`${path} is not a GLB`);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK) json = JSON.parse(data.toString('utf8'));
    else if (type === BIN_CHUNK) bin = Buffer.from(data);
    offset += 8 + length;
  }
  return { json, bin };
}

function pad(buffer, fill) {
  const extra = (4 - (buffer.length % 4)) % 4;
  return extra ? Buffer.concat([buffer, Buffer.alloc(extra, fill)]) : buffer;
}

export function encodeGlb({ json, bin }) {
  const jsonChunk = pad(Buffer.from(JSON.stringify(json), 'utf8'), 0x20);
  const binChunk = bin ? pad(bin, 0) : null;
  const total = 12 + 8 + jsonChunk.length + (binChunk ? 8 + binChunk.length : 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const parts = [header, chunkHeader(jsonChunk.length, JSON_CHUNK), jsonChunk];
  if (binChunk) parts.push(chunkHeader(binChunk.length, BIN_CHUNK), binChunk);
  return Buffer.concat(parts);
}

function chunkHeader(length, type) {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(length, 0);
  header.writeUInt32LE(type, 4);
  return header;
}

export function writeGlb(path, glb) {
  writeFileSync(path, encodeGlb(glb));
}

/** World matrices (column-major 4x4 arrays) for every node, from the scene roots. */
export function nodeWorldMatrices(json) {
  const world = new Array(json.nodes.length).fill(null);
  const visit = (index, parent) => {
    const local = nodeMatrix(json.nodes[index]);
    world[index] = parent ? multiply(parent, local) : local;
    for (const child of json.nodes[index].children ?? []) visit(child, world[index]);
  };
  for (const root of json.scenes[json.scene ?? 0].nodes) visit(root, null);
  return world;
}

export function nodeMatrix(node) {
  if (node.matrix) return node.matrix.slice();
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * sx,
    2 * (xy + wz) * sx,
    2 * (xz - wy) * sx,
    0,
    2 * (xy - wz) * sy,
    (1 - 2 * (xx + zz)) * sy,
    2 * (yz + wx) * sy,
    0,
    2 * (xz + wy) * sz,
    2 * (yz - wx) * sz,
    (1 - 2 * (xx + yy)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}

export function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let col = 0; col < 4; col++)
    for (let row = 0; row < 4; row++)
      for (let k = 0; k < 4; k++) out[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
  return out;
}

/** A world point in a node's local frame, for rigid (rotation + translation) matrices. */
export function toLocal(matrix, point) {
  const d = [point[0] - matrix[12], point[1] - matrix[13], point[2] - matrix[14]];
  // Inverse of an orthonormal rotation is its transpose.
  return [0, 1, 2].map((axis) =>
    round(matrix[axis * 4] * d[0] + matrix[axis * 4 + 1] * d[1] + matrix[axis * 4 + 2] * d[2], 5),
  );
}

export function round(value, digits = 5) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
