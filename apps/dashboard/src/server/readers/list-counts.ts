import "server-only";
import { parseListToken, type ListCountsDto } from "@chanlytics/contracts";
import { savedListsFor } from "@chanlytics/db";
import { audiencePool, poolList } from "../people/audience";
import { load, stamp, type Reader } from "./index";
import * as facts from "./facts";
import { everyone } from "./everyone";

/**
 * Each pinned list's count (GET people/list-counts; the wiring's second audit, R10): counted over the pool People's lists
 * are counted on (server/people/audience.ts, contracts' one rule, membersOf), for the member asking, so a teammate's thread
 * is theirs and a list about "me" is about them; with the calendar's last good read, since a count decides nothing. The
 * workspace's lists are read once for them all. A token that names no list, or a list that can't be counted here, is null.
 * Today's pins read it, so their numbers follow what moves them without People's whole book reaching the browser.
 */
export const listCounts: Reader<{ tokens: readonly string[] }, ListCountsDto> = {
  name: "listCounts",
  async read(rc, { tokens }) {
    const refs = tokens.map((token) => [token, parseListToken(token)] as const);
    const [zone, sellsBy, ready, lists] = await Promise.all([
      load(rc, facts.facts, undefined),
      load(rc, facts.sellsBy, undefined),
      load(rc, facts.channelsReady, undefined),
      refs.some(([, ref]) => ref?.kind === "saved") ? savedListsFor(rc.ctx.supabase, rc.tenantId) : Promise.resolve([]),
    ]);
    const pool = await audiencePool(rc.ctx, rc.tenantId, zone.data.timezone, rc.now, ready.data, {
      sellsBy: sellsBy.data,
      people: () => load(rc, everyone, undefined).then((r) => r.data),
      known: facts.zoneAndSettings(rc),
      stale: true,
    });
    const counts: Record<string, number | null> = {};
    for (const [token, ref] of refs) {
      const one = ref ? await poolList(rc.ctx, rc.tenantId, pool, ref, lists) : null;
      counts[token] = one && "memberIds" in one ? one.memberIds.length : null;
    }
    return { data: { counts }, rows: [], stamp: stamp() };
  },
};
