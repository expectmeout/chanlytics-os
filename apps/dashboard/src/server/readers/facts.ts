import "server-only";
import { getTenantConfig, listPolicies } from "@chanlytics/db";
import { tenantFacts } from "../tenant";
import { sellsByOf } from "../people/deals";
import { load, stamp, type Reader, type ReaderContext } from "./index";

/**
 * The workspace's facts, read once.
 *
 * A turn used to read the tenant's name and zone up to five times (the Ask
 * route, list_calls, list_playbooks, get_calendar and the calendar itself),
 * sells_by three or four times and the policies twice. Each is one reader
 * now: the facts are kept five minutes across turns (they change by a
 * settings save nobody makes twice a day); the rest are read once per turn,
 * because a settings change must reach the very next question.
 */

export const facts: Reader<undefined, { name: string; timezone: string }> = {
  name: "facts",
  ttlMs: 5 * 60_000,
  async read(rc) {
    return { data: await tenantFacts(rc.ctx.supabase, rc.tenantId), rows: [], stamp: stamp() };
  },
};

export const sellsBy: Reader<undefined, Awaited<ReturnType<typeof sellsByOf>>> = {
  name: "sellsBy",
  async read(rc) {
    return { data: await sellsByOf(rc.ctx, rc.tenantId), rows: [], stamp: stamp() };
  },
};

export const policies: Reader<undefined, Awaited<ReturnType<typeof listPolicies>>> = {
  name: "policies",
  async read(rc) {
    return { data: await listPolicies(rc.ctx.supabase, rc.tenantId), rows: [], stamp: stamp() };
  },
};

export const config: Reader<undefined, { config: unknown; version: number } | null> = {
  name: "config",
  async read(rc) {
    const row = await getTenantConfig(rc.ctx.supabase, rc.tenantId);
    return { data: row ? { config: row.config, version: row.version } : null, rows: [], stamp: stamp() };
  },
};

/**
 * How to read the calendar's zone and settings from the turn (server/calendar/calendar.ts ZoneAndSettings), for a function that
 * reads them only where its calendar lookup would: through the facts and config readers above, so a turn reads each
 * once, and a read of either that fails fails where the lookup's own did.
 */
export const zoneAndSettings = (rc: ReaderContext) => (): Promise<{ timezone: string; config: unknown }> =>
  Promise.all([load(rc, facts, undefined), load(rc, config, undefined)]).then(([zone, settings]) => ({
    timezone: zone.data.timezone,
    config: settings.data?.config ?? null,
  }));
