#version 300 es
// The vortex, for WebGL 2: the same particles as particles.wgsl, made up
// from their index alone and drawn as streaks.
precision highp float;
precision highp int;

layout(std140) uniform U {
  mat4 vp;      // view-projection now
  mat4 pvp;     // and STREAK seconds ago
  vec4 a;       // resolution.xy, time, device pixel ratio
  vec4 b;       // window offset, window cycle, spin now, spin then
  vec4 c;       // window, near, far, gain
  vec4 d;       // particle count, bundles, strands per bundle, particles per strand
  vec4 e;       // focal length px, longest streak px, share of loose dust, depth moved in STREAK
  vec4 p[3];    // phases (s * K + K0) mod 2π
  vec4 k[3];    // wave numbers K
} u;

out vec2 vQ;
flat out vec4 vF;

const float TAU = 6.2831853;
const float WIND = 0.011;   // how much tighter the spiral winds with depth
const float OPEN = 0.035;   // how much wider the funnel gets with depth

uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float rnd(uint v) { return float(pcg(v)) / 4294967296.0; }

float P(uint i) { return u.p[i / 4u][i % 4u]; }
float K(uint i) { return u.k[i / 4u][i % 4u]; }
float wave(uint i, float z) { return sin(P(i) + z * K(i)); }

vec2 centre(float z) {
  return vec2(1.8 * wave(0u, z) + 0.7 * wave(1u, z) + 0.6 * wave(9u, z),
              1.2 * wave(2u, z) + 0.5 * wave(3u, z) + 0.5 * wave(10u, z));
}

void none() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vQ = vec2(0.0);
  vF = vec4(0.0);
}

void main() {
  uint ii = uint(gl_InstanceID);
  vec2 res = u.a.xy;
  float W = u.c.x;
  uint nDust = uint(u.d.x * u.e.z);

  float zoff, r, th, size, bright;
  float spinMul = 1.0;
  uint tw = 0u;
  float wob = 0.0;

  if (ii < nDust) {
    uint h = ii * 4u + 17u;
    zoff = rnd(h) * W;
    r = 0.12 + 2.4 * sqrt(rnd(h + 1u));
    th = rnd(h + 2u) * TAU;
    size = 0.004 + 0.006 * rnd(h + 3u);
    bright = 0.25 + 0.75 * pow(rnd(h + 9u), 3.0);
    spinMul = 0.35;
  } else {
    uint j = ii - nDust;
    uint per = uint(u.d.w);
    uint strand = j / per;
    uint n = j % per;
    uint bundle = strand / uint(u.d.z);
    uint hb = bundle * 8u + 1000003u;
    uint hs = strand * 8u + 2000003u;
    uint hp = j * 4u + 3000017u;
    float shell = pow(rnd(hb + 1u), 1.7);
    r = 1.02 + 1.3 * shell;
    th = rnd(hb) * TAU;
    tw = uint(rnd(hb + 2u) * 4.0) % 4u;
    wob = rnd(hb + 3u) * TAU;
    th += (rnd(hs) - 0.5) * 0.09 / r;
    r += (rnd(hs + 1u) - 0.5) * 0.07;
    zoff = fract((float(n) + 0.85 * rnd(hp)) / float(per) + rnd(hs + 2u)) * W;
    float fray = rnd(hp + 1u) < 0.06 ? 7.0 : 1.0;
    th += (rnd(hp + 2u) - 0.5) * 0.025 * fray;
    r += (rnd(hp + 3u) - 0.5) * 0.03 * fray;
    size = (0.005 + 0.008 * rnd(hp + 5u)) * (1.0 + 0.3 * shell);
    bright = (0.3 + 0.7 * pow(rnd(hp + 6u), 2.5)) * (1.0 - 0.35 * shell) * (0.6 + 0.4 * rnd(hs + 3u));
    // A few glints, much brighter than the rest.
    bright *= rnd(hp + 7u) < 0.04 ? 4.0 : 1.0;
  }

  float aa = zoff - u.b.x;
  if (aa < 0.0) aa += W;
  float z = aa - u.c.y;

  float strm = ii >= nDust ? 1.0 : 0.0;
  float wb = 0.35 * sin(P(8u) + z * K(8u) + wob) * strm;
  float z1 = z + u.e.w;
  float now = th + wb + strm * (K(4u + tw) * z + WIND * z * z) + u.b.z * spinMul;
  float then = th + wb + strm * (K(4u + tw) * z1 + WIND * z1 * z1) + u.b.w * spinMul;
  vec2 cc = centre(z);
  float rn = r * (1.0 + OPEN * strm * z);
  float rt = r * (1.0 + OPEN * strm * z1);
  vec3 pNow = vec3(cc + rn * vec2(cos(now), sin(now)), z);
  vec3 pThen = vec3(cc + rt * vec2(cos(then), sin(then)), z);

  vec4 ca = u.vp * vec4(pNow, 1.0);
  if (ca.w < 0.06) { none(); return; }
  vec4 cb = u.pvp * vec4(pThen, 1.0);
  if (cb.w < 0.06) cb = ca;
  vec2 A = (ca.xy / ca.w * 0.5 + 0.5) * res;
  vec2 B = (cb.xy / cb.w * 0.5 + 0.5) * res;

  float t = u.a.z;
  float tw8 = 0.55 + 0.45 * sin(t * (2.0 + 5.0 * rnd(ii + 77u)) + rnd(ii + 78u) * TAU);
  float fade = smoothstep(0.3, 2.5, z) * pow(1.0 - smoothstep(u.c.z * 0.3, u.c.z, z), 1.2);
  float rTrue = size * u.e.x / ca.w;
  float minR = 0.75 * u.a.w;
  float rad = clamp(rTrue, minR, 26.0 * u.a.w);
  float I = bright * 1.6 * tw8 * fade * u.c.w * min(1.0, (rTrue * rTrue) / (rad * rad));
  if (I < 0.003) { none(); return; }

  vec2 d = A - B;
  float len = length(d);
  if (len > u.e.y) { d *= u.e.y / len; len = u.e.y; }
  vec2 dir = len > 0.01 ? d / max(len, 1e-4) : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);
  I *= mix(1.0, (2.0 * rad) / (2.0 * rad + len), 0.8);

  int vi = gl_VertexID;
  vec2 cn = vec2(vi == 1 || vi == 2 || vi == 4 ? 1.0 : -1.0, vi == 2 || vi == 4 || vi == 5 ? 1.0 : -1.0);
  float ext = 3.0 * rad + 1.0;
  float hl = len * 0.5;
  float along = cn.x * (hl + ext);
  float across = cn.y * ext;
  vec2 mid = A - d * 0.5;
  vec2 px = mid + dir * along + perp * across;

  gl_Position = vec4(px / res * 2.0 - 1.0, clamp(ca.z / ca.w, 0.0, 1.0) * 2.0 - 1.0, 1.0);
  vQ = vec2(along, across);
  vF = vec4(hl, rad, I, 0.0);
}
