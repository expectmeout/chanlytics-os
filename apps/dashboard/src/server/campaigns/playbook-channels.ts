import "server-only";
import { DEFAULT_CAMPAIGN_CHANNELS } from "@chanlytics/contracts";
import { playbookChannels } from "@chanlytics/db";
import type { RouteContext } from "../with-route";

/**
 * The channels a playbook already ticks, for an edit that names none (packages/db playbookChannels): null when it keeps none,
 * or the column is not there yet (a database 00298 has not reached).
 */
export const keptChannels = (ctx: Pick<RouteContext, "supabase">, playbookId: string): Promise<string[] | null> =>
  playbookChannels(ctx.supabase, playbookId);

/**
 * Whether a playbook's channels are other than what it already has (WhatsApp alone when it keeps none). The column is
 * written only when they are, so a playbook that stays on WhatsApp is written as it always was, and a database 00298
 * has not reached takes it as before (either deploy order works).
 */
export function channelsChanged(next: readonly string[], kept: readonly string[] | null): boolean {
  const was = kept && kept.length > 0 ? kept : DEFAULT_CAMPAIGN_CHANNELS;
  return [...next].sort().join() !== [...was].sort().join();
}
