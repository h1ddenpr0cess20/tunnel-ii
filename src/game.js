// Game state: flying, steering, debris and collisions.
// Positions are in tunnel radii across the tunnel (x, y, measured from its
// middle) and s down it.
import {
  SPAWN_D, M_PER_UNIT, PLAY_R, VMAX, HIT_R, MISS_R, STREAK, pathXY,
} from './constants.js';
import { MESH } from './meshes.js';
import { qAxis, qMul, qNorm, qRot, randomAxis, add, sub, norm, cross, segDist } from './math.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const flySpeed = t => 7 + 9 * (1 - Math.exp(-t / 120));

export const marsLeft = m => 225e6 * Math.pow(0.5, m / 250);   // km

// Meshes (see meshes.js) and finishes (see debris.wgsl).
const { ROCKS, BOX, TRUSS, DISH, CYL, SHARDS } = MESH;
const ROCK = 0, METAL = 1, PANEL = 2, GIRDER = 3, FOIL = 4, PAINT = 5;
const Z_AXIS = [0, 0, 1];

export function createGame(events) {
  const S = {
    mode: 'title', paused: false,
    s: 0, speed: 1.6, runT: 0, start: 0, T: 0,
    x: 0, y: 0, vx: 0, vy: 0, steer: [0, 0], nudge: [0, 0],
    right: [-1, 0], up: [0, 1], bank: 0,
    deb: [], next: 0, id: 1, spawned: 0,
    deathT: 0, kind: '', bounce: 0, shake: 0, flash: 0, fade: 0, fadeTo: 0,
  };
  const seen = {};

  const meters = () => Math.max(0, (S.s - S.start) * M_PER_UNIT);

  // ---- debris ---------------------------------------------------------------
  function debris(kind, x, y, z, o) {
    const d = {
      id: S.id++, kind, x, y, z, vx: 0, vy: 0, orbit: 0,
      q: qAxis(randomAxis(), Math.random() * 6.3), axis: randomAxis(), w: rnd(0.3, 1.2),
      parts: [], cols: [], minD: 1e9, missed: false, seed: Math.random(), ...o,
    };
    S.deb.push(d);
    return d;
  }

  function rock(x, y, z, size, kind = 'rock') {
    const r = size * rnd(0.9, 1.1);
    return debris(kind, x, y, z, {
      parts: [{ mesh: pick(ROCKS), mat: ROCK, off: [0, 0, 0], scl: [r * rnd(0.85, 1.15), r * rnd(0.8, 1.1), r * rnd(0.85, 1.2)] }],
      cols: [{ a: [0, 0, 0], b: [0, 0, 0], r: r * 0.85 }],
      vx: rnd(-0.08, 0.08), vy: rnd(-0.08, 0.08),
    });
  }

  function satellite(z) {
    const a = Math.random() * 6.3, rr = Math.sqrt(Math.random()) * 0.35;
    // Solar wings: two panels a side on a boom from the foil-wrapped body.
    const pl = rnd(0.55, 0.85), seg = (pl - 0.02) / 2, w0 = 0.27;
    const parts = [
      { mesh: BOX, mat: FOIL, off: [0, 0, 0], scl: [0.13, 0.13, 0.17] },
      { mesh: BOX, mat: METAL, off: [0, 0, 0.185], scl: [0.135, 0.135, 0.016] },
      { mesh: BOX, mat: METAL, off: [0, 0, -0.185], scl: [0.135, 0.135, 0.016] },
      { mesh: DISH, mat: PAINT, off: [0.02, 0.03, -0.215], scl: [0.11, 0.11, 0.11] },
      { mesh: CYL, mat: GIRDER, off: [0.02, 0.03, -0.27], scl: [0.006, 0.006, 0.05] },
      { mesh: CYL, mat: GIRDER, off: [0.08, -0.08, 0.3], scl: [0.004, 0.004, 0.12] },
    ];
    for (const side of [-1, 1]) {
      parts.push({ mesh: BOX, mat: GIRDER, off: [side * 0.2, 0, 0], scl: [0.075, 0.01, 0.01] });
      parts.push({ mesh: BOX, mat: PANEL, off: [side * (w0 + seg / 2), 0, 0], scl: [seg / 2, 0.13, 0.008] });
      parts.push({ mesh: BOX, mat: PANEL, off: [side * (w0 + seg * 1.5 + 0.02), 0, 0], scl: [seg / 2, 0.13, 0.008] });
    }
    return debris('satellite', rr * Math.cos(a), rr * Math.sin(a), z, {
      q: qMul(qAxis(Z_AXIS, Math.random() * 6.3), qAxis([1, 0, 0], rnd(0.3, 0.9))),
      axis: Z_AXIS, w: rnd(0.5, 1.1) * (Math.random() < 0.5 ? -1 : 1),
      parts,
      cols: [
        { a: [0, 0, -0.2], b: [0, 0, 0.2], r: 0.17 },
        { a: [0.13, 0, 0], b: [w0 + pl, 0, 0], r: 0.1 },
        { a: [-0.13, 0, 0], b: [-w0 - pl, 0, 0], r: 0.1 },
      ],
    });
  }

  function girder(z) {
    const a = Math.random() * 6.3;
    return debris('girder', rnd(-0.12, 0.12), rnd(-0.12, 0.12), z, {
      q: qAxis(Z_AXIS, a), axis: Z_AXIS, w: rnd(0.25, 0.6) * (Math.random() < 0.5 ? -1 : 1),
      parts: [{ mesh: TRUSS, mat: GIRDER, off: [0, 0, 0], scl: [1, 1, 1] }],
      cols: [{ a: [-1.05, 0, 0], b: [1.05, 0, 0], r: 0.085 }],
    });
  }

  function shard(x, y, z) {
    const sx = rnd(0.12, 0.26), sy = rnd(0.08, 0.18);
    return debris('shard', x, y, z, {
      w: rnd(1, 2.4),
      parts: [{ mesh: pick(SHARDS), mat: pick([PANEL, PANEL, METAL, FOIL]), off: [0, 0, 0], scl: [sx, sy, 0.01] }],
      cols: [{ a: [0, 0, 0], b: [0, 0, 0], r: Math.max(sx, sy) * 0.8 }],
      vx: rnd(-0.15, 0.15), vy: rnd(-0.15, 0.15), orbit: rnd(-0.25, 0.25),
    });
  }

  function inDisc(r = PLAY_R) {
    const a = Math.random() * 6.3, rr = Math.sqrt(Math.random()) * r;
    return [rr * Math.cos(a), rr * Math.sin(a)];
  }

  // One pattern at S.next; returns how deep it is.
  function spawn() {
    const diff = Math.min(1, S.runT / 150);
    const v = Math.max(S.speed, 7);
    const z = S.next;
    let type = ['rock', 'cluster', 'satellite', 'girder', 'belt'][S.spawned];
    if (!type) {
      const r = Math.random();
      type = r < 0.22 ? 'rock' : r < 0.42 ? 'cluster' : r < 0.6 ? 'satellite' : r < 0.74 ? 'girder' : r < 0.87 ? 'belt' : 'shards';
    }
    let depth = 0.5;
    if (type === 'rock') {
      // Right where you are now, give or take.
      const [ox, oy] = inDisc(0.25);
      const x = clamp(S.x + ox, -PLAY_R, PLAY_R), y = clamp(S.y + oy, -PLAY_R, PLAY_R);
      rock(x, y, z, rnd(0.3, 0.5) + 0.1 * diff);
    } else if (type === 'cluster') {
      const n = 3 + Math.floor(Math.random() * (3 + 3 * diff));
      for (let i = 0; i < n; i++) {
        const [x, y] = inDisc(0.85);
        rock(x, y, z + rnd(0, 3), rnd(0.12, 0.26), 'cluster').orbit = rnd(-0.2, 0.2);
      }
      depth = 3;
    } else if (type === 'satellite') {
      satellite(z);
    } else if (type === 'girder') {
      girder(z);
      if (diff > 0.5 && Math.random() < 0.5) { girder(z + rnd(3, 5)); depth = 5; }
    } else if (type === 'belt') {
      // A belt of rocks across the whole tunnel, with one way through.
      const gr = rnd(0.2, 0.55), ga = Math.random() * 6.3;
      const gx = gr * Math.cos(ga), gy = gr * Math.sin(ga);
      const gap = 0.36 - 0.05 * diff;
      const step = 0.32;
      for (let i = -4; i <= 4; i++) {
        for (let j = -4; j <= 4; j++) {
          const x = i * step + rnd(-0.06, 0.06), y = j * step + rnd(-0.06, 0.06);
          if (Math.hypot(x, y) > 1.05) continue;
          if (Math.hypot(x - gx, y - gy) < gap + 0.12) continue;
          const d = rock(x, y, z + rnd(-0.4, 0.4), rnd(0.12, 0.17), 'belt');
          d.vx = d.vy = 0;
        }
      }
      depth = 1;
    } else {
      const n = 6 + Math.floor(Math.random() * 6 * (0.5 + diff));
      for (let i = 0; i < n; i++) {
        const [x, y] = inDisc(0.9);
        shard(x, y, z + rnd(0, 6));
      }
      depth = 6;
    }
    S.spawned++;
    S.next = z + depth + Math.max(7, v * (1.0 - 0.35 * diff) + Math.random() * v * (0.9 - 0.4 * diff));
  }

  function colliders(d) {
    return d.cols.map(c => ({
      a: add([d.x, d.y, d.z], qRot(d.q, c.a)),
      b: add([d.x, d.y, d.z], qRot(d.q, c.b)),
      r: c.r,
    }));
  }

  function moveDebris(dt) {
    for (const d of S.deb) {
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (Math.hypot(d.x, d.y) > 1) { d.vx = -d.vx; d.vy = -d.vy; }
      if (d.orbit) {
        const c = Math.cos(d.orbit * dt), s = Math.sin(d.orbit * dt);
        [d.x, d.y] = [d.x * c - d.y * s, d.x * s + d.y * c];
      }
      d.q = qNorm(qMul(qAxis(d.axis, d.w * dt), d.q));
    }
  }

  // ---- actions --------------------------------------------------------------
  function start() {
    S.mode = 'run'; S.paused = false;
    S.runT = 0; S.start = S.s;
    S.x = 0; S.y = 0; S.vx = 0; S.vy = 0; S.nudge = [0, 0];
    S.deb = []; S.spawned = 0; S.next = S.s + 45;
    S.fadeTo = 0; S.shake = 0; S.flash = 0;
    S.speed = Math.max(S.speed, 3);
    events.start();
  }

  function setPaused(p) {
    if (S.mode !== 'run') return;
    S.paused = p;
    events.pause(p);
  }

  function nudge(dx, dy) {
    if (S.mode !== 'run' || S.paused) return;
    S.nudge[0] += dx; S.nudge[1] += dy;
  }

  function die(kind) {
    S.mode = 'dying'; S.kind = kind; S.deathT = 0;
    S.bounce = Math.min(4, S.speed * 0.35);
    S.speed = 0; S.shake = 1; S.flash = 1; S.fadeTo = 0.85;
    events.die(kind);
  }

  // ---- simulation -----------------------------------------------------------
  function step(dt) {
    // Steering is screen-relative, so it still feels right as the view rolls.
    const [sx, sy] = S.steer;
    const tx = (sx * S.right[0] + sy * S.up[0]) * VMAX;
    const ty = (sx * S.right[1] + sy * S.up[1]) * VMAX;
    const k = 1 - Math.exp(-10 * dt);
    S.vx += (tx - S.vx) * k;
    S.vy += (ty - S.vy) * k;
    const x0 = S.x, y0 = S.y, s0 = S.s;
    S.x += S.vx * dt; S.y += S.vy * dt;
    const r = Math.hypot(S.x, S.y);
    if (r > PLAY_R) {
      S.x *= PLAY_R / r; S.y *= PLAY_R / r;
      const nx = S.x / PLAY_R, ny = S.y / PLAY_R, out = S.vx * nx + S.vy * ny;
      if (out > 0) { S.vx -= out * nx; S.vy -= out * ny; }
    }
    S.s += S.speed * dt;
    moveDebris(dt);

    const p0 = [x0, y0, s0], p1 = [S.x, S.y, S.s];
    for (const d of S.deb) {
      if (Math.abs(d.z - S.s) > 2.5) continue;
      for (const c of colliders(d)) {
        const dist = segDist(p0, p1, c.a, c.b) - c.r;
        if (dist < HIT_R) return die(d.kind);
        if (dist < d.minD) { d.minD = dist; d.side = Math.sign((c.a[0] - S.x) * S.right[0] + (c.a[1] - S.y) * S.right[1]); }
      }
      if (!d.missed && d.z < S.s - 0.6 && d.minD < MISS_R) {
        d.missed = true;
        events.nearMiss(d.side || 0, 1 - d.minD / MISS_R);
      }
    }
  }

  function update(dt) {
    if (S.paused) return;
    S.T += dt;
    S.flash = Math.max(0, S.flash - dt * 2.5);
    S.shake = Math.max(0, S.shake - dt * 2);
    const rate = S.fadeTo > S.fade ? 2.4 : 4;
    S.fade += (S.fadeTo - S.fade) * (1 - Math.exp(-dt * rate));

    // Touch drags move you straight across the screen.
    if (S.nudge[0] || S.nudge[1]) {
      const [nx, ny] = S.nudge;
      S.x += nx * S.right[0] + ny * S.up[0];
      S.y += nx * S.right[1] + ny * S.up[1];
      S.nudge = [0, 0];
    }

    if (S.mode === 'title' || S.mode === 'over') {
      const target = S.mode === 'title' ? 1.6 : 0.6;
      S.speed += (target - S.speed) * (1 - Math.exp(-dt * 2));
      S.s += S.speed * dt;
      S.x *= Math.exp(-dt); S.y *= Math.exp(-dt);
      moveDebris(dt);
      return;
    }

    if (S.mode === 'dying') {
      S.deathT += dt;
      S.bounce *= Math.exp(-dt * 5);
      S.s -= S.bounce * dt;
      moveDebris(dt);
      if (S.deathT > 1.2) {
        S.mode = 'over';
        events.over(S.kind, meters());
      }
      return;
    }

    S.runT += dt;
    S.speed += (flySpeed(S.runT) - S.speed) * (1 - Math.exp(-dt * 1.5));
    let rem = dt;
    while (rem > 1e-6 && S.mode === 'run') {
      const h = Math.min(rem, 1 / 120);
      step(h);
      rem -= h;
    }
    if (S.mode !== 'run') return;
    while (S.next < S.s + SPAWN_D) spawn();
    S.deb = S.deb.filter(d => d.z > S.s - 3);
    for (const d of S.deb) {
      if (!d.seen && d.z - S.s < 40) {
        d.seen = true;
        if (!seen[d.kind]) { seen[d.kind] = true; events.approach(d.kind); }
      }
    }
    events.progress(meters());
  }

  // ---- camera ---------------------------------------------------------------
  // The eye at depth sAbs, relative to `origin` so numbers stay small.
  function eyeAt(sAbs, x, y, roll, origin) {
    const [cx, cy] = pathXY(sAbs);
    const [tx, ty] = pathXY(sAbs + 6);
    const eye = [cx + x, cy + y, sAbs - origin];
    const target = [tx + 0.4 * x, ty + 0.4 * y, sAbs + 6 - origin];
    const fwd = norm(sub(target, eye));
    const up = qRot(qAxis(fwd, roll), [0, 1, 0]);
    return { eye, target, up, fwd };
  }

  function camera(reduceMotion) {
    const drift = reduceMotion ? 0 : 0.45 * Math.sin(S.T * 0.09) + 0.3 * Math.sin(S.T * 0.031 + 1);
    const lateral = S.vx * S.right[0] + S.vy * S.right[1];
    S.bank += (-lateral * 0.1 - S.bank) * 0.1;
    const roll = drift + (reduceMotion ? 0 : S.bank);
    const sh = reduceMotion ? 0 : S.shake * S.shake * 0.06;
    const jx = (Math.random() - 0.5) * sh, jy = (Math.random() - 0.5) * sh;
    const now = eyeAt(S.s, S.x + jx, S.y + jy, roll, S.s);
    // Streaks show the swirl more than your own speed, so near dots stay dots.
    const was = eyeAt(S.s - S.speed * STREAK * 0.3, S.x - S.vx * STREAK, S.y - S.vy * STREAK,
      roll - (reduceMotion ? 0 : 0.45 * 0.09 * Math.cos(S.T * 0.09)) * STREAK, S.s);
    // Screen right and up, across the tunnel, for steering.
    const right = norm(cross(now.fwd, now.up));
    S.right = [right[0], right[1]];
    S.up = [now.up[0], now.up[1]];
    return { now, was };
  }

  // Debris as drawable parts: position relative to the eye's depth, turn, size.
  function parts() {
    const out = [];
    for (const d of S.deb) {
      if (d.z - S.s > SPAWN_D + 2) continue;
      const [cx, cy] = pathXY(d.z);
      const rl = Math.hypot(d.x, d.y) || 1;
      for (const p of d.parts) {
        const o = qRot(d.q, p.off);
        out.push({
          mesh: p.mesh, mat: p.mat, seed: d.seed,
          pos: [cx + d.x + o[0], cy + d.y + o[1], d.z - S.s + o[2]],
          q: d.q, scl: p.scl, radial: [d.x / rl, d.y / rl],
        });
      }
    }
    return out;
  }

  return { S, start, setPaused, nudge, update, camera, parts, meters, spawn, debris: { rock, satellite, girder, shard } };
}
