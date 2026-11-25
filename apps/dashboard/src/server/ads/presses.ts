/**
 * An owner's presses on an ad, for the dashboard (decision 0050, calls 1, 2, 3, 9 and 10, and its Routes): Pause, Pause all, and
 * turning one back on; and, for a running ad made here, a new total, a new last day, new miles, or ending it for good
 * (the Ads plan's step 4, item 6). The edge keeps the press, holds Meta's token and tells Meta
 * (apps/edge/lib/ads/press.ts, change.ts); this hands it the ad, the version the press was drawn from and who pressed,
 * and says a refusal in words an owner can act on: what happened, and the one thing to do. Never a code.
 *
 * A change is judged here first, by the one rule the drawer drew its press with (contracts adChangeIssue), against
 * what Meta holds as the ad's row keeps it, so nothing is sent that would come back refused. While AI is stopped no ad
 * is turned back on, or given more to spend, from here (the Ads plan's G17); a pause, a cut and an end always go.
 */
import "server-only";
import { z } from "zod";
import {
  AD_PAUSE_ALL_MAX,
  AppError,
  SECOND_MS,
  UUID,
  adAmountAfter,
  adChangeFactsOf,
  adChangeIssue,
  adChangeMostOf,
  adChangeOnWayOf,
  adChangeSpendsMore,
  metaAdConfigOf,
  type AdChangeAsk,
  type AdChangeIssue,
} from "@chanlytics/contracts";
import { findAd, findAdAccount } from "@chanlytics/db/ads";
import { AD_ACCOUNT_NOT_CONNECTED } from "./draft";
import { callEdge, edgeConfigured, type EdgeAnswer, type EdgeRead } from "../shared/edge";
import { deployment } from "../shared/env";
import { aiStoppedAt } from "../readers/ads-page";
import { getStoredConfig } from "../workspace/config-row";
import type { Member } from "../shared/route";
import type { RouteContext } from "../shared/with-route";

/** How long a press waits for the edge: its own door, Meta's change and the ad read back. */
const PRESS_WAIT_MS = 45 * SECOND_MS;

/** What a press came to, as the page reads it. */
interface AdPressed {
  /**
   * told: Meta took it. sent: no answer yet. soon: sent when Meta will take it. took_back, same: nothing to send.
   * asked: Check asked Meta what stands, and the page says it once that read is in.
   */
  outcome: "told" | "sent" | "soon" | "took_back" | "same" | "asked";
  version: number;
}

type Answer = EdgeAnswer<EdgeRead<"/api/admin/ads/press">>;

/** An owner's press on an ad: Pause, turn it back on, Check what Meta holds of one, or change one made here. */
type AdPressOp = "pause" | "resume" | "check" | "change";

const STALE = "This ad changed since the page was read. Look again, then press.";

/**
 * What one ad of a pause of them all came to, as the page reads it. soon: kept, and Meta is told at its pace. took_back:
 * it undid a turning back on Meta was never told of, so the ad stands paused. same: it stood paused already. stale,
 * not_found, not_ready: not kept, and why. unknown: no answer came, so whether it was kept is not known.
 */
const PAUSED_ONE = ["soon", "took_back", "same", "stale", "not_found", "not_ready", "unknown"] as const;

interface AdPausedOne {
  id: string;
  outcome: (typeof PAUSED_ONE)[number];
  /** Its version once kept; null where it was not, or nobody knows. */
  version: number | null;
}

/** The words a refusal of the edge's is said in. */
function pressRefusalOf(answer: Answer, op: keyof typeof PRESS_DOING): AppError {
  const code = answer.body?.error;
  if (code === "ad_account_not_owner")
    return new AppError(
      "forbidden",
      op === "change" ? "Only the owner can change an ad." : "Only the owner can pause an ad or turn one back on.",
      403,
    );
  if (code === "ad_stale") return new AppError("conflict", STALE, 409);
  if (code === "ad_cant_resume")
    return new AppError("conflict", "This ad is turned back on in Meta, where its amount is set.", 409);
  if (code === "ad_busy")
    return new AppError("conflict", "Meta is still taking the last change to this ad. Press again in a minute.", 409);
  if (code === "ai_stopped")
    return new AppError(
      "conflict",
      op === "resume_all"
        ? "AI is stopped, so no ad is turned back on. Resume AI first."
        : "AI is stopped, so no ad is given more to spend. Start AI again first.",
      409,
    );
  if (code === "ads_writes_off")
    return new AppError("conflict", "Changing an ad from here isn't turned on yet. Change it in Meta.", 409);
  if (code === "meta_signed_out")
    return new AppError("conflict", "Meta signed Chanlytics out. Connect again, or change the ad in Meta.", 409);
  if (code === "meta_refused") return metaRefused(answer.body?.detail);
  if (code === "not_found") return new AppError("not_found", "That ad is no longer here.", 404);
  if (code === "ad_not_ready")
    return new AppError("conflict", "This ad can't be changed from here right now. Change it in Meta.", 409);
  return new AppError("upstream_provider", `Couldn't ${PRESS_DOING[op]} just now. Nothing was changed. Try again.`);
}

/** Meta didn't take the change: its own words in quotes, where it gave them, and that nothing changed. */
function metaRefused(detail: unknown): AppError {
  const words = typeof detail === "string" ? detail.trim().slice(0, 200) : "";
  return new AppError(
    "upstream_provider",
    words
      ? `Meta didn't take the change: “${words}” Nothing was changed.`
      : "Meta didn't take the change, so nothing was changed. Change it in Meta.",
  );
}

/** What each press does, in the words its refusal says it could not. */
const PRESS_DOING: Record<AdPressOp | "pause_all" | "resume_all" | "cancel", string> = {
  pause: "pause it",
  resume: "turn it back on",
  check: "ask Meta about it",
  change: "change it",
  pause_all: "pause them",
  resume_all: "turn them back on",
  cancel: "cancel it",
};

const PRESS_OUTCOMES: readonly AdPressed["outcome"][] = ["told", "sent", "soon", "took_back", "same", "asked"];

/** A change as the edge's door takes it: the ask, what Meta held when it was drawn, and the most a raise names. */
type AdChangeSent = AdChangeAsk & { from_minor?: number; from_ends_at?: string; expect_max_minor?: number };

/** A press, handed to the edge, and what it came to. */
async function sendPress(
  ctx: RouteContext,
  member: Member,
  press: { op: AdPressOp; adId: string; version: number; change?: AdChangeSent },
): Promise<AdPressed> {
  // A preview never reaches Meta under a business's name, as no provider door does.
  if (!edgeConfigured() || !deployment.providersLive)
    throw new AppError("conflict", "Changing an ad from here isn't available here. Change it in Meta.", 409);
  const answer: Answer = await callEdge(
    "/api/admin/ads/press",
    {
      op: press.op,
      tenant_id: member.tenantId,
      user_id: ctx.userId,
      ad_id: press.adId,
      version: press.version,
      ...(press.change ? { change: press.change } : {}),
    },
    { workspace: member.tenantId, user: ctx.userId, timeoutMs: PRESS_WAIT_MS },
  );
  const body = answer.body ?? {};
  if (answer.status !== 200 || body.ok !== true) throw pressRefusalOf(answer, press.op);
  const outcome = PRESS_OUTCOMES.find((one) => one === body.outcome) ?? "sent";
  return { outcome, version: typeof body.version === "number" ? body.version : press.version };
}

/** `POST ads/:id/pause` and `POST ads/:id/resume`, and Check: the press, handed to the edge. */
export async function pressAd(
  ctx: RouteContext,
  member: Member,
  press: { op: "pause" | "resume" | "check"; adId: string; version: number },
): Promise<AdPressed> {
  if (press.op === "resume" && aiStoppedAt(await getStoredConfig(ctx.supabase, member.tenantId)) !== null)
    throw new AppError("conflict", "AI is stopped, so no ad is turned back on. Start AI again first.", 409);
  return sendPress(ctx, member, press);
}

/** What a change press carries beside the ask: what Meta held when it was drawn, and the most a raise names. */
interface AdChangePressed {
  from_minor?: number | undefined;
  from_ends_at?: string | undefined;
  expect_max_minor?: number | null | undefined;
}

/** A change the rule says can't be sent as asked, in words an owner can act on. */
const ISSUE_WORDS: Record<Exclude<AdChangeIssue["code"], "same">, string> = {
  under_least: "Meta takes a larger total for this run. Pick the amount again, then press.",
  under_spent: "Meta keeps the total above what this ad has spent. Pick a larger amount, then press.",
  over_most: "That's more than the most you set for any ad. Pick a smaller amount, then press.",
  not_whole: "Meta takes whole amounts. Pick a whole amount, then press.",
  too_soon: "An ad runs at least a whole day. Pick a later day, then press.",
  too_long: "The total doesn't cover that many days at Meta's least. Raise the amount first.",
  miles: "Pick 1 to 50 miles, then press.",
  wide: "This ad is shown across a wider place. Change where it shows in Meta.",
};

/** The ad and its account, judged as the rule reads them: what stops this change before the edge is asked. */
async function judgeChange(
  ctx: RouteContext,
  member: Member,
  press: { adId: string; ask: AdChangeAsk; pressed: AdChangePressed },
): Promise<{ code: "same" } | null> {
  const row = await findAd(ctx.supabase, member.tenantId, press.adId);
  if (!row) throw new AppError("not_found", "That ad is no longer here.", 404);
  if (row.origin !== "chanlytics") throw new AppError("conflict", "An ad made in Meta is changed in Meta.", 409);
  if (row.intent === "ended") throw new AppError("conflict", "This ad has ended. Nothing more can be changed.", 409);
  const account = await findAdAccount(ctx.supabase, member.tenantId, row.account_id);
  const minDaily = account ? metaAdConfigOf(account.config).min_daily_minor : null;
  if (!account || account.status !== "connected" || account.currency === null || minDaily === null)
    throw new AppError("conflict", AD_ACCOUNT_NOT_CONNECTED, 409);
  const nowMs = Date.now();
  const facts = adChangeFactsOf(
    row,
    {
      currency: account.currency,
      minDailyMinor: minDaily,
      ownerMostMinor: account.most_minor,
      timezone: account.timezone ?? "UTC",
    },
    nowMs,
  );
  if (facts === null)
    throw new AppError("conflict", "Meta hasn't said this ad's total and end yet. Look again soon.", 409);
  const issue = adChangeIssue(press.ask, facts);
  // What Meta holds already: the same press again, answered as itself (a double tap, a retry), with nothing sent.
  if (issue?.code === "same") return issue;
  const onWay = adChangeOnWayOf(row.change);
  if (onWay?.unsure)
    throw new AppError(
      "conflict",
      "Meta hasn't said yet whether it took the last change. Look again in a minute.",
      409,
    );
  if (onWay !== null && onWay.what !== press.ask.what && press.ask.what !== "end")
    throw new AppError(
      "conflict",
      "Another change to this ad is on its way to Meta. Press again once it's there.",
      409,
    );
  if (press.ask.what === "total" && adAmountAfter(row.amounts_at ?? [], nowMs) !== null)
    throw new AppError(
      "conflict",
      "Meta takes four changes of an amount an hour. Change it again a little later.",
      409,
    );
  // What the press was drawn from is what Meta held then: one changed in Meta since is never put back.
  const fromTotal = press.ask.what === "total" && press.pressed.from_minor !== row.budget_minor;
  const fromEnd = press.ask.what === "end_day" && press.pressed.from_ends_at !== row.ends_at;
  if (fromTotal || fromEnd) throw new AppError("conflict", STALE, 409);
  if (issue !== null) throw new AppError("conflict", ISSUE_WORDS[issue.code], 409);
  // A raise names its most, and the press carries it: one drawn from another total is refused (decision 0050, call 3).
  if (adChangeMostOf(press.ask, facts) !== (press.pressed.expect_max_minor ?? null))
    throw new AppError("conflict", STALE, 409);
  const spends = adChangeSpendsMore(press.ask, facts);
  if (spends && aiStoppedAt(await getStoredConfig(ctx.supabase, member.tenantId)) !== null)
    throw new AppError("conflict", "AI is stopped, so no ad is given more to spend. Start AI again first.", 409);
  return null;
}

/**
 * `POST ads/:id/budget`, `end-date`, `area` and `end`: an owner's change to a running ad made here, judged against what
 * Meta holds, then handed to the edge, which keeps it, sends Meta's dry run and then the change.
 */
export async function changeAd(
  ctx: RouteContext,
  member: Member,
  press: { adId: string; version: number; ask: AdChangeAsk; pressed?: AdChangePressed },
): Promise<AdPressed> {
  const pressed = press.pressed ?? {};
  const issue = await judgeChange(ctx, member, { adId: press.adId, ask: press.ask, pressed });
  if (issue?.code === "same") return { outcome: "same", version: press.version };
  return sendPress(ctx, member, {
    op: "change",
    adId: press.adId,
    version: press.version,
    change: {
      ...press.ask,
      ...(pressed.from_minor === undefined ? {} : { from_minor: pressed.from_minor }),
      ...(pressed.from_ends_at === undefined ? {} : { from_ends_at: pressed.from_ends_at }),
      ...(typeof pressed.expect_max_minor === "number" ? { expect_max_minor: pressed.expect_max_minor } : {}),
    },
  });
}

/** What pausing every ad of a set came to, ad by ad, in the order asked. */
/**
 * What a press on a set of ads takes (`POST ads/pause-all`, `POST ads/resume-stopped`): one to AD_PAUSE_ALL_MAX ads, each
 * an id and the version it was drawn from, and none twice.
 */
export const AdSetPressBodySchema = z.object({
  ads: z
    .array(z.object({ id: z.string().regex(UUID), version: z.number().int().min(1) }))
    .min(1)
    .max(AD_PAUSE_ALL_MAX)
    .refine((ads) => new Set(ads.map((ad) => ad.id)).size === ads.length, "Each ad once."),
});

interface AdsPausedAll {
  ads: AdPausedOne[];
}

/**
 * `POST ads/pause-all`: every ad of a set paused at once, each with the version it was drawn from (the Ads plan's G17:
 * AI stopped with ads still on). The edge keeps every pause in one transaction before it answers, and tells Meta at
 * Meta's pace (apps/edge/lib/ads/press.ts, pause_all), so a tab that closes after the press leaves none running that it meant to
 * pause. Where the edge gave no answer in time, whether the pauses were kept is not known: each ad says so, and the page
 * reads what stands. Pressed again, each is kept once (a pause of a paused ad is the same press). A pause always goes,
 * AI stopped or not.
 */
export async function pauseAllAds(
  ctx: RouteContext,
  member: Member,
  ads: readonly { id: string; version: number }[],
): Promise<AdsPausedAll> {
  return pressAdSet({ ctx, member, ads }, "pause_all", PAUSED_ONE);
}

/**
 * A press on a set of ads at the edge, each with the version it was drawn from, kept there in one transaction before it
 * answers: what each came to, one of `words`, or `unknown` where the edge gave no answer in time or named none for it.
 */
async function pressAdSet<Word extends string>(
  press: { ctx: RouteContext; member: Member; ads: readonly { id: string; version: number }[] },
  op: "pause_all" | "resume_all",
  words: readonly Word[],
): Promise<{ ads: { id: string; outcome: Word | "unknown"; version: number | null }[] }> {
  const { ctx, member, ads } = press;
  if (!edgeConfigured() || !deployment.providersLive)
    throw new AppError("conflict", "Changing an ad from here isn't available here. Change it in Meta.", 409);
  const answer: Answer = await callEdge(
    "/api/admin/ads/press",
    {
      op,
      tenant_id: member.tenantId,
      user_id: ctx.userId,
      ads: ads.map((ad) => ({ ad_id: ad.id, version: ad.version })),
    },
    { workspace: member.tenantId, user: ctx.userId, timeoutMs: PRESS_WAIT_MS },
  );
  const body = answer.body ?? {};
  if (body.error === "edge_timeout")
    return { ads: ads.map((ad) => ({ id: ad.id, outcome: "unknown", version: null })) };
  if (answer.status !== 200 || body.ok !== true) throw pressRefusalOf(answer, op);
  const answered = new Map((body.ads ?? []).map((one) => [one.ad_id, one]));
  return {
    ads: ads.map((ad) => {
      const one = answered.get(ad.id);
      return {
        id: ad.id,
        outcome: words.find((word) => word === one?.outcome) ?? "unknown",
        version: one?.version ?? null,
      };
    }),
  };
}

/** What one ad of a turning back on came to: as a pause of them all says it, or `not_stopped` for one the stop didn't pause. */
const RESUMED_ONE = [...PAUSED_ONE, "not_stopped"] as const;

interface AdResumedOne {
  id: string;
  outcome: (typeof RESUMED_ONE)[number];
  version: number | null;
}

/**
 * `POST ads/resume-stopped`: the owner turns back on the ads Stop everything paused, as a press of its own after Resume
 * (the content loop PRD's 14.1, call 21: Resume never turns an ad on, since that spends). Each carries the version it was
 * drawn from; each the stop paused and that stands so is turned back on, in one transaction, and Meta told at its pace.
 * Refused while AI is stopped.
 */
export async function resumeStoppedAds(
  ctx: RouteContext,
  member: Member,
  ads: readonly { id: string; version: number }[],
): Promise<{ ads: AdResumedOne[] }> {
  return pressAdSet({ ctx, member, ads }, "resume_all", RESUMED_ONE);
}

/** What a Cancel came to: on its way to the job setting it up, asked already, too late (made), or over. */
const CANCELLED = ["asked", "same", "made", "stopped"] as const;

/**
 * `POST ads/:id/cancel`: the owner cancels an ad made here while it is set up (the Ads plan's 4.7, point 8). The edge
 * keeps it on its launch, and the account's job stops it at its next step and removes what it made; nothing is switched
 * on after. One made already answers `made`, where its Pause stops it.
 */
export async function cancelAd(
  ctx: RouteContext,
  member: Member,
  adId: string,
): Promise<{ outcome: (typeof CANCELLED)[number]; version: number }> {
  if (!edgeConfigured() || !deployment.providersLive)
    throw new AppError("conflict", "Changing an ad from here isn't available here. Change it in Meta.", 409);
  const answer: Answer = await callEdge(
    "/api/admin/ads/press",
    { op: "cancel", tenant_id: member.tenantId, user_id: ctx.userId, ad_id: adId },
    { workspace: member.tenantId, user: ctx.userId, timeoutMs: PRESS_WAIT_MS },
  );
  const body = answer.body ?? {};
  if (answer.status !== 200 || body.ok !== true) throw pressRefusalOf(answer, "cancel");
  return {
    outcome: CANCELLED.find((word) => word === body.outcome) ?? "asked",
    version: typeof body.version === "number" ? body.version : 0,
  };
}
