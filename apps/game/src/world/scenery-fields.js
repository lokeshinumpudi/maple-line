const smooth = (x) => {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
};

// World-coordinate fields are independent of chunk traversal and RNG consumption.
export function sceneryHash(x, z, seed = 431) {
  let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function noise(x, z, seed) {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  const fx = smooth(x - ix),
    fz = smooth(z - iz);
  const a = sceneryHash(ix, iz, seed),
    b = sceneryHash(ix + 1, iz, seed);
  const c = sceneryHash(ix, iz + 1, seed),
    d = sceneryHash(ix + 1, iz + 1, seed);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}

export function sceneryFields(x, z, seed = 431) {
  const moisture = noise(x / 115, z / 150, seed + 17);
  const grove = noise(x / 48, z / 72, seed + 53) * 0.7 + noise(x / 135, z / 190, seed + 97) * 0.3;
  return { moisture, grove, forestDensity: 0.22 + 0.78 * smooth((grove - 0.24) / 0.43) };
}

export function inForestGrove(x, z, seed = 431) {
  return (
    sceneryHash(Math.floor(x * 16), Math.floor(z * 16), seed + 809) <
    sceneryFields(x, z, seed).forestDensity
  );
}
