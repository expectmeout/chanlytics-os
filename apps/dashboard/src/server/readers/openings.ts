import "server-only";
import { openingsFor, type OpeningsResult } from "../ask/openings";
import { load, stamp, type Reader } from "./index";
import * as facts from "./facts";

/**
 * GET ask/openings, as the route answers it: the open times for a day (or the next few) and a service, the palette's
 * fast path, computed as the phone receptionist computes them from the connected calendar in the business's zone, on
 * the turn's clock. The zone and the settings are the turn's (readers/facts.ts), so a turn reads the tenant once. The
 * route trims what it was asked; this takes it as given. An opening is not a row a citation names.
 */
export const openings: Reader<{ day: string | null; service: string | null }, { openings: OpeningsResult }> = {
  name: "openings",
  async read(rc, { day, service }) {
    const { timezone } = (await load(rc, facts.facts, undefined)).data;
    const settings = (await load(rc, facts.config, undefined)).data;
    const result = await openingsFor(rc.ctx, rc.tenantId, { day, service }, rc.now, {
      timezone,
      config: settings?.config ?? null,
    });
    return { data: { openings: result }, rows: [], stamp: stamp() };
  },
};
