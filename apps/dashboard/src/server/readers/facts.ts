import "server-only";
import { listPolicies } from "@chanlytics/db";
import { configRowOf } from "../workspace/config-row";
import { tenantFacts } from "../tenant";
import { sellsByOf } from "../people/deals";
import { channelsReadyOrNull } from "../campaigns/channels-ready";
import { FACTS_READER, load, stamp, type Reader, type ReaderContext } from "./index";
import {
  appointmentWordOf,
  dealsAreOn,
  parseTenantConfig,
  type AppointmentWord,
  type ChannelsReady,
  type SellsBy,
  MIN_MS,
} from "@chanlytics/contracts";

/**
 * The workspace's facts, read once.
 *
 * A turn used to read the tenant's name and zone up to five times (the Ask
 * route, calls.list, campaigns.playbooks, calendar.week and the calendar itself),
 * sells_by three or four times and the policies twice. Each is one reader
 * now: the facts are kept five minutes across turns (they change by a
 * settings save nobody makes twice a day); the rest are read once per turn,
 * because a settings change must reach the very next question.
 */

export const facts: Reader<undefined, { name: string; timezone: string }> = {
  name: FACTS_READER,
  ttlMs: 5 * MIN_MS,
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

/**
 * What the workspace can send on now, channel by channel (campaigns/channels-ready.ts), read once a turn: who can be sent
 * what is judged against it wherever People's rows are built, on the page and in Ask (contracts reach-any.ts). A read
 * that fails is said in the log and is null: counted as before the channels were, by WhatsApp alone, never as nothing.
 */
export const channelsReady: Reader<undefined, ChannelsReady | null> = {
  name: "channelsReady",
  async read(rc) {
    // Who can be reached, which a pause does not change: the pause is the composers' to read, not People's.
    return { data: await channelsReadyOrNull(rc.ctx, rc.tenantId, { withPause: false }), rows: [], stamp: stamp() };
  },
};

export const policies: Reader<undefined, Awaited<ReturnType<typeof listPolicies>>> = {
  name: "policies",
  async read(rc) {
    return { data: await listPolicies(rc.ctx.supabase, rc.tenantId), rows: [], stamp: stamp() };
  },
};

/**
 * The workspace's configuration row, whole, as the server holds it for the member (workspace/config-row.ts): the config,
 * the version a write must echo, and who last changed it and when (00085), so the settings read is the turn's one read
 * of the row. Null: there is no row.
 */
export const config: Reader<
  undefined,
  { config: unknown; version: number; updated_by: string | null; updated_at: string | null } | null
> = {
  name: "config",
  async read(rc) {
    const row = await configRowOf(rc.ctx.supabase, rc.tenantId);
    return {
      data: row
        ? {
            config: row.config,
            version: row.version,
            updated_by: row.updated_by ?? null,
            updated_at: row.updated_at ?? null,
          }
        : null,
      rows: [],
      stamp: stamp(),
    };
  },
};

/**
 * What the workspace calls an appointment, from how its customers buy: the one place the server works the word out
 * (contracts appointmentWordOf). Nothing stores it yet (its column is the journey lane's, spec 2026-10-09 D40), so it
 * is derived: businessShape says it for a turn, and the check that makes a campaign, which holds no turn, asks it
 * straight (campaigns/playbooks.ts checkPlaybookInput).
 */
export const appointmentWordFor = (sells: SellsBy | null): AppointmentWord =>
  appointmentWordOf({ stored: null, sellsBy: sells });

/** How the business works, as Campaigns' moments and Ask say it: one read of the facts that shape the journey. */
interface BusinessShape {
  /** How its customers buy (tenants.sells_by, 0008); null where it was not asked yet. */
  sellsBy: SellsBy | null;
  dealsOn: boolean;
  /** What it calls an appointment (appointmentWordFor): derived from how its customers buy until it is stored. */
  word: AppointmentWord;
  /**
   * Its bookings arrive by a booking tool's emails (the settings' `bookings.tool`, 00345). With no calendar feed, its
   * appointment moments need the feed (decision 0002 owes their reading of the appointments record).
   */
  bookingsByEmail: boolean;
}

/**
 * The business's shape (spec 2026-10-09 §4.8): GET playbooks answers it beside the moments' pools, and Ask's shape block
 * says it, through the turn's own readers of how customers buy and of the settings. Settings that cannot be read cost the
 * booking tool's word, never the shape.
 */
export const businessShape: Reader<undefined, BusinessShape> = {
  name: "businessShape",
  async read(rc) {
    const [sells, settings] = await Promise.all([
      load(rc, sellsBy, undefined).then((r) => r.data),
      load(rc, config, undefined).then(
        (r) => r.data,
        () => null,
      ),
    ]);
    const parsed = parseTenantConfig(settings?.config ?? null);
    return {
      data: {
        sellsBy: sells,
        dealsOn: dealsAreOn(sells),
        word: appointmentWordFor(sells),
        bookingsByEmail: !!parsed?.bookings?.tool,
      },
      rows: [],
      stamp: stamp(),
    };
  },
};

/**
 * How to read the calendar's zone and settings from the turn (server/calendar/people-visits.ts ZoneAndSettings), for a function that
 * reads them only where its calendar lookup would: through the facts and config readers above, so a turn reads each
 * once, and a read of either that fails fails where the lookup's own did.
 */
export const zoneAndSettings = (rc: ReaderContext) => (): Promise<{ timezone: string; config: unknown }> =>
  Promise.all([load(rc, facts, undefined), load(rc, config, undefined)]).then(([zone, settings]) => ({
    timezone: zone.data.timezone,
    config: settings.data?.config ?? null,
  }));
