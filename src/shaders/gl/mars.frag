#version 300 es
// Mars, for WebGL 2 (see mars.wgsl).
precision highp float;

layout(std140) uniform U {
  vec4 a;   // centre (NDC xy), radius (NDC y units), aspect w/h
  vec4 b;   // turn, glow, pixels per radius, unused
} u;

in vec2 vNdc;
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
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 d = (vNdc - u.a.xy) * vec2(u.a.w, 1.0) / u.a.z;
  float r = length(d);
  float aa = 1.5 / max(u.b.z, 1.0);
  vec3 col = vec3(0.0);

  if (r < 1.0 + aa) {
    vec3 n = vec3(d, sqrt(max(0.0, 1.0 - r * r)));
    float tilt = 0.44;
    float ct = cos(tilt), st = sin(tilt);
    vec3 sp = vec3(n.x * ct - n.y * st, n.x * st + n.y * ct, n.z);
    float cs = cos(u.b.x), sn = sin(u.b.x);
    sp = vec3(sp.x * cs + sp.z * sn, sp.y, -sp.x * sn + sp.z * cs);
    float lat = asin(clamp(sp.y, -1.0, 1.0));
    float lon = atan(sp.x, sp.z);

    float f = fbm(sp * 3.0);
    vec3 albedo = mix(vec3(0.78, 0.36, 0.16), vec3(0.6, 0.25, 0.11), f);
    float dark = smoothstep(0.5, 0.62, fbm(sp * 1.6 + vec3(7.0)));
    albedo = mix(albedo, vec3(0.3, 0.14, 0.08), dark * 0.75);
    float canyon = (1.0 - smoothstep(0.015, 0.045, abs(lat + 0.15 + 0.03 * (f - 0.5)))) * (1.0 - smoothstep(0.5, 0.8, abs(lon - 0.2)));
    albedo = mix(albedo, vec3(0.22, 0.1, 0.06), canyon * 0.8);
    float ice = smoothstep(1.17, 1.22, lat + 0.08 * f) + smoothstep(1.32, 1.37, -lat + 0.08 * f);
    albedo = mix(albedo, vec3(0.95, 0.92, 0.88), clamp(ice, 0.0, 1.0));

    vec3 L = normalize(vec3(-0.55, 0.38, 0.75));
    float lit = smoothstep(-0.12, 0.35, dot(n, L));
    float diff = max(dot(n, L), 0.0) * 0.85 + 0.15 * lit;
    col = albedo * diff * 1.5;
    col += vec3(1.0, 0.55, 0.42) * pow(1.0 - n.z, 3.0) * 0.5 * lit;
    col *= 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
  }
  float g = max(r - 1.0, 0.0);
  col += vec3(0.95, 0.32, 0.12) * u.b.y * (0.22 * exp(-g * 4.0) + 0.05 * exp(-g * 0.6)) * smoothstep(1.0 - aa, 1.0 + aa, r);
  outColor = vec4(col, 1.0);
}
