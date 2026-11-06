/**
 * What this browser keeps of a workspace's rows, named in one place: the surfaces' snapshots (legacy-bridge/surface-cache.ts) and
 * the copy of a phone's screen (surfaces/frame/first-rows.ts), which hold the same customers' words and so go together: past their
 * age at a load, at every clear, and for good once the device is sealed. Neither of the two knows the other's slots or its rules.
 */
import { DAY_MS, FIRST_ROWS_OLDEST_MS, FIRST_ROWS_SLOT } from "@chanlytics/contracts";

/** The surfaces' snapshots: this, then the workspace (a slot name, not a credential). */
export const SURFACES_SLOT = "chanlytics.surfaces.v2:";

/**
 * Each kind of slot: how old it may be, and where it says when it was written, read from its head alone, so a slot of 2 MB is
 * never parsed for it. A snapshot writes `savedAt` second, a copy `at` first (contracts KeptFirstRows).
 */
const KINDS = [
  { prefix: SURFACES_SLOT, oldestMs: DAY_MS, written: /"savedAt":(\d+)/, head: 200 },
  { prefix: FIRST_ROWS_SLOT, oldestMs: FIRST_ROWS_OLDEST_MS, written: /"at":(\d+)/, head: 40 },
] as const;

/** Every slot this browser holds under a prefix. */
export function slotsKept(local: Storage, prefix: string): string[] {
  const names: string[] = [];
  for (let i = 0; i < local.length; i++) {
    const name = local.key(i);
    if (name?.startsWith(prefix)) names.push(name);
  }
  return names;
}

/**
 * Every slot past its age, removed: never drawn, and it held a workspace's messages on the device until the next sign-in cleared
 * it (the page-open PRD, N8). A slot whose head says no time is not ours to judge, and stays.
 */
export function dropExpiredKept(local: Storage, now: number): void {
  for (const kind of KINDS)
    for (const name of slotsKept(local, kind.prefix)) {
      const at = kind.written.exec(local.getItem(name)?.slice(0, kind.head) ?? "")?.[1];
      if (at !== undefined && now - Number(at) >= kind.oldestMs) local.removeItem(name);
    }
}

/** Every workspace's rows this browser kept, of either kind: whoever comes next, signed in again or someone else, starts cold. */
export function clearKept(local: Storage): void {
  for (const kind of KINDS) for (const name of slotsKept(local, kind.prefix)) local.removeItem(name);
}

/**
 * Signing out closed what the device keeps: nothing this page reads or draws from now on is kept. A sign-out clears the rows and
 * then posts the form, inside the app after up to two seconds for the phone to be forgotten, while the runner still runs; a read
 * landing in between was written back by the next snapshot, and the next person to sign in on that tab was painted the last one's
 * rows before the tenant guard could look (defect 52). Closed for the page's life: a sign-out leaves it.
 */
let sealed = false;

export function sealDevice(): void {
  sealed = true;
}

export const deviceSealed = (): boolean => sealed;
