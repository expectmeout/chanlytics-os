/**
 * What the bridge's own reads answered, held by the surface's key (decision 0151): who is looking (the workspace read,
 * who.ts reads it), the bell's kept notices and the leads' replies.
 *
 * A surface's answer is the seam's (surfaces/surface-values.ts), which a page reads with `useSurface`. These three are read
 * by the bridge itself (the frame, the bell, a thread's strip), which stands under the surfaces and may not lean on them
 * (decision 0110), so they are held here instead, and written onto the window no more. The surface cache keeps each with
 * its snapshot and gives it back before React draws; a test holds the world it draws with `holdRead`.
 *
 * This module imports nothing at run time, so every module of the browser can import it.
 */
import type { NotificationsDto, ReachOutRepliesDto } from "@chanlytics/contracts";
import type { WhoIsLooking } from "./who";

/** The bell's kept notices and when they were read (surfaces/notifications.ts). */
interface NotificationsHeld {
  dto: NotificationsDto;
  fetchedAt: number;
}

/** Each read the bridge holds, by its surface's key. */
interface HeldReads {
  workspace: WhoIsLooking;
  notifications: NotificationsHeld;
  /** Null when the read failed: a thread is drawn without them, never with a reading nobody read. */
  reach_out_replies: ReachOutRepliesDto | null;
}

type HeldKey = keyof HeldReads;

const heldAnswers: Partial<HeldReads> = {};

/** Hold what a read answered under its surface's key: the read as it lands, the cache at boot, a test's world. */
export function holdRead<K extends HeldKey>(key: K, value: HeldReads[K] | undefined): void {
  if (value === undefined) delete heldAnswers[key];
  else heldAnswers[key] = value;
}

/** What a read last answered; undefined before it has. */
export function heldRead<K extends HeldKey>(key: K): HeldReads[K] | undefined {
  return heldAnswers[key];
}

// The keys as a value, so a key from the cache is checked against the same list the type is.
const HELD_KEYS: Record<HeldKey, true> = { workspace: true, notifications: true, reach_out_replies: true };

/** Whether a surface's key is one of the reads held here (the cache asks it of every key it keeps). */
export const isHeldRead = (key: string): key is HeldKey => Object.hasOwn(HELD_KEYS, key);

/** What the cache gives back of a read held here, as an earlier visit of this build kept it (surface-cache.ts). */
export function holdKeptRead(key: string, value: unknown): void {
  // As this build kept it: its own shape (surface-cache.ts draws another build's none of it).
  if (isHeldRead(key) && value !== undefined) Reflect.set(heldAnswers, key, value);
}
