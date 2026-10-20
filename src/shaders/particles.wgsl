// The vortex: glittering streams of light spiralling down the tunnel.
//
// Every particle is made up here from its index alone. Streams come in
// tight bundles that all twist the same way round the tunnel, winding
// tighter the deeper they go and opening out a little, so they wrap round
// the middle like water down a drain. No two bundles wind alike: each has
// its own twist and its own slow waves along it, in and out and round,
// which roll down it as time goes by, and its strands braid; the bundles
// bunch up round the tunnel, and the whole funnel leans this way and that.
// The spiral's shape is held to your view and the particles flow along it
// as you fly. Each particle is drawn as
// a short streak from where it is now to where it was STREAK seconds ago.
// Far away they fade to nothing: the black hole at the centre.
//
// Space: x right, y up, z forward, relative to the eye's depth.

struct U {
  vp: mat4x4f,        // view-projection now
  pvp: mat4x4f,       // and STREAK seconds ago
  a: vec4f,           // resolution.xy, time, device pixel ratio
  b: vec4f,           // window offset (s - near mod window), window cycle, spin now, spin then
  c: vec4f,           // window, near, far, gain
  d: vec4f,           // particle count, bundles, strands per bundle, particles per strand
  e: vec4f,           // focal length px, longest streak px, share of loose dust, depth moved in STREAK
  p: array<vec4f, 3>, // phases (s * K + K0) mod 2π
  k: array<vec4f, 3>, // wave numbers K
};
@group(0) @binding(0) var<uniform> u: U;

const TAU = 6.2831853;
const WIND = 0.011;   // how much tighter the spiral winds with depth
const OPEN = 0.035;   // how much wider the funnel gets with depth

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) q: vec2f,                         // pixels along and across the streak
  @location(1) @interpolate(flat) f: vec4f,      // half length, radius, intensity
};

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rnd(v: u32) -> f32 { return f32(pcg(v)) / 4294967296.0; }

fn P(i: u32) -> f32 { return u.p[i / 4u][i % 4u]; }
fn K(i: u32) -> f32 { return u.k[i / 4u][i % 4u]; }
fn wave(i: u32, z: f32) -> f32 { return sin(P(i) + z * K(i)); }

fn centre(z: f32) -> vec2f {
  return vec2f(1.8 * wave(0u, z) + 0.7 * wave(1u, z) + 0.6 * wave(9u, z),
               1.2 * wave(2u, z) + 0.5 * wave(3u, z) + 0.5 * wave(10u, z));
}

// A stream's shape: where round the tunnel and how far out, before twisting.
struct Stream {
  th: f32, r: f32,
  twist: f32, wind: f32,       // radians per unit of depth, and per unit squared
  wa: f32, wf: f32, ws: f32,   // its wave: how far, how often along it, how fast
  wob: f32, braid: f32, strm: f32,
};

// Where on its stream a particle is at depth z, with the vortex turned by spin.
fn place(st: Stream, z: f32, spin: f32, t: f32) -> vec3f {
  let wave = st.wa * sin(z * st.wf + st.wob + t * st.ws);
  let braid = 0.05 / st.r * sin(z * 0.8 + st.braid + t * 1.1);
  let wb = 0.35 * sin(P(8u) + z * K(8u) + st.wob);
  let ang = st.th + spin + st.strm * (st.twist * z + st.wind * z * z + wave + braid + wb);
  let swell = 1.0 + st.strm * (OPEN * z + 0.16 * sin(z * st.wf * 1.3 + st.wob * 1.7 - t * st.ws * 0.8));
  let lean = vec2f(sin(t * 0.071 + 1.0), sin(t * 0.053 + 2.0)) * 0.1 * z;
  return vec3f(centre(z) + lean + st.r * swell * vec2f(cos(ang), sin(ang)), z);
}

fn none() -> VO {
  var o: VO;
  o.pos = vec4f(2.0, 2.0, 2.0, 1.0);
  o.q = vec2f(0.0);
  o.f = vec4f(0.0);
  return o;
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let res = u.a.xy;
  let W = u.c.x;
  let nDust = u32(u.d.x * u.e.z);

  var zoff: f32;
  var r: f32;
  var th: f32;
  var size: f32;
  var bright: f32;
  var spinMul = 1.0;
  var st = Stream(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);

  if (ii < nDust) {
    // Loose dust, everywhere, including the open middle you fly through.
    let h = ii * 4u + 17u;
    zoff = rnd(h) * W;
    r = 0.12 + 2.4 * sqrt(rnd(h + 1u));
    th = rnd(h + 2u) * TAU;
    size = 0.004 + 0.006 * rnd(h + 3u);
    bright = 0.25 + 0.75 * pow(rnd(h + 9u), 3.0);
    spinMul = 0.35;
  } else {
    let j = ii - nDust;
    let per = u32(u.d.w);
    let strand = j / per;
    let n = j % per;
    let bundle = strand / u32(u.d.z);
    let hb = bundle * 8u + 1000003u;
    let hs = strand * 8u + 2000003u;
    let hp = j * 4u + 3000017u;
    // Bundle: where round the tunnel (bunched up), how deep in the walls, how it winds and waves.
    let shell = pow(rnd(hb + 1u), 1.7);
    r = 1.02 + 1.3 * shell;
    th = rnd(hb) * TAU;
    th += 0.35 * sin(th * 3.0 + 1.3);
    st.twist = mix(0.1, 0.28, rnd(hb + 2u));
    st.wind = WIND * mix(0.55, 1.45, rnd(hb + 4u));
    st.wob = rnd(hb + 3u) * TAU;
    st.wa = 0.2 + 0.4 * rnd(hb + 5u);
    st.wf = 0.12 + 0.28 * rnd(hb + 6u);
    st.ws = (0.3 + 0.7 * rnd(hb + 7u)) * select(-1.0, 1.0, rnd(hb + 9u) < 0.7);
    st.braid = rnd(hs + 4u) * TAU;
    st.strm = 1.0;
    // Strand within its bundle.
    th += (rnd(hs) - 0.5) * 0.09 / r;
    r += (rnd(hs + 1u) - 0.5) * 0.07;
    // Particle along its strand, a little scattered.
    zoff = fract((f32(n) + 0.85 * rnd(hp)) / f32(per) + rnd(hs + 2u)) * W;
    let fray = select(1.0, 7.0, rnd(hp + 1u) < 0.06);
    th += (rnd(hp + 2u) - 0.5) * 0.025 * fray;
    r += (rnd(hp + 3u) - 0.5) * 0.03 * fray;
    size = (0.005 + 0.008 * rnd(hp + 5u)) * (1.0 + 0.3 * shell);
    bright = (0.3 + 0.7 * pow(rnd(hp + 6u), 2.5)) * (1.0 - 0.35 * shell) * (0.6 + 0.4 * rnd(hs + 3u));
    // A few glints, much brighter than the rest.
    bright *= select(1.0, 4.0, rnd(hp + 7u) < 0.04);
  }

  // Depth: each particle repeats every W along the tunnel; take the copy in the window.
  var a = zoff - u.b.x;
  if (a < 0.0) { a = a + W; }
  let z = a - u.c.y;

  // Round the tunnel: the spiral, its waves, and the whole vortex spinning.
  st.th = th;
  st.r = r;
  let t = u.a.z;
  let pNow = place(st, z, u.b.z * spinMul, t);
  var pThen = place(st, z + u.e.w, u.b.w * spinMul, t);
  pThen.z = z;

  let ca = u.vp * vec4f(pNow, 1.0);
  if (ca.w < 0.06) { return none(); }
  var cb = u.pvp * vec4f(pThen, 1.0);
  if (cb.w < 0.06) { cb = ca; }
  let A = (ca.xy / ca.w * 0.5 + 0.5) * res;
  var B = (cb.xy / cb.w * 0.5 + 0.5) * res;

  // Twinkle, and fade in near the eye and out towards the black hole.
  let tw8 = 0.55 + 0.45 * sin(t * (2.0 + 5.0 * rnd(ii + 77u)) + rnd(ii + 78u) * TAU);
  let fade = smoothstep(0.3, 2.5, z) * pow(1.0 - smoothstep(u.c.z * 0.3, u.c.z, z), 1.2);
  let rTrue = size * u.e.x / ca.w;
  let minR = 0.75 * u.a.w;
  let rad = clamp(rTrue, minR, 26.0 * u.a.w);
  var I = bright * 1.6 * tw8 * fade * u.c.w * min(1.0, (rTrue * rTrue) / (rad * rad));
  if (I < 0.003) { return none(); }

  var d = A - B;
  var len = length(d);
  if (len > u.e.y) { d = d * (u.e.y / len); len = u.e.y; }
  let dir = select(vec2f(1.0, 0.0), d / max(len, 1e-4), len > 0.01);
  let perp = vec2f(-dir.y, dir.x);
  I = I * mix(1.0, (2.0 * rad) / (2.0 * rad + len), 0.8);

  var corner = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0),
  );
  let cn = corner[vi];
  let ext = 3.0 * rad + 1.0;
  let hl = len * 0.5;
  let along = cn.x * (hl + ext);
  let across = cn.y * ext;
  let mid = A - d * 0.5;
  let px = mid + dir * along + perp * across;

  var o: VO;
  o.pos = vec4f(px / res * 2.0 - 1.0, clamp(ca.z / ca.w, 0.0, 1.0), 1.0);
  o.q = vec2f(along, across);
  o.f = vec4f(hl, rad, I, 0.0);
  return o;
}

@fragment
fn fs(in: VO) -> @location(0) vec4f {
  let hl = in.f.x;
  let rad = in.f.y;
  let d = length(vec2f(max(abs(in.q.x) - hl, 0.0), in.q.y));
  let core = exp(-(d * d) / (0.72 * rad * rad));
  let halo = 0.1 * exp(-d / (rad * 1.3));
  let v = in.f.z * (core + halo);
  return vec4f(v, v, v, 1.0);
}
