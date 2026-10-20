#version 300 es
// Space debris, for WebGL 2 (see debris.wgsl).
precision highp float;

layout(std140) uniform U {
  mat4 vp;
  vec4 a;
  vec4 mars;
} u;

in vec3 vN;
in vec3 vW;
in vec3 vL;
in float vCav;
flat in vec4 vMat;
out vec4 outColor;

float hash(vec3 p) {
  vec3 q = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)) * 17.0;
  return fract(q.x * q.y * q.z * (q.x + q.y + q.z));
}
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 w = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), w.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), w.x), w.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), w.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), w.x), w.y), w.z);
}
float fbm(vec3 p) {
  return 0.5 * noise(p) + 0.25 * noise(p * 2.03 + 3.1) + 0.125 * noise(p * 4.07 + 7.7);
}
vec3 bump(vec3 n, vec3 p, float k) {
  float e = 0.06;
  float h = fbm(p);
  vec3 g = vec3(fbm(p + vec3(e, 0.0, 0.0)) - h, fbm(p + vec3(0.0, e, 0.0)) - h, fbm(p + vec3(0.0, 0.0, e)) - h) / e;
  return normalize(n - k * (g - n * dot(g, n)));
}
vec3 grain(vec3 n, vec3 p, float k) {
  float e = 0.08;
  float h = noise(p);
  vec3 g = vec3(noise(p + vec3(e, 0.0, 0.0)) - h, noise(p + vec3(0.0, e, 0.0)) - h, noise(p + vec3(0.0, 0.0, e)) - h) / e;
  return normalize(n - k * (g - n * dot(g, n)));
}
float env(vec3 r, vec3 outw) {
  float side = 1.0 - abs(r.z);
  return 0.08 + 0.9 * pow(max(dot(r, outw), 0.0), 3.0) + 0.35 * side * side;
}

void main() {
  int mat = int(vMat.x + 0.5);
  float seed = vMat.y * 37.0;
  vec3 n = normalize(vN);
  vec3 v = normalize(-vW);
  if (dot(n, v) < 0.0 && mat >= 2) n = -n;
  vec3 outw = normalize(vec3(vMat.zw, 0.0001));
  vec3 lp = vL;

  vec3 albedo = vec3(0.5);
  float spec = 0.04;
  float shine = 16.0;
  float cav = vCav;

  if (mat == 0) {
    float g = fbm(lp * 7.0 + seed);
    float speck = smoothstep(0.62, 0.7, noise(lp * 38.0 + seed));
    albedo = vec3(0.16 + 0.16 * g + 0.12 * speck);
    n = bump(n, lp * 9.0 + seed, 0.55);
    n = grain(n, lp * 30.0 + seed, 0.12);
    spec = 0.03;
    shine = 10.0;
    cav *= 0.75 + 0.25 * g;
  } else if (mat == 1) {
    vec3 s = abs(fract(lp * 9.0) - 0.5);
    albedo = vec3(0.42) * (0.85 + 0.15 * fbm(lp * 12.0 + seed));
    albedo *= min(s.x, min(s.y, s.z)) < 0.025 ? 0.45 : 1.0;
    spec = 0.25;
    shine = 40.0;
  } else if (mat == 2) {
    vec2 c = abs(fract(lp.xy * 26.0) - 0.5);
    float grid = 1.0 - smoothstep(0.035, 0.06, min(c.x, c.y));
    albedo = mix(vec3(0.03, 0.035, 0.045), vec3(0.55), grid);
    spec = mix(0.35, 0.3, grid);
    shine = mix(120.0, 30.0, grid);
    n = bump(n, vec3(floor(lp.xy * 26.0), seed), 0.06);
  } else if (mat == 3) {
    albedo = vec3(0.35 + 0.15 * fbm(lp * 20.0 + seed));
    spec = 0.35;
    shine = 30.0;
  } else if (mat == 4) {
    albedo = vec3(0.55);
    n = grain(n, lp * 28.0 + seed, 0.7);
    spec = 0.75;
    shine = 70.0;
  } else {
    albedo = vec3(0.78);
    spec = 0.1;
    shine = 24.0;
  }

  vec3 key = normalize(vec3(0.35, 0.6, -0.72));
  float diff = max(dot(n, key), 0.0) * 1.05 + 0.5 * max(dot(n, outw), 0.0) + 0.06;
  vec3 col = albedo * diff * (1.0 - spec * 0.6) * cav;

  vec3 h = normalize(key + v);
  vec3 r = reflect(-v, n);
  float fres = spec + (1.0 - spec) * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  col += vec3(1.0) * pow(max(dot(n, h), 0.0), shine) * spec * 2.5 * cav;
  col += vec3(env(r, outw)) * fres * (spec > 0.2 ? 0.6 : 0.15) * cav;

  float edge = pow(1.0 - abs(dot(n, v)), 3.0);
  col += vec3(0.12 * edge);
  float back = pow(max(dot(n, u.mars.xyz), 0.0), 2.0) * edge;
  col += vec3(1.0, 0.36, 0.16) * back * u.mars.w * 1.4;

  float fade = 1.0 - smoothstep(u.a.y, u.a.z, vW.z);
  outColor = vec4(col * fade, 1.0);
}
