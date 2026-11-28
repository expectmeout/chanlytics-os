/**
 * One launch's pass (launch.ts; decision 0050, calls 5 and 6): whose launch it is and what it has made so far, its calls
 * to Meta, each sent once with Meta's pace kept, its door, where every step is kept before the next is asked of Meta,
 * and the campaign read back whole, which is how Meta is asked what it holds. What the launch itself and its switches
 * (switches.ts) both stand on.
 */
import {
  callMetaAds,
  metaCampaignReadBackRequest,
  parseMetaCampaignHeld,
  parseMetaRefusal,
  type MetaAdsAnswer,
  type MetaCampaignHeld,
  type MetaUsage,
} from "@chanlytics/channels/ads";
import { SECOND_MS, type AdStopped, type TenantId } from "@chanlytics/contracts";
import { keepAdLaunch, type AdLaunchRow, type AdLaunchStep, type AdPartKept } from "@chanlytics/db/ads";
import type { Database } from "@chanlytics/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { logger } from "../../shared/log.js";
import type { MetaSignIn } from "../meta-facts.js";
import { ADS_USAGE_HOLD_PCT } from "../pace.js";
import type { AdsWrites } from "../tell.js";
import type { LaunchApproved, LaunchMoment } from "./parts.js";
import { sandboxAnswer, sandboxHeld } from "./sandbox.js";

export type Db = SupabaseClient<Database>;
export type Log = ReturnType<typeof logger>;
/** One request to Meta, as the wire sends it. */
export type MetaRequest = Parameters<typeof callMetaAds>[0];

/** No call is started with less than this left of the job: its answer and the write after it end inside it. */
const CALL_ROOM_MS = 25 * SECOND_MS;

/** Whose launches are sent, how, and the time the job has. */
export interface Launcher {
  tenantId: TenantId;
  signIn: MetaSignIn;
  writes: AdsWrites;
  account: { id: string; externalId: string; currency: string };
  deadline: number;
}

/** One launch's pass: what it has made, what Meta's last answer said of the pace, and what it called. */
export interface Pass {
  db: Db;
  log: Log;
  who: Launcher;
  ad: AdLaunchRow;
  approved: LaunchApproved;
  parts: Map<string, AdPartKept>;
  launch: Record<string, unknown>;
  usage: MetaUsage | null;
  calls: number;
  /** Its owner cancelled it, or a yes taken back did (00676): the launch stops at its next step. */
  cancelled: boolean;
}

/** What stopping a launch needs of its pass: never what was approved, which a stop may not have. */
export type Stopping = Omit<Pass, "approved">;

/** What a step came to: Meta's id for it, a stop with why, a wait for a later pass, or Meta's sign-in gone. */
export type Step = { id: string } | { stop: AdStopped; said: string | null } | { wait: true } | { revoked: true };

/** How a part is named on a pass: its kind and its version. */
export const partKey = (kind: AdPartKept["kind"], version: number): string => `${kind}:${version}`;
/** Whether a call may still be started on this pass: time left for its answer, and Meta not holding the account back. */
export const hasRoom = (pass: Stopping): boolean =>
  Date.now() <= pass.who.deadline - CALL_ROOM_MS && (pass.usage === null || pass.usage.pct < ADS_USAGE_HOLD_PCT);

/** The switch that lets an ad start: its campaign's, the last one sent. */
export const LAST_SWITCH = "campaign";

/** The switches a launch has kept as done, by part. */
export const switchedOf = (launch: Record<string, unknown>): string[] =>
  Array.isArray(launch.switched) ? launch.switched.map(String) : [];

/** Whether the campaign's switch is out or done: from then on the ad may be running, whatever stopped the launch after. */
export const mayBeOn = (pass: Stopping): boolean =>
  pass.launch.switching === LAST_SWITCH || switchedOf(pass.launch).includes(LAST_SWITCH);

/* ------------------------------------------------------------------------------------------- the calls -- */

/** One more call counted on the pass, and Meta's pace as its answer says it. */
function heardFrom(pass: Stopping, answer: MetaAdsAnswer): void {
  pass.calls += 1;
  if (answer.usage !== null) pass.usage = answer.usage;
}

/** One call to Meta for a step: sent once, its pace kept on the pass, and a line for Health. */
export async function send(pass: Stopping, at: string, request: MetaRequest): Promise<MetaAdsAnswer> {
  const began = Date.now();
  const answer =
    pass.who.writes === "live" ? await callMetaAds(request) : sandboxAnswer(request, `${pass.ad.id}:${at}`);
  heardFrom(pass, answer);
  const refusal = answer.fault === null ? null : parseMetaRefusal(answer.json);
  pass.log.info("ads_launch_step", {
    ad_id: pass.ad.id,
    at,
    outcome: answer.fault ?? "ok",
    ms: Date.now() - began,
    ...(refusal ? { code: refusal.code, subcode: refusal.subcode, fields: refusal.fields } : {}),
    ...(answer.usage ? { usage_pct: answer.usage.pct } : {}),
  });
  return answer;
}

/** Meta's own words for a refusal, for the owner, in quotes; else what the wire said. */
export const metaWordsOf = (answer: MetaAdsAnswer): string | null =>
  parseMetaRefusal(answer.json)?.words ?? answer.said;

/**
 * A step's door: what it made, sent or found kept. Answers `going`, or why the launch stops here: its owner cancelled it
 * meanwhile (00676), or its account was let go (a disconnect).
 */
export async function keepStep(pass: Stopping, step: AdLaunchStep): Promise<"going" | "cancelled" | "disconnected"> {
  for (const part of step.objects ?? []) pass.parts.set(partKey(part.kind, part.version), part);
  if (step.launch) Object.assign(pass.launch, step.launch);
  const after = await keepAdLaunch(pass.db, pass.who.tenantId, pass.ad.id, step);
  if (step.status !== undefined) return "going";
  if (after.cancelled) return "cancelled";
  return after.status === "sending" ? "going" : "disconnected";
}

/** A launch its door let go of stops, for the door's reason. */
export const letGoFor = (reason: "cancelled" | "disconnected"): Step => ({ stop: reason, said: null });

/** A launch's write went unanswered: when, kept, so it is followed and never sent again. */
export const unanswered = (pass: Pass) =>
  keepStep(pass, {
    launch: {
      unknown_at: typeof pass.launch.unknown_at === "string" ? pass.launch.unknown_at : new Date().toISOString(),
    },
  });

/* ----------------------------------------------------------------------------------------- what Meta holds -- */

/** The campaign read back whole: what Meta holds, or how the pass ended. */
export async function campaignReadBack(
  pass: Pass,
  built: { campaign: string; set: string; ads: string[] },
  moment: LaunchMoment,
): Promise<MetaCampaignHeld | Exclude<Step, { id: string }>> {
  if (!hasRoom(pass)) return { wait: true };
  const { token, appSecret } = pass.who.signIn;
  const answer = await send(pass, `read_back_${moment}`, metaCampaignReadBackRequest(token, appSecret, built.campaign));
  if (answer.fault === "revoked") return { revoked: true };
  if (answer.fault !== null) return { wait: true };
  if (pass.who.writes !== "live")
    return sandboxHeld({ ad: pass.ad, approved: pass.approved, accountId: pass.who.account.externalId }, built, moment);
  try {
    return parseMetaCampaignHeld(answer.json, pass.approved.currency);
  } catch {
    // An answer that is not a campaign is read again on a later pass: nothing is compared against it.
    return { wait: true };
  }
}
