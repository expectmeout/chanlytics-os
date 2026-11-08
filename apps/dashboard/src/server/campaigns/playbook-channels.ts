import "server-only";
import { DEFAULT_CAMPAIGN_CHANNELS } from "@chanlytics/contracts";
import { listPlaybookChannels, findPlaybookForChannels } from "@chanlytics/db/campaigns";
import type { RouteContext } from "../shared/with-route";
import type { TenantId } from "@chanlytics/contracts";

/**
 * The channels a playbook already ticks, for an edit that names none (packages/db listPlaybookChannels): null when it keeps none,
 * or the column is not there yet (a database 00298 has not reached).
 */
export const listKeptChannels = (ctx: Pick<RouteContext, "supabase">, playbookId: string): Promise<string[] | null> =>
  listPlaybookChannels(ctx.supabase, playbookId);

/**
 * One playbook as far as a change of its channels alone reads it (Ask's card): the database's own reading of it
 * (packages/db findPlaybookForChannels), with what it ticks (listKeptChannels): null where it keeps none, which reads as
 * WhatsApp alone.
 */
type PlaybookChannelsRow = NonNullable<Awaited<ReturnType<typeof findPlaybookForChannels>>> & {
  channels: string[] | null;
};

/**
 * One playbook, read for a change of its channels: its name, moment, class and message from its row, whether a run of
 * it waits, and the channels it keeps. Three small reads of the one playbook under the caller's RLS, where Ask's act
 * read the whole Playbooks page (every playbook's totals, everyone in People, the calendar, each list's pool) to find
 * one row. Null where the workspace has no such playbook.
 */
export async function findPlaybookChannelsRow(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  id: string,
): Promise<PlaybookChannelsRow | null> {
  const row = await findPlaybookForChannels(ctx.supabase, tenantId, id);
  return row ? { ...row, channels: await listKeptChannels(ctx, id) } : null;
}

/**
 * Whether a playbook's channels are other than what it already has (WhatsApp alone when it keeps none). The column is
 * written only when they are, so a playbook that stays on WhatsApp is written as it always was, and a database 00298
 * has not reached takes it as before (either deploy order works).
 */
export function channelsChanged(next: readonly string[], kept: readonly string[] | null): boolean {
  const was = kept && kept.length > 0 ? kept : DEFAULT_CAMPAIGN_CHANNELS;
  return [...next].sort().join() !== [...was].sort().join();
}
