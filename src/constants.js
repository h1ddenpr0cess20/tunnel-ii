// Shared numbers. Units are tunnel radii; s is distance down the tunnel.

export const FAR = 26;           // the streams fade out by here: the black hole at the centre
export const NEAR = 2;           // and start this far behind the eye
export const WINDOW = FAR + NEAR;
export const SPAWN_D = 60;       // debris comes out of the dark this far ahead
export const MARS_D = 400;       // Mars always sits this far ahead
export const M_PER_UNIT = 1.5;   // one tunnel radius in metres, for the HUD

export const PLAY_R = 0.8;       // how far from the middle you can fly
export const VMAX = 2.6;         // steering speed
export const HIT_R = 0.09;       // your size, for collisions
export const MISS_R = 0.42;      // closer than this past debris is a near miss
export const STREAK = 0.018;     // seconds of motion each streak shows

// Wave numbers for the tunnel's bends (0-3 and 9-10), the streams' twists (4-7, in
// radians per unit of depth ahead of you) and their wobble (8), with the
// phase each starts at. The shader gets (s * K + K0) mod 2π, worked out here
// in double precision.
export const K = [0.021, 0.047, 0.017, 0.039, 0.16, 0.2, 0.26, 0.12, 0.05, 0.06, 0.075, 0];
export const K0 = [0, 1.3, 2.1, 0.4, 0, 0, 0, 0, 0, 0.7, 2.9, 0];
const TAU = Math.PI * 2;

// Where the middle of the tunnel is at depth z.
export function pathXY(z) {
  return [
    1.8 * Math.sin(z * K[0] + K0[0]) + 0.7 * Math.sin(z * K[1] + K0[1]) + 0.6 * Math.sin(z * K[9] + K0[9]),
    1.2 * Math.sin(z * K[2] + K0[2]) + 0.5 * Math.sin(z * K[3] + K0[3]) + 0.5 * Math.sin(z * K[10] + K0[10]),
  ];
}

export function phases(s, out) {
  for (let i = 0; i < 12; i++) out[i] = (((s * K[i] + K0[i]) % TAU) + TAU) % TAU;
  return out;
}
