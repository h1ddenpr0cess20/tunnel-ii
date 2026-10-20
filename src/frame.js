// One frame's worth of uniforms, packed once for either renderer. The
// layouts match the uniform structs in src/shaders (WGSL and std140 GLSL alike).
import { FAR, NEAR, WINDOW, SPAWN_D, MARS_D, STREAK, K, pathXY, phases } from './constants.js';
import { perspective, lookAt, mul, project, norm, sub } from './math.js';

export const MAX_INST = 256;   // 16 KB of instances: the most a WebGL 2 uniform block is sure to hold
export const SIZES = { particles: 76, debris: 24, inst: MAX_INST * 16, mars: 8, post: 8 };

const BUNDLES = 30, STRANDS = 8;   // strands per bundle
const DUST = 0.07;                 // share of particles that are loose dust
const TAU = Math.PI * 2;

export function createFrame() {
  return {
    particles: new Float32Array(SIZES.particles),
    debris: new Float32Array(SIZES.debris),
    inst: new Float32Array(SIZES.inst),
    mars: new Float32Array(SIZES.mars),
    post: new Float32Array(SIZES.post),
    groups: [], count: 0, spin: 0,
    proj: new Float32Array(16), view: new Float32Array(16), pview: new Float32Array(16),
    vp: new Float32Array(16), pvp: new Float32Array(16), ph: new Float64Array(12),
  };
}

// How big Mars looks: a little bigger the further you get, never close.
export const marsSize = m => 0.02 + 0.05 * (1 - Math.exp(-m / 3000));

export function packFrame(f, { game, view, t, dt, count, reduceMotion, gain, meters }) {
  const S = game.S;
  const { now, was } = game.camera(reduceMotion);
  const aspect = view.w / view.h;
  const tanY = Math.min(1.25, Math.max(0.62, 0.55 / aspect));
  perspective(f.proj, tanY, aspect, 0.05, 1000);
  mul(f.vp, f.proj, lookAt(f.view, now.eye, now.target, now.up));
  mul(f.pvp, f.proj, lookAt(f.pview, was.eye, was.target, was.up));

  // The vortex spins a little faster the faster you go.
  const rate = reduceMotion ? 0.12 : 0.32 + 0.025 * S.speed;
  f.spin = (f.spin + rate * dt) % TAU;

  const P = f.particles;
  P.set(f.vp, 0);
  P.set(f.pvp, 16);
  const nDust = Math.floor(count * DUST);
  const per = Math.max(1, Math.floor((count - nDust) / (BUNDLES * STRANDS)));
  f.count = nDust + per * BUNDLES * STRANDS;
  const off = S.s - NEAR;
  P.set([view.w, view.h, t % 1000, view.dpr], 32);
  P.set([((off % WINDOW) + WINDOW) % WINDOW, Math.floor(off / WINDOW), f.spin, f.spin - rate * STREAK], 36);
  P.set([WINDOW, NEAR, FAR, gain], 40);
  P.set([count, BUNDLES, STRANDS, per], 44);
  P.set([view.h / 2 / tanY, view.h * 0.014, DUST, S.speed * STREAK * 0.3], 48);
  P.set(phases(S.s, f.ph), 52);
  P.set(K, 64);

  // Mars, far down the tunnel.
  const [mx, my] = pathXY(S.s + MARS_D);
  const mPos = [mx, my, MARS_D];
  const mc = project(f.vp, mPos);
  const R = marsSize(meters) * MARS_D;
  const rNdc = mc[2] > 0 ? R / tanY / mc[2] : 0;
  f.mars.set([mc[0], mc[1], rNdc, aspect, S.T * 0.03, 1, rNdc * view.h / 2, 0]);

  // Debris, grouped by mesh.
  const D = f.debris;
  D.set(f.vp, 0);
  D.set([t % 1000, SPAWN_D * 0.55, SPAWN_D * 0.98, 0], 16);
  D.set([...norm(sub(mPos, now.eye)), 0.9], 20);
  const parts = game.parts().slice(0, MAX_INST).sort((a, b) => a.mesh - b.mesh);
  f.groups.length = 0;
  parts.forEach((p, i) => {
    f.inst.set([p.pos[0], p.pos[1], p.pos[2], p.mat, ...p.q, ...p.scl, p.seed, p.radial[0], p.radial[1], 0, 0], i * 16);
    const g = f.groups[f.groups.length - 1];
    if (g && g.mesh === p.mesh) g.count++;
    else f.groups.push({ mesh: p.mesh, first: i, count: 1 });
  });

  f.post.set([1.8, 0.38, S.flash, S.fade, view.w, view.h, t % 100, 0]);
  return f;
}
