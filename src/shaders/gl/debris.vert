#version 300 es
// Space debris, for WebGL 2 (see debris.wgsl).
precision highp float;

struct Inst {
  vec4 pos;     // xyz, finish (0 rock, 1 metal, 2 solar panel, 3 girder)
  vec4 q;       // turn
  vec4 scl;     // half size xyz, seed
  vec4 rad;     // xy: out from the tunnel's middle
};
layout(std140) uniform U {
  mat4 vp;
  vec4 a;       // time, fade-in start, fade-in end, unused
  vec4 mars;    // direction to Mars, strength
} u;
layout(std140) uniform D { Inst inst[256]; } di;
uniform int base;   // WebGL 2 has no first instance, so each mesh's range starts here

layout(location = 0) in vec3 p;
layout(location = 1) in vec3 n;

out vec3 vN;
out vec3 vW;
out vec3 vL;
flat out vec4 vMat;   // finish, seed, radial xy

vec3 qrot(vec4 q, vec3 v) {
  vec3 t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

void main() {
  Inst it = di.inst[base + gl_InstanceID];
  vec3 w = it.pos.xyz + qrot(it.q, p * it.scl.xyz);
  gl_Position = u.vp * vec4(w, 1.0);
  gl_Position.z = gl_Position.z * 2.0 - gl_Position.w;
  vN = qrot(it.q, n / it.scl.xyz);
  vW = w;
  vL = p * it.scl.xyz;
  vMat = vec4(it.pos.w, it.scl.w, it.rad.xy);
}
