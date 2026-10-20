// Debris meshes, flat shaded: three lumpy rocks and a box (for satellites,
// panels, girders and shards). One interleaved buffer of position and
// normal, unindexed, and where each mesh starts in it.

function icosphere(level) {
  const t = (1 + Math.sqrt(5)) / 2;
  let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map(p => { const l = Math.hypot(...p); return p.map(c => c / l); });
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let i = 0; i < level; i++) {
    const cache = new Map();
    const mid = (a, b) => {
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      if (!cache.has(k)) {
        const p = v[a].map((c, j) => (c + v[b][j]) / 2);
        const l = Math.hypot(...p);
        cache.set(k, v.push(p.map(c => c / l)) - 1);
      }
      return cache.get(k);
    };
    f = f.flatMap(([a, b, c]) => {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]];
    });
  }
  return { v, f };
}

// A seeded random, so the rocks are the same every time.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function rock(seed) {
  const r = rng(seed);
  const { v, f } = icosphere(2);
  // Lumps and dents: a few big bumps and some chips.
  const bumps = Array.from({ length: 9 }, () => {
    const z = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - z * z);
    return { d: [q * Math.cos(a), q * Math.sin(a), z], k: (r() - 0.45) * 0.5, w: 3 + r() * 8 };
  });
  const pts = v.map(p => {
    let h = 1;
    for (const b of bumps) {
      const c = p[0] * b.d[0] + p[1] * b.d[1] + p[2] * b.d[2];
      h += b.k * Math.exp(-b.w * (1 - c));
    }
    h += (r() - 0.5) * 0.12;
    return p.map(c => c * h);
  });
  return f.map(t => t.map(i => pts[i]));
}

function box() {
  const tris = [];
  const faces = [
    [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]],
    [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]],
    [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]],
    [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]],
    [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
    [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]],
  ];
  for (const [a, b, c, d] of faces) tris.push([a, b, c], [a, c, d]);
  return tris;
}

export function buildMeshes() {
  const meshes = [rock(7), rock(1234), rock(98765), box()];
  const out = [];
  const ranges = [];
  for (const tris of meshes) {
    ranges.push({ first: out.length / 6, count: tris.length * 3 });
    for (const [a, b, c] of tris) {
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const l = Math.hypot(...n) || 1;
      n = n.map(x => x / l);
      // Face outwards.
      const cen = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      if (n[0] * cen[0] + n[1] * cen[1] + n[2] * cen[2] < 0) n = n.map(x => -x);
      for (const p of [a, b, c]) out.push(p[0], p[1], p[2], n[0], n[1], n[2]);
    }
  }
  return { data: new Float32Array(out), ranges };
}
