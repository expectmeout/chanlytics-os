import "server-only";
import { listPolicies } from "@chanlytics/db";
import { tenantFacts } from "../tenant";
import { sellsByOf } from "../deals";
import { stamp, type Reader } from "./index";

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
    const { data, error } = await rc.ctx.supabase
      .from("tenant_config")
      .select("config, version")
      .eq("tenant_id", rc.tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { data: data ? { config: data.config, version: data.version } : null, rows: [], stamp: stamp() };
  },
};
