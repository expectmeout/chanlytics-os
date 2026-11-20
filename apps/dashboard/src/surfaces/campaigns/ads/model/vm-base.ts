/**
 * What the Ads view's models share (page-only): a door's shape, the platforms in their order, a sum, and a moment said
 * by the account's clock. Pure, like the rest of the models: it reads no clock, store or network.
 */
import { clockTime, zoneDayKey, isoMs } from "@chanlytics/contracts";
import type { AdPlatform } from "@chanlytics/contracts";

/** A door: the words, and where it goes. */
export interface DoorVM {
  words: string;
  to: string;
}

export const PLATFORMS: readonly AdPlatform[] = ["meta", "google", "tiktok"];

export const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

const plainSpaces = (text: string): string => text.replace(/\s/g, " ");

/** `9:19 AM`, by the workspace's clock, from an ISO timestamp; empty for text that is no time. */
export function timeOf(iso: string, timezone: string): string {
  const ms = isoMs(iso);
  return ms === null ? "" : plainSpaces(clockTime(ms, timezone));
}

/** The workspace's day of an ISO timestamp: `2026-10-11`; empty for text that is no time. */
export function dayOfIso(iso: string, timezone: string): string {
  const ms = isoMs(iso);
  return ms === null ? "" : zoneDayKey(ms, timezone);
}
