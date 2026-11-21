/**
 * Whether AI can answer the WhatsApp chat an ad made here opens (decision 0050, call 11; the Ads plan's 5.1): read
 * where each fact already is, every time, never trusted from memory. The workspace's active WhatsApp number and Meta's
 * last word on it (the standing Settings shows), whether billing is paused, and whether AI is stopped, judged by the one
 * rule (contracts adWayInOf) against the exact number the ad names.
 *
 * Two readers ask it. Turn on's job, just before it switches anything on: a way in that closed since the press stops
 * the launch (launch.ts). And each read of an account: every ad made here that its owner has on is judged, and what
 * stands in its way kept on the ad (00676 ad_way_in_keep), which says Needs you on its badge and rings the owner, in
 * words that say what the ad can still spend; an unknown word only once it has stood an hour, so one read that could not
 * tell wakes nobody. Told, never acted on: the owner decides whether to pause it.
 */
import {
  adStateOfRow,
  adWayInOf,
  adWayInRowOf,
  standingFromConfig,
  type AdWayIn,
  type TenantId,
} from "@chanlytics/contracts";
import { keepAdWayIns, listMadeAds, type AdMadeRow, type AdWayInKept } from "@chanlytics/db/ads";
import { findWhatsappChannelFacts, isWorkspacePaused } from "@chanlytics/db/campaigns";
import type { Database } from "@chanlytics/db/types";
import { isSendingStopped } from "@chanlytics/db/workspace";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { logger } from "../../shared/log.js";

type Db = SupabaseClient<Database>;

/** What the way in of every ad of a workspace is judged from, read once for them all. */
async function readWayFacts(db: Db, tenantId: TenantId) {
  const [number, paused, stopped] = await Promise.all([
    findWhatsappChannelFacts(db, tenantId),
    isWorkspacePaused(db, tenantId),
    isSendingStopped(db, tenantId),
  ]);
  return {
    number: number && { e164: number.number, canSend: standingFromConfig(number.config.standing)?.can_send ?? null },
    paused,
    stopped,
  };
}

/** The way in of the chat an ad opens with the number it names, read now. */
export async function wayInNow(db: Db, tenantId: TenantId, named: string | null): Promise<AdWayIn> {
  return adWayInOf({ named, ...(await readWayFacts(db, tenantId)) });
}

/** The number an ad made here names, as its owner approved it; null where it names none. */
const namedOf = (row: AdMadeRow): string | null => {
  const approved = row.approved && typeof row.approved === "object" && !Array.isArray(row.approved) ? row.approved : {};
  const number = Reflect.get(approved, "whatsapp");
  return typeof number === "string" && number.trim() ? number : null;
};

/**
 * Whether its owner has it running: on, made, and its run not over. Read with no way in on it, so what stands in its way
 * never decides whether it is judged.
 */
const running = (row: AdMadeRow, at: { nowMs: number; timezone: string }): boolean =>
  row.intent === "on" && !["finished", "ended"].includes(adStateOfRow({ ...row, way_in: null }, at));

/**
 * Every ad made here of one account, judged and kept: what stands in its way where it runs, nothing where AI answers it
 * or it does not run, and the bell's words for one whose way in is closed. Answers what the door did, or null where the
 * database holds no door for it yet.
 */
export async function keepWaysIn(
  db: Db,
  log: ReturnType<typeof logger>,
  who: { tenantId: TenantId; account: { id: string; currency: string; timezone: string | null } },
): Promise<{ moved: number; rung: number; closed: number } | null> {
  const ads = (await listMadeAds(db, who.tenantId, who.account.id)).filter((row) => row.origin === "chanlytics");
  if (ads.length === 0) return null;
  const facts = await readWayFacts(db, who.tenantId);
  const at = { nowMs: Date.now(), timezone: who.account.timezone ?? "UTC" };
  const ways = ads.map((row): AdWayInKept => {
    const way = running(row, at) ? adWayInOf({ named: namedOf(row), ...facts }) : "open";
    if (way === "open") return { ad_id: row.id, way_in: null };
    const left = row.budget_kind === "total" ? row.budget_left_minor : null;
    const said = adWayInRowOf({ name: row.name, wayIn: way, leftMinor: left, currency: who.account.currency });
    return { ad_id: row.id, way_in: way, ...said };
  });
  const kept = await keepAdWayIns(db, who.tenantId, who.account.id, ways);
  if (kept && (kept.moved > 0 || kept.rung > 0 || kept.closed > 0))
    log.info("ads_way_in", { account_id: who.account.id, ...kept, closed_ways: ways.filter((w) => w.way_in).length });
  return kept;
}
