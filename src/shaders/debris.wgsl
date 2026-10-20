// Space debris: rocks, dead satellites, girders and shards.
//
// Dark, flat-shaded bodies lit by the glittering walls round them (light
// from outside the tunnel inwards), edged white where they turn away from
// you, and rimmed red from behind by Mars. They come out of the dark.

struct U {
  vp: mat4x4f,
  a: vec4f,           // time, fade-in start, fade-in end, unused
  mars: vec4f,        // direction to Mars, strength
};
struct Inst {
  pos: vec4f,         // xyz, finish (0 rock, 1 metal, 2 solar panel, 3 girder)
  q: vec4f,           // turn
  scl: vec4f,         // half size xyz, seed
  rad: vec4f,         // xy: out from the tunnel's middle
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<uniform> inst: array<Inst, 256>;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) n: vec3f,
  @location(1) w: vec3f,
  @location(2) l: vec3f,
  @location(3) @interpolate(flat) i: u32,
};

fn qrot(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

@vertex
fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @builtin(instance_index) ii: u32) -> VO {
  let it = inst[ii];
  let w = it.pos.xyz + qrot(it.q, p * it.scl.xyz);
  var o: VO;
  o.pos = u.vp * vec4f(w, 1.0);
  o.n = qrot(it.q, n / it.scl.xyz);
  o.w = w;
  o.l = p * it.scl.xyz;
  o.i = ii;
  return o;
}

fn hash3(p: vec3f) -> f32 {
  return fract(sin(dot(p, vec3f(12.9898, 78.233, 37.719))) * 43758.5453);
}

@fragment
fn fs(in: VO) -> @location(0) vec4f {
  let it = inst[in.i];
  let mat = i32(it.pos.w);
  let n = normalize(in.n);
  let v = normalize(-in.w);                 // towards the eye
  let out = normalize(vec3f(it.rad.xy, 0.0));

  var albedo = 0.16;
  var spec = 0.0;
  var lines = 1.0;
  if (mat == 0) {
    albedo = 0.13 + 0.07 * hash3(floor(in.l * 9.0) + it.scl.w * 31.0);
  } else if (mat == 1) {
    albedo = 0.3;
    spec = 0.5;
  } else if (mat == 2) {
    // Solar cells: a dark grid that catches the light.
    let g = abs(fract(in.l.xy * vec2f(9.0, 11.0)) - 0.5);
    lines = select(1.0, 2.2, min(g.x, g.y) < 0.06);
    albedo = 0.07;
    spec = 1.0;
  } else {
    let g = abs(fract(in.l.x * 5.0) - 0.5);
    lines = select(0.6, 1.6, g < 0.08);
    albedo = 0.22;
    spec = 0.3;
  }

  // The walls glow all round: light comes inwards, brightest from the near wall.
  let wall = 0.9 * max(dot(n, out), 0.0) + 0.3 * (0.5 + 0.5 * dot(n, vec3f(0.0, 0.0, -1.0)));
  let amb = 0.06;
  var col = vec3f(albedo * (wall + amb) * lines);

  // Glints: the walls' light off metal and glass.
  let h = normalize(out + v);
  col += vec3f(spec * 0.9 * pow(max(dot(n, h), 0.0), 40.0) * lines);

  // Edges: white where the surface turns away, red where Mars is behind it.
  let edge = pow(1.0 - abs(dot(n, v)), 3.0);
  col += vec3f(0.22 * edge);
  let back = pow(max(dot(n, u.mars.xyz), 0.0), 2.0) * edge;
  col += vec3f(1.0, 0.36, 0.16) * back * u.mars.w;

  let z = in.w.z;
  let fade = 1.0 - smoothstep(u.a.y, u.a.z, z);
  return vec4f(col * fade, 1.0);
}
