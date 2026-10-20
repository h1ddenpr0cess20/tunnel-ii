// Debris meshes: three cratered rocks, a rounded box (satellite bodies,
// booms and panels), a lattice truss, a dish, a cylinder and two torn
// shards. One interleaved buffer of position, normal and cavity (how
// tucked away a point is: 1 open, less in craters and cracks), unindexed,
// and where each mesh starts in it.

export const MESH = { ROCKS: [0, 1, 2], BOX: 3, TRUSS: 4, DISH: 5, CYL: 6, SHARDS: [7, 8] };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// A seeded random, so the debris is the same every time.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function randomDir(r) {
  const z = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - z * z);
  return [q * Math.cos(a), q * Math.sin(a), z];
}

// A mesh is a list of triangles, each three vertices of [position, normal, cavity].
const V = (p, n, c = 1) => [p, n, c];

// Triangles with one flat normal each, facing away from `inside` if given.
function flat(tris, a, b, c, inside = null) {
  let n = norm(cross(sub(b, a), sub(c, a)));
  if (inside && dot(n, sub(a, inside)) < 0) n = n.map(x => -x);
  tris.push([V(a, n), V(b, n), V(c, n)]);
}

function icosphere(level) {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map(norm);
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let i = 0; i < level; i++) {
    const cache = new Map();
    const mid = (a, b) => {
      const k = a < b ? a * 65536 + b : b * 65536 + a;
      if (!cache.has(k)) cache.set(k, v.push(norm(v[a].map((c, j) => (c + v[b][j]) / 2))) - 1);
      return cache.get(k);
    };
    f = f.flatMap(([a, b, c]) => {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]];
    });
  }
  return { v, f };
}

// A rock: lumpy, cratered, rough, with smooth normals.
function rock(seed) {
  const r = rng(seed);
  const { v, f } = icosphere(4);
  const lumps = Array.from({ length: 10 }, () => ({ d: randomDir(r), k: (r() - 0.45) * 0.45, w: 2 + r() * 7 }));
  const craters = Array.from({ length: 9 + Math.floor(r() * 6) }, () => ({
    d: randomDir(r), rad: 0.12 + Math.pow(r(), 2) * 0.35, depth: 0.05 + r() * 0.08,
  }));
  const waves = Array.from({ length: 14 }, () => ({ d: randomDir(r), f: 6 + r() * 16, p: r() * 6.3, a: 0.004 + r() * 0.008 }));
  const cav = [];
  const pts = v.map(p => {
    let base = 1;
    for (const b of lumps) base += b.k * Math.exp(-b.w * (1 - dot(p, b.d)));
    let detail = 0;
    for (const c of craters) {
      const d = Math.acos(Math.min(1, dot(p, c.d))) / c.rad;
      if (d < 1) detail -= c.depth * (1 - d * d);
      detail += c.depth * 0.5 * Math.exp(-(((d - 1) / 0.28) ** 2));
    }
    for (const w of waves) detail += w.a * Math.sin(dot(p, w.d) * w.f + w.p);
    cav.push(Math.min(1, Math.max(0.3, 1 + detail * 5)));
    return p.map(c => c * (base + detail));
  });
  const nrm = pts.map(() => [0, 0, 0]);
  for (const [a, b, c] of f) {
    const n = cross(sub(pts[b], pts[a]), sub(pts[c], pts[a]));
    for (const i of [a, b, c]) for (let k = 0; k < 3; k++) nrm[i][k] += n[k];
  }
  return f.map(t => t.map(i => V(pts[i], norm(nrm[i]), cav[i])));
}

// A box with rounded edges, so its edges catch the light.
function roundedBox(b = 0.2) {
  const us = [-1, -0.985, -0.95, -0.9, -0.85, -0.8, -0.4, 0, 0.4, 0.8, 0.85, 0.9, 0.95, 0.985, 1];
  const tris = [];
  const shape = p => {
    const c = p.map(x => Math.max(-(1 - b), Math.min(1 - b, x)));
    const n = norm(sub(p, c));
    return V(c.map((x, i) => x + b * n[i]), n);
  };
  for (let axis = 0; axis < 3; axis++) {
    for (const side of [-1, 1]) {
      const at = (i, j) => {
        const p = [0, 0, 0];
        p[axis] = side; p[(axis + 1) % 3] = us[i]; p[(axis + 2) % 3] = us[j];
        return shape(p);
      };
      for (let i = 0; i < us.length - 1; i++) {
        for (let j = 0; j < us.length - 1; j++) {
          const a = at(i, j), bb = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
          tris.push(side > 0 ? [a, bb, c] : [a, c, bb], side > 0 ? [a, c, d] : [a, d, c]);
        }
      }
    }
  }
  return tris;
}

// A straight member from a to b, square in section.
function member(tris, a, b, t) {
  const d = norm(sub(b, a));
  const up = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(d, up)), w = cross(d, u);
  const corner = (p, su, sw) => p.map((x, i) => x + t * (su * u[i] + sw * w[i]));
  const ring = p => [corner(p, -1, -1), corner(p, 1, -1), corner(p, 1, 1), corner(p, -1, 1)];
  const A = ring(a), B = ring(b);
  const mid = a.map((x, i) => (x + b[i]) / 2);
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    flat(tris, A[k], A[k1], B[k1], mid);
    flat(tris, A[k], B[k1], B[k], mid);
  }
  flat(tris, A[0], A[1], A[2], mid); flat(tris, A[0], A[2], A[3], mid);
  flat(tris, B[0], B[1], B[2], mid); flat(tris, B[0], B[2], B[3], mid);
}

// A lattice girder along x: four rails, a frame at every bay, a diagonal on every side of every bay.
function truss() {
  const tris = [];
  const L = 1.05, h = 0.065, bays = 14;
  const rail = [[-h, -h], [h, -h], [h, h], [-h, h]];
  for (const [y, z] of rail) member(tris, [-L, y, z], [L, y, z], 0.011);
  for (let i = 0; i <= bays; i++) {
    const x = -L + (2 * L * i) / bays;
    for (let k = 0; k < 4; k++) {
      const [y0, z0] = rail[k], [y1, z1] = rail[(k + 1) % 4];
      member(tris, [x, y0, z0], [x, y1, z1], 0.006);
      if (i < bays) {
        const x1 = -L + (2 * L * (i + 1)) / bays;
        if ((i + k) % 2) member(tris, [x, y0, z0], [x1, y1, z1], 0.005);
        else member(tris, [x1, y0, z0], [x, y1, z1], 0.005);
      }
    }
  }
  return tris;
}

// A dish, opening towards -z, with a back.
function dish() {
  const tris = [];
  const rings = 10, segs = 28, k = 0.45;
  const at = (i, j, back) => {
    const r = i / rings, a = (j / segs) * Math.PI * 2;
    const x = r * Math.cos(a), y = r * Math.sin(a);
    const n = norm([x * 2 * k, y * 2 * k, 1]);
    const z = -k * r * r + (back ? 0.04 : 0);
    return V([x, y, z], back ? n : n.map(c => -c), back ? 1 : 0.75 + 0.25 * r);
  };
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      for (const back of [false, true]) {
        const a = at(i, j, back), b = at(i + 1, j, back), c = at(i + 1, j + 1, back), d = at(i, j + 1, back);
        tris.push(back ? [a, b, c] : [a, c, b], back ? [a, c, d] : [a, d, c]);
      }
    }
  }
  return tris;
}

// A cylinder along z, radius 1, from -1 to 1, capped.
function cylinder() {
  const tris = [];
  const segs = 16;
  for (let j = 0; j < segs; j++) {
    const a0 = (j / segs) * Math.PI * 2, a1 = ((j + 1) / segs) * Math.PI * 2;
    const p = (a, z) => [Math.cos(a), Math.sin(a), z];
    const n0 = [Math.cos(a0), Math.sin(a0), 0], n1 = [Math.cos(a1), Math.sin(a1), 0];
    tris.push([V(p(a0, -1), n0), V(p(a1, -1), n1), V(p(a1, 1), n1)], [V(p(a0, -1), n0), V(p(a1, 1), n1), V(p(a0, 1), n0)]);
    tris.push([V([0, 0, 1], [0, 0, 1]), V(p(a0, 1), [0, 0, 1]), V(p(a1, 1), [0, 0, 1])]);
    tris.push([V([0, 0, -1], [0, 0, -1]), V(p(a1, -1), [0, 0, -1]), V(p(a0, -1), [0, 0, -1])]);
  }
  return tris;
}

// A torn plate: a jagged outline, thin, with ragged edges.
function shardMesh(seed) {
  const r = rng(seed);
  const n = 9;
  const outline = Array.from({ length: n }, (_, i) => {
    const a = ((i + r() * 0.6) / n) * Math.PI * 2;
    const rad = i % 2 ? 0.55 + r() * 0.25 : 0.85 + r() * 0.15;
    return [rad * Math.cos(a), rad * Math.sin(a)];
  });
  const tris = [];
  const top = outline.map(([x, y]) => [x, y, 1]), bot = outline.map(([x, y]) => [x, y, -1]);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tris.push([V([0, 0, 1], [0, 0, 1]), V(top[i], [0, 0, 1]), V(top[j], [0, 0, 1])]);
    tris.push([V([0, 0, -1], [0, 0, -1]), V(bot[j], [0, 0, -1]), V(bot[i], [0, 0, -1])]);
    flat(tris, top[i], bot[i], bot[j], [0, 0, 0]);
    flat(tris, top[i], bot[j], top[j], [0, 0, 0]);
  }
  return tris;
}

export function buildMeshes() {
  const meshes = [rock(7), rock(1234), rock(98765), roundedBox(), truss(), dish(), cylinder(), shardMesh(5), shardMesh(77)];
  const out = [];
  const ranges = [];
  for (const tris of meshes) {
    ranges.push({ first: out.length / 7, count: tris.length * 3 });
    for (const tri of tris) for (const [p, nn, c] of tri) out.push(p[0], p[1], p[2], nn[0], nn[1], nn[2], c);
  }
  return { data: new Float32Array(out), ranges };
}
