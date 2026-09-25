/** The little arithmetic every part of the three shares. */
export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const clamp01 = (v: number): number => clamp(v, 0, 1);
/** `cur` moved toward `tgt` over `dt` seconds with time constant `tau`: frame-rate independent, never overshoots. */
export const ease = (cur: number, tgt: number, dt: number, tau: number): number =>
  cur + (tgt - cur) * (1 - Math.exp(-dt / tau));
/** 0 to 1, slow at both ends (a cubic). */
export const inOut = (u: number): number => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
/** 0 to 1, clamped, with a smooth start and end (Hermite). */
export const smooth = (u: number): number => {
  const c = clamp01(u);
  return c * c * (3 - 2 * c);
};
