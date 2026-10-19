import "server-only";
import { parseListToken, type ListCountsDto } from "@chanlytics/contracts";
import { savedListsFor } from "@chanlytics/db";
import { audiencePool as audiencePoolFrom, poolList, type AudiencePool } from "../people/audience";
import { load, stamp, type Reader } from "./index";
import * as facts from "./facts";
import { everyone } from "./everyone";

/**
 * Everyone in People with their appointments, for the member asking (server/people/audience.ts): the pool a broadcast's
 * audience, a People list and a playbook's moment are counted over, as the send counts them. Read once a turn by its
 * arguments, so a turn that lists the audiences and then proposes a send reads it once -- the memo it replaces kept
 * one pool whatever the zone and the clock. Everyone is the turn's own read (readers/everyone.ts), which the Playbooks
 * page's pools share; the zone, the settings and a deal on file are the turn's too (readers/facts.ts): the
 * zone up front, as the tool's context had it, and the settings only where the pool's calendar lookup would read them,
 * so a settings read that fails costs the visits, never the pool. A workspace-wide read, so no row of its own: a tool
 * that names someone from it records them itself.
 */
export const audiencePool: Reader<undefined, AudiencePool> = {
  name: "audiencePool",
  async read(rc) {
    const [zone, dealt, ready] = await Promise.all([
      load(rc, facts.facts, undefined),
      load(rc, facts.hasDeals, undefined),
      // What the workspace can send on now: each row's reach is judged against it (readers/facts.ts, the turn's own read).
      load(rc, facts.channelsReady, undefined),
    ]);
    const data = await audiencePoolFrom(rc.ctx, rc.tenantId, zone.data.timezone, rc.now, ready.data, {
      hasDeals: dealt.data,
      people: () => load(rc, everyone, undefined).then((r) => r.data),
      known: facts.zoneAndSettings(rc),
    });
    return { data, rows: [], stamp: stamp() };
  },
};

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
    const [zone, dealt, ready, lists] = await Promise.all([
      load(rc, facts.facts, undefined),
      load(rc, facts.hasDeals, undefined),
      load(rc, facts.channelsReady, undefined),
      refs.some(([, ref]) => ref?.kind === "saved") ? savedListsFor(rc.ctx.supabase, rc.tenantId) : Promise.resolve([]),
    ]);
    const pool = await audiencePoolFrom(rc.ctx, rc.tenantId, zone.data.timezone, rc.now, ready.data, {
      hasDeals: dealt.data,
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
