#version 300 es
precision highp float;

layout(std140) uniform U {
  mat4 vp;
  vec4 a;
  vec4 mars;
} u;

in vec3 vN;
in vec3 vW;
in vec3 vL;
flat in vec4 vMat;
out vec4 outColor;

float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}

void main() {
  int mat = int(vMat.x + 0.5);
  vec3 n = normalize(vN);
  vec3 v = normalize(-vW);
  vec3 outw = normalize(vec3(vMat.zw, 0.0));

  float albedo = 0.16;
  float spec = 0.0;
  float lines = 1.0;
  if (mat == 0) {
    albedo = 0.13 + 0.07 * hash3(floor(vL * 9.0) + vMat.y * 31.0);
  } else if (mat == 1) {
    albedo = 0.3;
    spec = 0.5;
  } else if (mat == 2) {
    vec2 g = abs(fract(vL.xy * vec2(9.0, 11.0)) - 0.5);
    lines = min(g.x, g.y) < 0.06 ? 2.2 : 1.0;
    albedo = 0.07;
    spec = 1.0;
  } else {
    float g = abs(fract(vL.x * 5.0) - 0.5);
    lines = g < 0.08 ? 1.6 : 0.6;
    albedo = 0.22;
    spec = 0.3;
  }

  float wall = 0.9 * max(dot(n, outw), 0.0) + 0.3 * (0.5 + 0.5 * dot(n, vec3(0.0, 0.0, -1.0)));
  vec3 col = vec3(albedo * (wall + 0.06) * lines);
  vec3 h = normalize(outw + v);
  col += vec3(spec * 0.9 * pow(max(dot(n, h), 0.0), 40.0) * lines);
  float edge = pow(1.0 - abs(dot(n, v)), 3.0);
  col += vec3(0.22 * edge);
  float back = pow(max(dot(n, u.mars.xyz), 0.0), 2.0) * edge;
  col += vec3(1.0, 0.36, 0.16) * back * u.mars.w;

  float fade = 1.0 - smoothstep(u.a.y, u.a.z, vW.z);
  outColor = vec4(col * fade, 1.0);
}
