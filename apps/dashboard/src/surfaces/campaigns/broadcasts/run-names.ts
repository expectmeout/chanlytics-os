/**
 * The runs this tab has read on their own (GET broadcasts/[id]), by id, for the frame's crumb: a run older than Sent's
 * newest fifty, or one opened before Sent's runs are in, is called as its own read calls it, never "Broadcast". It imports
 * nothing, so the route chunk the frame loads for every page holds none of the read (as ads/crumb-names.ts).
 */
import type { BroadcastDto } from "@chanlytics/contracts";

const RUNS = new Map<string, BroadcastDto>();

/** A run as its own read answered: what its crumb names until Sent's runs hold it. */
export function rememberRun(run: BroadcastDto): void {
  RUNS.set(run.id, run);
}

/** A run this tab has read on its own, or null where it has read none by that id. */
export const rememberedRun = (id: string): BroadcastDto | null => RUNS.get(id) ?? null;
