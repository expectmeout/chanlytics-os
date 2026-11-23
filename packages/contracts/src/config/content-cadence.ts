/**
 * The cadence a business that has set none is planned at, apart from the config's schema (content-config.ts), so the Week
 * and Settings › Content read it on a page without zod's classic API (tooling/scripts/gen/contracts-browser-entry.mjs).
 */
import type { ContentCadence } from "./content-config";

/**
 * The planner's default for a business that has set nothing (call 14): two reels and a picture post a week on
 * Instagram, stories where one is worth it, and one picture on Google. Leave to post less is the low end of each range.
 */
export const CADENCE_DEFAULT = {
  instagram: { reel: [1, 2], picture: [0, 1], story: [0, 2] },
  google: { picture: [0, 1] },
} as const satisfies ContentCadence;
