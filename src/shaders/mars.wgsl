// Mars, at the end of the tunnel: the only colour there is.
// A lit sphere with dark plains, the canyon, ice caps and a thin pink
// atmosphere, turning slowly, with a faint red glow round it.

struct U {
  a: vec4f,   // centre (NDC xy), radius (NDC y units), aspect w/h
  b: vec4f,   // turn, glow, pixels per radius, unused
};
@group(0) @binding(0) var<uniform> u: U;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) ndc: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VO {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  var o: VO;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.ndc = p[i];
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
  var v = 0.0;
  var a = 0.5;
  var q = p;
  for (var i = 0; i < 5; i++) {
    v += a * noise(q);
    q = q * 2.03 + vec3f(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return v;
}

@fragment
fn fs(in: VO) -> @location(0) vec4f {
  let d = (in.ndc - u.a.xy) * vec2f(u.a.w, 1.0) / u.a.z;
  let r = length(d);
  let aa = 1.5 / max(u.b.z, 1.0);
  var col = vec3f(0.0);

  if (r < 1.0 + aa) {
    let n = vec3f(d, sqrt(max(0.0, 1.0 - r * r)));
    // Turn about a tilted pole.
    let tilt = 0.44;
    let ct = cos(tilt);
    let st = sin(tilt);
    var sp = vec3f(n.x * ct - n.y * st, n.x * st + n.y * ct, n.z);
    let cs = cos(u.b.x);
    let sn = sin(u.b.x);
    sp = vec3f(sp.x * cs + sp.z * sn, sp.y, -sp.x * sn + sp.z * cs);
    let lat = asin(clamp(sp.y, -1.0, 1.0));
    let lon = atan2(sp.x, sp.z);

    let f = fbm(sp * 3.0);
    var albedo = mix(vec3f(0.78, 0.36, 0.16), vec3f(0.6, 0.25, 0.11), f);
    let dark = smoothstep(0.5, 0.62, fbm(sp * 1.6 + vec3f(7.0)));
    albedo = mix(albedo, vec3f(0.3, 0.14, 0.08), dark * 0.75);
    // Valles Marineris.
    let canyon = (1.0 - smoothstep(0.015, 0.045, abs(lat + 0.15 + 0.03 * (f - 0.5)))) * (1.0 - smoothstep(0.5, 0.8, abs(lon - 0.2)));
    albedo = mix(albedo, vec3f(0.22, 0.1, 0.06), canyon * 0.8);
    // Ice caps.
    let ice = smoothstep(1.17, 1.22, lat + 0.08 * f) + smoothstep(1.32, 1.37, -lat + 0.08 * f);
    albedo = mix(albedo, vec3f(0.95, 0.92, 0.88), clamp(ice, 0.0, 1.0));

    let L = normalize(vec3f(-0.55, 0.38, 0.75));
    let lit = smoothstep(-0.12, 0.35, dot(n, L));
    let diff = max(dot(n, L), 0.0) * 0.85 + 0.15 * lit;
    col = albedo * diff * 1.5;
    // Thin atmosphere at the limb.
    col += vec3f(1.0, 0.55, 0.42) * pow(1.0 - n.z, 3.0) * 0.5 * lit;
    col *= 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
  }
  // Glow.
  let g = max(r - 1.0, 0.0);
  col += vec3f(0.95, 0.32, 0.12) * u.b.y * (0.22 * exp(-g * 4.0) + 0.05 * exp(-g * 0.6)) * smoothstep(1.0 - aa, 1.0 + aa, r);
  return vec4f(col, 1.0);
}
