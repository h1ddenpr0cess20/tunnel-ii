// Space debris: cratered rocks, dead satellites, lattice girders and torn
// shards.
//
// Lit by a cold key light from behind you, by the glittering walls round
// them (light from outside the tunnel inwards), and from behind by Mars,
// which rims them red. Metal and solar cells reflect the vortex. Fine detail
// (grain, bumps, crinkled foil, panel seams, cells) is worked out here per
// pixel in the debris's own space, so it stays put as they tumble. They come
// out of the dark.

struct U {
  vp: mat4x4f,
  a: vec4f,           // time, fade-in start, fade-in end, unused
  mars: vec4f,        // direction to Mars, strength
};
struct Inst {
  pos: vec4f,         // xyz, finish (0 rock, 1 painted metal, 2 solar cells, 3 girder, 4 foil, 5 white paint)
  q: vec4f,           // turn
  scl: vec4f,         // size xyz, seed
  rad: vec4f,         // xy: out from the tunnel's middle; zw: unused
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<uniform> inst: array<Inst, 256>;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) n: vec3f,
  @location(1) w: vec3f,
  @location(2) l: vec3f,
  @location(3) cav: f32,
  @location(4) @interpolate(flat) i: u32,
};

fn qrot(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

@vertex
fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) cav: f32, @builtin(instance_index) ii: u32) -> VO {
  let it = inst[ii];
  let w = it.pos.xyz + qrot(it.q, p * it.scl.xyz);
  var o: VO;
  o.pos = u.vp * vec4f(w, 1.0);
  o.n = qrot(it.q, n / it.scl.xyz);
  o.w = w;
  o.l = p * it.scl.xyz;
  o.cav = cav;
  o.i = ii;
  return o;
}

fn hash(p: vec3f) -> f32 {
  let q = fract(p * 0.3183099 + vec3f(0.1, 0.2, 0.3)) * 17.0;
  return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}
fn noise(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3f(1.0, 0.0, 0.0)), w.x),
        mix(hash(i + vec3f(0.0, 1.0, 0.0)), hash(i + vec3f(1.0, 1.0, 0.0)), w.x), w.y),
    mix(mix(hash(i + vec3f(0.0, 0.0, 1.0)), hash(i + vec3f(1.0, 0.0, 1.0)), w.x),
        mix(hash(i + vec3f(0.0, 1.0, 1.0)), hash(i + vec3f(1.0, 1.0, 1.0)), w.x), w.y), w.z);
}
fn fbm(p: vec3f) -> f32 {
  return 0.5 * noise(p) + 0.25 * noise(p * 2.03 + 3.1) + 0.125 * noise(p * 4.07 + 7.7);
}
// Bumps: tilt the normal down the slope of a noise field.
fn bump(n: vec3f, p: vec3f, k: f32) -> vec3f {
  let e = 0.06;
  let h = fbm(p);
  let g = vec3f(fbm(p + vec3f(e, 0.0, 0.0)) - h, fbm(p + vec3f(0.0, e, 0.0)) - h, fbm(p + vec3f(0.0, 0.0, e)) - h) / e;
  return normalize(n - k * (g - n * dot(g, n)));
}
// Fine bumps: the same with one octave, which is plenty this small.
fn grain(n: vec3f, p: vec3f, k: f32) -> vec3f {
  let e = 0.08;
  let h = noise(p);
  let g = vec3f(noise(p + vec3f(e, 0.0, 0.0)) - h, noise(p + vec3f(0.0, e, 0.0)) - h, noise(p + vec3f(0.0, 0.0, e)) - h) / e;
  return normalize(n - k * (g - n * dot(g, n)));
}
// What metal and glass see: the bright walls all round, darker down the tunnel.
fn env(r: vec3f, out: vec3f) -> f32 {
  let side = 1.0 - abs(r.z);
  return 0.08 + 0.9 * pow(max(dot(r, out), 0.0), 3.0) + 0.35 * side * side;
}

@fragment
fn fs(in: VO) -> @location(0) vec4f {
  let it = inst[in.i];
  let mat = i32(it.pos.w + 0.5);
  let seed = it.scl.w * 37.0;
  var n = normalize(in.n);
  let v = normalize(-in.w);
  if (dot(n, v) < 0.0 && mat >= 2) { n = -n; }   // thin plates show both faces
  let out = normalize(vec3f(it.rad.xy, 0.0001));
  let lp = in.l;

  var albedo = vec3f(0.5);
  var spec = 0.04;          // reflectance
  var shine = 16.0;
  var cav = in.cav;

  if (mat == 0) {
    // Rock: grainy, speckled, pitted.
    let g = fbm(lp * 7.0 + seed);
    let speck = smoothstep(0.62, 0.7, noise(lp * 38.0 + seed));
    albedo = vec3f(0.16 + 0.16 * g + 0.12 * speck);
    n = bump(n, lp * 9.0 + seed, 0.55);
    n = grain(n, lp * 30.0 + seed, 0.12);
    spec = 0.03;
    shine = 10.0;
    cav *= 0.75 + 0.25 * g;
  } else if (mat == 1) {
    // Painted metal with panel seams.
    let s = abs(fract(lp * 9.0) - 0.5);
    albedo = vec3f(0.42) * (0.85 + 0.15 * fbm(lp * 12.0 + seed));
    albedo *= select(1.0, 0.45, min(s.x, min(s.y, s.z)) < 0.025);
    spec = 0.25;
    shine = 40.0;
  } else if (mat == 2) {
    // Solar cells: dark glass in a silver grid.
    let c = abs(fract(lp.xy * 26.0) - 0.5);
    let grid = 1.0 - smoothstep(0.035, 0.06, min(c.x, c.y));
    albedo = mix(vec3f(0.03, 0.035, 0.045), vec3f(0.55), grid);
    spec = mix(0.35, 0.3, grid);
    shine = mix(120.0, 30.0, grid);
    n = bump(n, vec3f(floor(lp.xy * 26.0), seed), 0.06);
  } else if (mat == 3) {
    // Girder: worn metal.
    albedo = vec3f(0.35 + 0.15 * fbm(lp * 20.0 + seed));
    spec = 0.35;
    shine = 30.0;
  } else if (mat == 4) {
    // Foil: crinkled, very shiny.
    albedo = vec3f(0.55);
    n = grain(n, lp * 28.0 + seed, 0.7);
    spec = 0.75;
    shine = 70.0;
  } else {
    // White paint.
    albedo = vec3f(0.78);
    spec = 0.1;
    shine = 24.0;
  }

  let key = normalize(vec3f(0.35, 0.6, -0.72));
  let diff = max(dot(n, key), 0.0) * 1.05 + 0.5 * max(dot(n, out), 0.0) + 0.06;
  var col = albedo * diff * (1.0 - spec * 0.6) * cav;

  let h = normalize(key + v);
  let r = reflect(-v, n);
  let fres = spec + (1.0 - spec) * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  col += vec3f(1.0) * pow(max(dot(n, h), 0.0), shine) * spec * 2.5 * cav;
  col += vec3f(env(r, out)) * fres * select(0.15, 0.6, spec > 0.2) * cav;

  // Edges: a cold rim from the walls, a red one from Mars behind.
  let edge = pow(1.0 - abs(dot(n, v)), 3.0);
  col += vec3f(0.12 * edge);
  let back = pow(max(dot(n, u.mars.xyz), 0.0), 2.0) * edge;
  col += vec3f(1.0, 0.36, 0.16) * back * u.mars.w * 1.4;

  let fade = 1.0 - smoothstep(u.a.y, u.a.z, in.w.z);
  return vec4f(col * fade, 1.0);
}
