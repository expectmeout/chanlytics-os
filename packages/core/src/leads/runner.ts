/**
 * The runner (PRD §0.5, §12.5): the three jobs of the lead finder and the
 * sweep's reconciliation, over ports.
 *
 *   startRound   lead_round_start  a run row per term, made by its deterministic
 *                                  id, claimed, and only then started at the
 *                                  provider; a lost answer stays unknown
 *   collect      lead_collect      one batch of a run's items per commit: clean,
 *                                  identity, judge, classify, distance, commit
 *   check        lead_check        one checker run per batch of addresses
 *   reconcileUnknownRuns           the provider's own list, by our run row id
 *
 * The rules the verbs keep: a claim before any provider call (E1); a lease
 * with an owner and a generation, and one commit per batch that inserts,
 * settles, advances the offset by compare-and-set and inserts the next job
 * (E3, E4); the judge's answer kept by operation id; code deciding the class
 * (§0.1); the deadline checked before every provider or model call, and the
 * offset committed before yielding. A provider's 429 or 5xx throws for the
 * ledger's waits; a refusal is an answer.
 *
 * The webhook token of a run row is derived from the row's id by the edge
 * (ports.webhookToken), so a job tried again can rebuild the URL its earlier
 * try sent without the row's stored hash ever being rewritten (E1).
 */
import {
  type LeadArea,
  LEAD_CARDS,
  LEAD_KIND_KEY,
  LEAD_ESTIMATE_MARGIN,
  LEAD_JUDGE_BATCH,
  classify,
  leadPhoneState,
  judgeAsked,
  type JudgePlaceAnswer,
  type LeadEmailState,
  type LeadRoundState,
  type LeadRunState,
  type LeadSearchPlan,
  MIN_MS,
} from "@chanlytics/contracts";
import { APIFY_RUN_END_EVENTS } from "@chanlytics/channels";
import { CARDS, CHECKER_RUN_TIMEOUT_SECS, MAPS_RUN_TIMEOUT_SECS, areaCenter, type LeadCardRunner } from "./cards";
import { cleanPlace, type CleanPlace } from "./clean";
import { discoveryEnding, FINAL_RUN_STATES, runStateOf, termsShortOf } from "./endings";
import { inArea, haversineM, medianCenter, nearestAreas, radiusFromSpread, type LatLng } from "./geo";
import { leadMarksFrom } from "./mark";
import { markImageFrom, MARK_MAX_BYTES } from "./mark-image";
import { runIdFor, sha256Hex } from "./ids";
import { foldDuplicates, identityOf, shareKeysOf, sharesWithin } from "./identity";
import { JUDGE_REFUSED_REASON, JUDGE_TIMEOUT_MS, factsOf, judgeBatch, opIdFor, type JudgedBatch } from "./judge";
import type {
  CollectCommitResult,
  CollectJudgment,
  CollectPage,
  CollectPlace,
  LeadMemberRow,
  LeadPorts,
  LeadRoundRow,
  LeadRunRow,
  LeadShare,
  MemberJudgment,
} from "./ports";
import { afterProbe } from "./question";
import { mainAsk, probeAsk, probeYield, runCaps } from "./sizing";

export const LEASE_SECONDS = 90;
export const FIRST_COLLECT_SECONDS = 20;
export const POLL_SECONDS = 15;
export const PAGE_ITEMS = 100;
export const CHECK_BATCH = 500;
/** No provider call starts with less than this left before the function is killed. */
export const DEADLINE_MARGIN_MS = 8_000;
/**
 * The judge's own margin: it may take its whole timeout to answer, so it is
 * never started with less than that left. A margin shorter than the call it
 * guards buys nothing -- the function is killed mid-call, the page is never
 * committed, and the batch is paid for twice when the job is tried again.
 */
export const JUDGE_MARGIN_MS = JUDGE_TIMEOUT_MS;
/** An unknown start with no run at the provider after this long is failed. */
export const UNKNOWN_START_GRACE_MS = 10 * MIN_MS;
/** The key our runs carry in their input, so the sweep can tell ours from anyone else's. */
export const INPUT_MARKER = "chanlyticsRunId";
/**
 * How far into the provider's own list a lost start is looked for: the list
 * answers a hundred runs since a time (channels apify.ts), and ours can be
 * anywhere in it -- a round starting three terms, or another search on the
 * same account, pushes it down. The list carries no input, so there is no
 * cheaper way than reading each run's input key until ours is found; stopping
 * at twenty failed a run the provider was still charging for.
 */
export const PROVIDER_RUN_PAGE = 100;
export const OUT_OF_AREA_REASON = "outside the area you asked for";
export const NO_LOCATION_REASON = "no location on the listing";
export const CLOSED_REASON = "closed on Google Maps";
export const DUPLICATE_REASON = "the same place, listed twice";

export type Phase = "probe" | "main";

/** A condition worth trying again that is not the provider's: the ledger's waits take it. */
export class LeadRetry extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadRetry";
  }
}

const iso = (d: Date) => d.toISOString();
/** The provider's two kinds of trouble, told by name: the class may come from another copy of the channels package (its dist, or a test's fake). */
const isRefused = (e: unknown): boolean => (e as { name?: string } | null)?.name === "ApifyRefused";
const isRetryable = (e: unknown): e is { name: string; status: number | null } =>
  (e as { name?: string } | null)?.name === "ApifyRetryable";
const minute = (p: LeadPorts) => Math.floor(p.now().getTime() / MIN_MS);
const outOfTime = (p: LeadPorts, marginMs: number = DEADLINE_MARGIN_MS) => p.now().getTime() + marginMs > p.deadline;
const webhookUrl = (p: LeadPorts, runRowId: string, token: string) =>
  `${p.webhookBase}/api/apify-webhook?run=${encodeURIComponent(runRowId)}&token=${encodeURIComponent(token)}`;
/** Round 1 runs to the plan's count (its probe asks for 25 of it); a later round to what lead_search_more set as its target. */
export const targetOf = (round: LeadRoundRow): number => (round.purpose === "probe" ? round.plan.count : round.target);
/** A member the judge answered for, as opposed to one left out or held by rule. */
const wasJudged = (m: LeadMemberRow): boolean => {
  const j = m.judgment as { answer?: unknown } | null;
  return !!j && typeof j === "object" && j.answer !== null && j.answer !== undefined;
};

/* ------------------------------------------------------------- the start */

export type TermOutcome = "started" | "reconciled" | "refused" | "unknown" | "someone_elses" | "already";
export type StartOutcome =
  | { kind: "not_open" }
  | { kind: "paused" }
  | { kind: "spent" }
  | { kind: "started"; phase: Phase; runs: { term: string; kind: TermOutcome }[] };

/** The provider's run that carries this row's id in its input, if one exists. */
async function findOurRun(
  p: LeadPorts,
  actor: string,
  row: LeadRunRow,
): Promise<{ id: string; status: string; datasetId: string | null } | null> {
  const since = new Date(Date.parse(row.claimed_at ?? row.created_at) - 5 * MIN_MS);
  const runs = await p.apify.listActorRuns(actor, iso(since));
  for (const r of runs.slice(0, PROVIDER_RUN_PAGE)) {
    const input = (await p.apify.runInput(r.id)) as Record<string, unknown> | null;
    if (input && input[INPUT_MARKER] === row.id) return r;
  }
  return null;
}

/**
 * The claim (E1). "mine" when this job holds the row and may start it. A row
 * this same job claimed earlier and never recorded is looked for at the
 * provider first: found, it is reconciled and "recovered"; not found, it is
 * "mine" to start. Anybody else's is "not_mine".
 */
async function claimOrRecover(
  p: LeadPorts,
  actor: string,
  row: LeadRunRow,
  owner: string,
): Promise<"mine" | "recovered" | "not_mine"> {
  if (await p.db.runClaim(row.id, owner)) return "mine";
  if (!(row.claimed_by === owner && row.state === "starting")) return "not_mine";
  const found = await findOurRun(p, actor, row);
  if (!found) return "mine";
  await p.db.runMarkUnknown(row.id, owner);
  await p.db.runReconcile(row.id, found.id, found.datasetId, runStateOf(found.status));
  await p.schedule("lead_collect", { run_id: row.id, seq: "p0" }, 0);
  return "recovered";
}

/** A start's trouble, sorted: a refusal fails the run through the reconcile door; no answer leaves it unknown; a busy provider throws for the ledger. */
async function startFailed(p: LeadPorts, row: LeadRunRow, owner: string, e: unknown): Promise<"refused" | "unknown"> {
  if (isRefused(e)) {
    await p.db.runMarkUnknown(row.id, owner);
    await p.db.runReconcile(row.id, null, null, "failed");
    return "refused";
  }
  if (isRetryable(e) && e.status === null) {
    // Nobody knows whether it runs. Never started again blindly; the sweep reconciles it (PRD §0.5).
    await p.db.runMarkUnknown(row.id, owner);
    return "unknown";
  }
  throw e; // 429 or 5xx: nothing started, and the row is this job's to start when the ledger tries again
}

export async function startRound(p: LeadPorts, roundId: string, owner: string, resume = false): Promise<StartOutcome> {
  const round = await p.db.round(roundId);
  if (!round || round.state === "ended") return { kind: "not_open" };
  if (!(await p.db.leadSearchesOn(round.tenant_id))) {
    await p.db.roundEnd(round.id, "paused");
    return { kind: "paused" };
  }
  // What this round still has reserved. Nothing left starts nothing: the
  // actor's cap floor is a floor on a cap, never a licence to spend money the
  // round never reserved (S6), so the round ends on the word for it instead.
  const leftUsd = round.cost_reserved_usd - round.cost_usd;
  if (leftUsd <= 0) {
    await p.db.roundEnd(round.id, "budget_used");
    return { kind: "spent" };
  }
  const plan = round.plan;
  const card = CARDS[plan.card];
  const phase: Phase = round.purpose === "probe" && !resume && round.state !== "running" ? "probe" : "main";

  let ask: { terms: string[]; perTerm: number[] };
  if (phase === "probe") {
    ask = probeAsk(plan);
  } else {
    // An answer that changed the plan (Include, Change what I asked) re-judges the places the probe already judged
    // under it first: what it lets in comes back, what it now leaves out goes, and the rest is sized from that.
    if (resume && round.answered === "include" && round.purpose === "probe") await rejudgeProbe(p, round);
    const members = await p.db.membersOfRound(round.id);
    const judged = members.filter(wasJudged);
    const counted = members.filter((m) => m.counted).length;
    // Round 1 sizes from its probe; a top-up or a renewal has no probe of its own and starts from an even yield.
    const y = round.purpose === "probe" ? probeYield(judged) : 0.5;
    // The question said "I'm dropping X: it mostly returned those", and a yes accepted it. An answer that changed the
    // plan is a new plan, and its terms are the owner's: the dropped one finds the very kind they just included.
    const dropTerm = round.answered === "keep" ? (round.question?.dropTerm ?? null) : null;
    ask = mainAsk(plan, targetOf(round) - counted, y, dropTerm);
  }
  const caps = runCaps(plan, ask.perTerm, leftUsd);

  const wanted: { id: string; term: string; hash: string; places: number; cap: number }[] = [];
  for (const [i, term] of ask.terms.entries()) {
    // placesToAsk may give a term nothing at all when little is left (S6): a run asked for no places, or with nothing left to cap it, is never started.
    if (ask.perTerm[i] <= 0 || caps[i] <= 0) continue;
    const id = await runIdFor(round.id, phase, term);
    wanted.push({ id, term, hash: await sha256Hex(await p.webhookToken(id)), places: ask.perTerm[i], cap: caps[i] });
  }
  if (!wanted.length) return { kind: "started", phase, runs: [] };
  const rows = await p.db.runsEnsure(
    wanted.map((w) => ({
      id: w.id,
      tenant_id: round.tenant_id,
      round_id: round.id,
      purpose: "discover",
      term: w.term,
      actor: card.actor,
      build: card.build,
      webhook_token_hash: w.hash,
      cap_usd: w.cap,
    })),
  );

  const outcomes: { term: string; kind: TermOutcome }[] = [];
  for (const w of wanted) {
    const row = rows.find((r) => r.id === w.id);
    if (!row) throw new Error(`lead_round_start: the run row for ${w.term} was not made`);
    if (row.state !== "claimed" && !(row.state === "starting" && row.claimed_by === owner)) {
      outcomes.push({ term: w.term, kind: "already" });
      continue;
    }
    if (outOfTime(p)) throw new LeadRetry("out of time before a start: the ledger tries the rest again");
    const claim = await claimOrRecover(p, card.actor, row, owner);
    if (claim !== "mine") {
      outcomes.push({ term: w.term, kind: claim === "recovered" ? "reconciled" : "someone_elses" });
      continue;
    }
    const token = await p.webhookToken(row.id);
    const input = { ...(card.buildInput(plan, w.term, w.places) as Record<string, unknown>), [INPUT_MARKER]: row.id };
    try {
      const started = await p.apify.startRun(card.actor, input, {
        build: card.build,
        timeoutSecs: MAPS_RUN_TIMEOUT_SECS,
        maxTotalChargeUsd: w.cap,
        webhooks: [{ eventTypes: [...APIFY_RUN_END_EVENTS], requestUrl: webhookUrl(p, row.id, token) }],
      });
      await p.db.runRecordStart(row.id, owner, started.id, started.datasetId, w.cap);
      await p.schedule("lead_collect", { run_id: row.id, seq: "p0" }, FIRST_COLLECT_SECONDS);
      outcomes.push({ term: w.term, kind: "started" });
    } catch (e) {
      outcomes.push({ term: w.term, kind: await startFailed(p, row, owner, e) });
    }
  }
  if (outcomes.length && outcomes.every((o) => o.kind === "refused")) await p.db.roundEnd(round.id, "source_failed");
  return { kind: "started", phase, runs: outcomes };
}

/* ----------------------------------------------------------- the collect */

export type CollectOutcome =
  | { kind: "gone" }
  | { kind: "not_started" }
  | { kind: "round_ended" }
  | { kind: "round_closing" }
  | { kind: "busy" }
  | { kind: "lost"; why: Exclude<CollectCommitResult, { ok: true }>["why"] }
  | {
      kind: "committed";
      commits: number;
      toOffset: number;
      runState: LeadRunState | null;
      roundState: LeadRoundState | null;
      judgeRefused: string | null;
    }
  | { kind: "checked"; results: number; last: boolean }
  | { kind: "stopped" }
  | { kind: "polling" };

interface Prepared {
  index: number;
  clean: CleanPlace;
  /** Left out or held by rule before any judging; null means the judge decides. `token` is the reason as contracts spells it. */
  rule: null | { class: "excluded" | "review"; reason: string; token: string; excluded_by: string | null };
}

/** Where a round's places are measured from: the plan's center, or for a city ask the median of the probe's places (E7, decision 31). */
export function centerOf(plan: LeadSearchPlan, members: LeadMemberRow[]): { center: LatLng | null; radiusM: number } {
  const fixed = areaCenter(plan);
  if (fixed) return { center: fixed, radiusM: plan.area.radius_m };
  const points = members
    .filter((m): m is LeadMemberRow & { lat: number; lng: number } => m.lat !== null && m.lng !== null)
    .map((m) => ({ lat: m.lat, lng: m.lng }));
  const center = medianCenter(points);
  return { center, radiusM: center ? radiusFromSpread(center, points) : plan.area.radius_m };
}

/**
 * Where to look next when a round ran dry (D3): the nearest ZIP centres past the area it measured from, three of them.
 * Nothing when the round has no centre yet (a city ask whose probe placed nothing).
 */
export function nearbyFor(plan: LeadSearchPlan, members: LeadMemberRow[]): LeadArea[] {
  const geo = centerOf(plan, members);
  if (!geo.center) return [];
  return nearestAreas(geo.center, { excludeWithinM: Math.max(geo.radiusM, 15_000), take: 3, state: plan.area.state });
}

/** What each key asked under a plan, worked out once per plan (judgeAsked hashes every question). */
const ASKED = new WeakMap<LeadSearchPlan, Record<string, string>>();
const askedOf = (plan: LeadSearchPlan): Record<string, string> => {
  let a = ASKED.get(plan);
  if (!a) ASKED.set(plan, (a = judgeAsked(plan)));
  return a;
};

/** One place as the commit takes it: the lead's columns, the member's class decided by code (§0.1), its shares. */
export function memberOf(
  plan: LeadSearchPlan,
  term: string,
  c: CleanPlace,
  a: JudgePlaceAnswer | null,
  opId: string | null,
  model: string | null,
  rule: Prepared["rule"],
  geo: { center: LatLng | null; radiusM: number },
  shares: LeadShare[],
  duplicateOf: string | null,
): CollectPlace {
  const loc = c.raw.location;
  const distance = geo.center && loc ? haversineM(geo.center, loc) : null;
  const picked = a && a.email_index !== null ? (c.emails[a.email_index] ?? null) : null;
  const emailState: LeadEmailState = picked ? "checking" : "none";
  // The class is code's (§0.1): contracts' classify from the judge's answers, or a rule that never reached the judge.
  let verdict: {
    class: "qualified" | "review" | "excluded";
    excluded_by: string | null;
    fit: "strong" | "look" | "long" | null;
    reasons: string[];
  };
  let reason: string;
  if (rule) {
    verdict = { class: rule.class, excluded_by: rule.excluded_by, fit: null, reasons: [rule.token] };
    reason = rule.reason;
  } else if (!a) {
    verdict = { class: "review", excluded_by: null, fit: null, reasons: ["judge:refused"] };
    reason = JUDGE_REFUSED_REASON;
  } else {
    verdict = classify(
      plan,
      a,
      factsOf(0, c),
      emailState,
      geo.center ? inArea(geo.center, geo.radiusM, loc) : true,
      leadPhoneState(c.phone),
    );
    reason = a.reason;
  }
  const excluded = verdict.class === "excluded";
  return {
    place: {
      place_id: c.raw.placeId,
      business_name: c.raw.title,
      category: c.raw.category,
      street: c.raw.street,
      city: c.raw.city,
      region: c.region ?? c.raw.state,
      postal_code: c.raw.postalCode,
      country: "US",
      lat: loc?.lat ?? null,
      lng: loc?.lng ?? null,
      website_host: c.host,
      instagram_url: c.raw.instagram,
      phone_e164: c.phone,
      phone_sources: c.phoneSources,
      // A left-out place never stores its candidate emails (PRD §0.4, §15).
      email: excluded ? null : picked,
      email_alternates: excluded
        ? []
        : c.emails
            .filter((e) => e !== picked)
            .slice(0, 4)
            .map((e) => ({
              email: e,
              why: c.host && e.endsWith(`@${c.host}`) ? "on their own domain" : "another domain",
            })),
      email_state: excluded ? "none" : emailState,
      rating: c.raw.rating,
      reviews: c.raw.reviews,
      // What the listing shows about the business (D2): kept for a lead, never for a left-out place (§0.4).
      neighborhood: excluded ? null : c.raw.neighborhood,
      about: excluded ? null : c.raw.about,
      hours: excluded ? [] : c.raw.hours,
      image_url: excluded ? null : c.raw.imageUrl,
      price: excluded ? null : c.raw.price,
      reviews_dist: excluded ? null : c.raw.reviewsDist,
      facebook_url: excluded ? null : c.raw.facebook,
      linkedin_url: excluded ? null : c.raw.linkedin,
      tiktok_url: excluded ? null : c.raw.tiktok,
      claimed: excluded ? null : c.raw.claimed,
      maps_url: excluded ? null : c.raw.mapsUrl,
      rank: excluded ? null : c.raw.rank,
      // The business's own mark (D6): read from its home page after the judge has decided, by markPlaces below,
      // with the copy of it we keep (00161).
      logo_url: null,
      mark_path: null,
    },
    member: {
      judgment: {
        op_id: opId,
        term,
        answer: a,
        model,
        reasons: verdict.reasons,
        ...(a ? { asked: askedOf(plan) } : {}),
      },
      class: verdict.class,
      excluded_by: verdict.excluded_by,
      fit: verdict.fit,
      reason: reason.slice(0, 120),
      distance_m: distance,
    },
    duplicate_of_place_id: duplicateOf,
    shares,
  };
}

/** The next batch of items from `cursor`: at most LEAD_JUDGE_BATCH places the judge must see, with the items around them. */
export function takeBatch(
  card: LeadCardRunner,
  items: unknown[],
  cursor: number,
): { end: number; prepared: Prepared[] } {
  const prepared: Prepared[] = [];
  let judgeable = 0;
  let end = cursor;
  while (end < items.length) {
    const mapped = card.mapItem(items[end]);
    if (mapped) {
      const clean = cleanPlace(mapped);
      const rule: Prepared["rule"] = mapped.closed
        ? { class: "excluded", reason: CLOSED_REASON, token: "closed", excluded_by: "closed" }
        : mapped.location === null
          ? { class: "review", reason: NO_LOCATION_REASON, token: "out_of_area", excluded_by: null }
          : null;
      if (!rule) {
        if (judgeable >= LEAD_JUDGE_BATCH) break;
        judgeable += 1;
      }
      prepared.push({ index: end, clean, rule });
    }
    end += 1;
  }
  return { end, prepared };
}

export async function collect(p: LeadPorts, runId: string, seq: string, owner: string): Promise<CollectOutcome> {
  const run = await p.db.run(runId);
  if (!run) return { kind: "gone" };
  const round = await p.db.round(run.round_id);
  if (!round) return { kind: "gone" };
  if (run.purpose === "check") return collectCheck(p, round, run, owner);
  if (seq === "stop" || seq.startsWith("stop.")) return stopRun(p, round, run, owner);
  if (round.state === "ended") {
    if (run.apify_run_id && !FINAL_RUN_STATES.has(run.state))
      await p.apify.abortRun(run.apify_run_id).catch(() => undefined);
    return { kind: "round_ended" };
  }
  // A round on its way out decides nothing more (PRD §0.5, decision 17). Stop
  // bumps the generation and schedules its own collect, but it never cancels
  // the polls already out: one of those, arriving after the round reached its
  // checks or had an ending left pending, would read the run as final, ask
  // roundDecision for a verdict and either start the next phase at the
  // provider or write over the ending the owner asked for. Nothing is
  // committed here, and anything still running is stopped.
  if (round.state === "checking" || round.ending_pending !== null) {
    if (run.apify_run_id && !FINAL_RUN_STATES.has(run.state))
      await p.apify.abortRun(run.apify_run_id).catch(() => undefined);
    return { kind: "round_closing" };
  }
  if (!run.apify_run_id && !FINAL_RUN_STATES.has(run.state)) return { kind: "not_started" };
  const gen = await p.db.runLease(run.id, owner, LEASE_SECONDS);
  if (gen === null) {
    await p.schedule("lead_collect", { run_id: run.id, seq: `${seq}.b` }, 30);
    return { kind: "busy" };
  }
  try {
    return await collectHeld(p, round, run, owner, gen);
  } finally {
    await p.db.runRelease(run.id, owner, gen);
  }
}

async function collectHeld(
  p: LeadPorts,
  round: LeadRoundRow,
  run: LeadRunRow,
  owner: string,
  gen: number,
): Promise<CollectOutcome> {
  const plan = round.plan;
  const card = CARDS[plan.card];
  const phase: Phase = (await runIdFor(round.id, "probe", run.term ?? "")) === run.id ? "probe" : "main";
  const alreadyFinal = FINAL_RUN_STATES.has(run.state);
  let remoteState: LeadRunState = run.state;
  let usage = run.usage_usd;
  let datasetId = run.dataset_id;
  if (!alreadyFinal) {
    if (outOfTime(p)) throw new LeadRetry("out of time before reading the run");
    try {
      const remote = await p.apify.getRun(run.apify_run_id as string);
      remoteState = runStateOf(remote.status);
      usage = remote.usageTotalUsd ?? usage;
      datasetId = remote.datasetId ?? datasetId;
    } catch (e) {
      if (!isRefused(e)) throw e;
      remoteState = "failed"; // the provider no longer has it: an answer
    }
  }
  const members = await p.db.membersOfRound(round.id);
  const geo = phase === "probe" ? { center: areaCenter(plan), radiusM: plan.area.radius_m } : centerOf(plan, members);

  // The page's own base: takeBatch answers an index into `items`, so both ends
  // of every batch are measured from where this page started reading. `from`
  // walks the batches; the base never moves, or a second batch would be added
  // to an offset that already absorbed the first and the next poll would skip
  // what the owner paid for.
  const base = run.read_offset;
  let from = base;
  const seen = run.items_seen;
  let items: unknown[] = [];
  if (datasetId && !alreadyFinal) {
    if (outOfTime(p)) throw new LeadRetry("out of time before reading the items");
    items = (await p.apify.listItems(datasetId, from, PAGE_ITEMS, [...card.fields])).items;
  }
  const remoteFinal = FINAL_RUN_STATES.has(remoteState);
  const pageShort = items.length < PAGE_ITEMS;
  const newMembers: CollectPlace[] = [];
  let commits = 0;
  let cursor = 0;
  let lastRoundState: LeadRoundState | null;
  let lastRunState: LeadRunState | null;
  let judgeRefused: string | null = null;

  do {
    const { end, prepared } = takeBatch(card, items, cursor);
    const isLastOfPage = end >= items.length;
    // Identity, by what the workspace already holds: place ids, suppressions, shared details (decision 25).
    const cleans = prepared.map((x) => x.clean);
    const { folded } = foldDuplicates(cleans);
    const keys = cleans.map(shareKeysOf);
    const [held, supp, shares] = await Promise.all([
      p.db.placeIdsHeld(
        round.tenant_id,
        cleans.map((c) => c.raw.placeId),
      ),
      // Every address a place carries, free mail included: a share key leaves gmail.com out because it names no
      // business, but a person at a gmail.com address can still have said stop (00174's unsubscribe).
      p.db.suppressed(round.tenant_id, {
        emails: cleans.flatMap((c) => c.emails),
        placeIds: cleans.map((c) => c.raw.placeId),
      }),
      p.db.sharesOf(round.tenant_id, {
        phones: keys.flatMap((k) => k.phones),
        emails: keys.flatMap((k) => k.emails),
        hosts: keys.flatMap((k) => k.hosts),
      }),
    ]);
    const within = sharesWithin(cleans.filter((c) => !folded.has(c.raw.placeId)));
    const toJudge: { prep: Prepared; ref: number }[] = [];
    const rows: { prep: Prepared; shares: LeadShare[]; duplicateOf: string | null }[] = [];
    for (const prep of prepared) {
      const idn = identityOf(prep.clean, held, supp.placeIds, shares);
      if (idn.kind === "already_yours" || idn.kind === "hidden") continue;
      const dup = folded.get(prep.clean.raw.placeId) ?? null;
      if (!prep.rule && geo.center && !inArea(geo.center, geo.radiusM, prep.clean.raw.location))
        prep.rule = { class: "review", reason: OUT_OF_AREA_REASON, token: "out_of_area", excluded_by: null };
      // A suppressed address is not a hidden place, but the email is never offered again.
      prep.clean.emails = prep.clean.emails.filter((e) => !supp.emails.has(e));
      rows.push({ prep, shares: [...idn.shares, ...(within.get(prep.clean.raw.placeId) ?? [])], duplicateOf: dup });
      if (!prep.rule && !dup) toJudge.push({ prep, ref: toJudge.length });
    }
    // The judge: one call for the batch, kept by operation id; refused twice is Needs review (§7.1).
    let judged: JudgedBatch = { answers: new Map(), judgment: null, model: null, refused: false, why: null };
    if (toJudge.length) {
      if (outOfTime(p, JUDGE_MARGIN_MS)) throw new LeadRetry("out of time before the judge");
      judged = await judgeBatch(
        p.judge,
        plan,
        toJudge.map((t) => factsOf(t.ref, t.prep.clean)),
        opIdFor(run.id, from, 0),
      );
      // The members say the plan's sentence; the judge's own word for the refusal rides the outcome, so the collect's line says why.
      if (judged.refused && judged.why) judgeRefused = judged.why;
    }
    const places = rows.map((r) => {
      const ref = toJudge.find((t) => t.prep === r.prep)?.ref;
      const answer = ref === undefined ? null : (judged.answers.get(ref) ?? null);
      const rule =
        r.duplicateOf && !r.prep.rule
          ? { class: "excluded" as const, reason: DUPLICATE_REASON, token: "duplicate", excluded_by: "duplicate" }
          : r.prep.rule;
      return memberOf(
        plan,
        run.term ?? "",
        r.prep.clean,
        answer,
        judged.judgment?.op_id ?? null,
        judged.model,
        rule,
        geo,
        r.shares,
        r.duplicateOf,
      );
    });
    // Their own marks, read from their own sites, before the page is committed with everything else about them.
    await markPlaces(p, places);
    newMembers.push(...places);

    const to = base + end;
    const runDone = isLastOfPage && pageShort && remoteFinal;
    const stopHere = !isLastOfPage && outOfTime(p);
    // The next collect rides the commit when this invocation will not read on: the page ended, or time is short.
    const next: CollectPage["next"] = runDone
      ? null
      : !isLastOfPage && !stopHere
        ? null
        : { kind: "lead_collect", seq: `p${to}`, run_after_seconds: isLastOfPage && pageShort ? POLL_SECONDS : 0 };
    const decision = runDone
      ? await roundDecision(
          p,
          round,
          run,
          phase,
          remoteState,
          [...members, ...memberRows(newMembers, run.term)],
          seen + end,
        )
      : null;
    const page: CollectPage = {
      judgment: judged.judgment,
      places,
      usage_usd: usage,
      items_seen: seen + end,
      run_state: runDone ? remoteState : null,
      next: decision?.next ?? next,
      round: decision?.round ?? (round.state === "queued" ? { state: "probing", question: null, ending: null } : null),
    };
    const res = await p.db.collectCommit(run.id, owner, gen, from, to, page);
    if (!res.ok) return { kind: "lost", why: res.why };
    commits += 1;
    lastRoundState = res.round_state;
    lastRunState = page.run_state;
    from = to;
    if (decision?.after) await decision.after();
    cursor = end;
    if (stopHere || runDone) break;
  } while (cursor < items.length);

  return {
    kind: "committed",
    commits,
    toOffset: from,
    runState: lastRunState,
    roundState: lastRoundState,
    judgeRefused,
  };
}

/** The rows just committed, as members of the round, for a decision made in the same invocation. */
function memberRows(places: CollectPlace[], term: string | null): LeadMemberRow[] {
  return places.map((x) => ({
    place_id: x.place.place_id,
    decided: false,
    lead_id: x.place.place_id,
    class: x.member.class,
    excluded_by: x.member.excluded_by,
    fit: x.member.fit,
    reason: x.member.reason,
    distance_m: x.member.distance_m,
    counted: false,
    judgment: x.member.judgment,
    lat: x.place.lat,
    lng: x.place.lng,
    phone: x.place.phone_e164,
    email: x.place.email,
    email_state: x.place.email_state,
    term,
  }));
}

interface Decision {
  round: CollectPage["round"];
  next: CollectPage["next"];
  after?: () => Promise<void>;
}

/** When a run's last item is committed: is the phase over, and what follows (§7.2, §0.5). */
async function roundDecision(
  p: LeadPorts,
  round: LeadRoundRow,
  run: LeadRunRow,
  phase: Phase,
  runState: LeadRunState,
  members: LeadMemberRow[],
  itemsSeenNow: number,
): Promise<Decision | null> {
  const runs = (await p.db.runsOfRound(round.id)).map((r) =>
    r.id === run.id ? { ...r, state: runState, items_seen: itemsSeenNow } : r,
  );
  const phaseOf = new Map<string, Phase>();
  for (const r of runs)
    if (r.purpose === "discover" && r.term !== null)
      phaseOf.set(r.id, (await runIdFor(round.id, "probe", r.term)) === r.id ? "probe" : "main");
  const inPhase = runs.filter((r) => r.purpose === "discover" && phaseOf.get(r.id) === phase);
  if (!inPhase.every((r) => FINAL_RUN_STATES.has(r.state))) return null;

  // What will have counted once this page settles: a place Qualified at collect (a phone that dials, decision 0010)
  // counts now, whatever the search prefers; one waiting on its email counts after the checks.
  const countedNow = members.filter((m) => m.counted).length;
  const countable = members.filter((m) => !m.counted && m.class === "qualified").length;
  const counted = countedNow + Math.min(countable, Math.max(0, round.allowance_reserved - round.allowance_used));
  const toChecks: Decision = {
    round: { state: "checking", question: null, ending: null, ending_pending: "target_reached" },
    next: null,
    after: () => p.schedule("lead_check", { round_id: round.id, batch: 0 }, 0),
  };

  if (phase === "probe") {
    // The probe decides once. A collect that reaches here after it did -- the webhook's `final` after the poll that
    // already asked, or a late poll once the owner answered -- decides nothing: asking again re-wrote the question
    // and its day, and told the owner a second time.
    if (round.state !== "queued" && round.state !== "probing") return null;
    // The probe alone may reach the count: nothing more is asked for, and the round goes to its checks.
    if (counted >= targetOf(round)) return toChecks;
    const judged = members.filter(wasJudged);
    const a = afterProbe(
      round.plan,
      judged.map((m) => ({ class: m.class, excluded_by: m.excluded_by, term: m.term, phone: m.phone, email: m.email })),
      p.now(),
    );
    if (a.kind === "ask")
      return {
        round: { state: "waiting_on_owner", question: a.question, ending: null },
        next: null,
        // Once the question is committed: it waits a day on a person who may not be looking at the page.
        after: async () => {
          await p.tell?.({ kind: "question", roundId: round.id }).catch(() => undefined);
        },
      };
    // The probe passed: the round runs on to the plan's count (the door raised the target the same way for an answered question).
    return {
      round: { state: "running", question: null, ending: null, target: targetOf(round) },
      next: null,
      after: () => p.schedule("lead_round_start", { round_id: round.id, resume: true }, 0),
    };
  }
  // The main phase is over: the ending, pending the checks (a stopped round says so through stopRun).
  const asked = new Map<string, number | null>();
  for (const r of inPhase) {
    if (outOfTime(p) || !r.apify_run_id) continue;
    const input = (await p.apify.runInput(r.apify_run_id).catch(() => null)) as Record<string, unknown> | null;
    asked.set(r.id, typeof input?.maxCrawledPlacesPerSearch === "number" ? input.maxCrawledPlacesPerSearch : null);
  }
  const ending = discoveryEnding(round, runs, {
    counted,
    target: targetOf(round),
    termsShort: termsShortOf(inPhase, (r) => asked.get(r.id) ?? null),
    stopped: false,
  });
  // A round that ran dry says where to look next (D3): written with its ending, before the round is final.
  const nearby = ending === "searched_everything" || ending === "few_new_matches" ? nearbyFor(round.plan, members) : [];
  return {
    round: {
      state: "checking",
      question: null,
      ending: null,
      ending_pending: ending,
      ...(nearby.length ? { nearby } : {}),
    },
    next: null,
    after: () => p.schedule("lead_check", { round_id: round.id, batch: 0 }, 0),
  };
}

/* ------------------------------------------------- an answer re-judges -- */

/** The version of the plan a member's class was decided under: 1 until an answer changed the plan. */
const versionOf = (m: LeadMemberRow): number => {
  const v = (m.judgment as Partial<MemberJudgment> | null)?.plan_version;
  return typeof v === "number" ? v : 1;
};

/** Every key the plan asks the judge (contracts' rubric): the kind, each exclusion, each criterion. */
const keysOf = (plan: LeadSearchPlan): string[] => [
  LEAD_KIND_KEY,
  ...plan.exclusions.map((e) => e.key),
  ...plan.criteria.map((c) => c.key),
];

export type RejudgeOutcome = { changed: number; reused: number; judged: number; unread: number };

/**
 * An answer that changed the plan re-judges the places the probe already judged (00165). The question asked
 * "is that what you meant?" about them; when the owner answers by changing the plan -- Include the thing it left out,
 * or Change what I asked -- those places were still classed by the plan they had just said was wrong, and the main
 * phase never sees them again (a place the workspace holds is skipped), so an Include brought back nothing.
 *
 * A left-out place kept no email and nothing its listing showed (PRD §0.4), so the places are read again from the
 * probe's own items (a read of its dataset, not a run) and cleaned as the collect cleaned them. A stored answer that
 * answers every key the new plan asks is the answer (an Include lifts a key: free, and exactly what was said before);
 * otherwise the places are judged again under the new plan, a batch at a time, before the deadline. Classes are
 * code's, through the collect's own memberOf, against the plan's area. The door (lead_round_rejudge) never overrides
 * the owner's decision and never applies twice. A refused batch is left as it was; a place the source no longer
 * lists (an expired dataset) is left as it was and counted as unread.
 */
export async function rejudgeProbe(p: LeadPorts, round: LeadRoundRow): Promise<RejudgeOutcome> {
  const out: RejudgeOutcome = { changed: 0, reused: 0, judged: 0, unread: 0 };
  const plan = round.plan;
  const card = CARDS[plan.card];
  const members = await p.db.membersOfRound(round.id);
  const pending = members.filter(
    (m) => wasJudged(m) && !m.decided && m.place_id !== null && versionOf(m) < round.plan_version,
  );
  if (!pending.length) return out;

  // The probe's own items, by place id, with the term that found each.
  const listed = new Map<string, { clean: CleanPlace; term: string }>();
  for (const r of await p.db.runsOfRound(round.id)) {
    if (r.purpose !== "discover" || r.term === null || !r.dataset_id) continue;
    if ((await runIdFor(round.id, "probe", r.term)) !== r.id) continue;
    for (let from = 0; ; from += PAGE_ITEMS) {
      if (outOfTime(p)) throw new LeadRetry("out of time reading the first places again");
      let items: unknown[];
      try {
        items = (await p.apify.listItems(r.dataset_id, from, PAGE_ITEMS, [...card.fields])).items;
      } catch (e) {
        // A dataset the source no longer has (expired, deleted): its places stay as they were, and the round runs on.
        if (isRefused(e)) break;
        throw e;
      }
      for (const it of items) {
        const mapped = card.mapItem(it);
        if (mapped && !listed.has(mapped.placeId))
          listed.set(mapped.placeId, { clean: cleanPlace(mapped), term: r.term });
      }
      if (items.length < PAGE_ITEMS) break;
    }
  }
  const found = pending.flatMap((m) => {
    const x = listed.get(m.place_id as string);
    if (!x) out.unread += 1;
    // The term that found it is the one it was judged under.
    return x ? [{ m, clean: x.clean, term: m.term ?? x.term }] : [];
  });
  if (!found.length) return out;
  // What the collect filtered before it judged, filtered again, so a stored answer's email index still points at
  // the same address.
  const supp = await p.db.suppressed(round.tenant_id, {
    // Every address, free mail included, as the collect asks (a stop is a person's, whatever their domain).
    emails: found.flatMap((x) => x.clean.emails),
    placeIds: found.map((x) => x.clean.raw.placeId),
  });
  // The probe's own geometry, as its collect measured: a city ask has no centre yet, so no place is out of its area.
  const geo = { center: areaCenter(plan), radiusM: plan.area.radius_m };
  const keys = keysOf(plan);
  const nowAsked = askedOf(plan);
  const reuse: typeof found = [];
  const judge: typeof found = [];
  for (const x of found) {
    if (supp.placeIds.has(x.clean.raw.placeId)) continue;
    x.clean.emails = x.clean.emails.filter((e) => !supp.emails.has(e));
    const j = x.m.judgment as Partial<MemberJudgment>;
    const answers = new Set((j.answer?.criteria ?? []).map((c) => c.key));
    // Reused only where every key was answered AND asked in the very same words; an answer kept before the
    // questions were kept with it (no `asked`) is judged again.
    const same = keys.every((k) => answers.has(k) && j.asked?.[k] === nowAsked[k]);
    (same ? reuse : judge).push(x);
  }

  const place = (
    x: (typeof found)[number],
    answer: JudgePlaceAnswer | null,
    opId: string | null,
    model: string | null,
  ): CollectPlace => {
    const rule =
      geo.center && !inArea(geo.center, geo.radiusM, x.clean.raw.location)
        ? { class: "review" as const, reason: OUT_OF_AREA_REASON, token: "out_of_area", excluded_by: null }
        : null;
    const made = memberOf(plan, x.term, x.clean, answer, opId, model, rule, geo, [], null);
    made.member.judgment = { ...made.member.judgment, plan_version: round.plan_version };
    return made;
  };
  const commit = async (xs: typeof found, places: CollectPlace[], judgment: CollectJudgment | null) => {
    // Their own marks, for the places the new plan lets back in (a left-out place kept none).
    await markPlaces(
      p,
      places.filter((pl, i) => xs[i].m.class === "excluded" && pl.member.class !== "excluded"),
    );
    const res = await p.db.roundRejudge(round.id, round.plan_version, places, judgment);
    if (!res.ok) return false;
    out.changed += res.changed;
    return true;
  };

  if (reuse.length) {
    const places = reuse.map((x) => {
      const j = x.m.judgment as Partial<MemberJudgment>;
      return place(x, j.answer ?? null, j.op_id ?? null, j.model ?? null);
    });
    out.reused = reuse.length;
    if (!(await commit(reuse, places, null))) return out;
  }
  for (let i = 0; i < judge.length; i += LEAD_JUDGE_BATCH) {
    const batch = judge.slice(i, i + LEAD_JUDGE_BATCH);
    if (outOfTime(p, JUDGE_MARGIN_MS)) throw new LeadRetry("out of time before judging the first places again");
    const judged = await judgeBatch(
      p.judge,
      plan,
      batch.map((x, ref) => factsOf(ref, x.clean)),
      opIdFor(
        `rejudge:${round.id}:${round.plan_version}:${batch
          .map((x) => x.clean.raw.placeId)
          .sort()
          .join(",")}`,
        0,
        0,
      ),
    );
    if (judged.refused) continue;
    const places = batch.map((x, ref) =>
      place(x, judged.answers.get(ref) ?? null, judged.judgment?.op_id ?? null, judged.model),
    );
    out.judged += batch.length;
    if (!(await commit(batch, places, judged.judgment))) return out;
  }
  return out;
}

/** Stop: abort at the provider, then the round goes to its checks with "stopped" pending (PRD §0.5, decision 17). */
async function stopRun(p: LeadPorts, round: LeadRoundRow, run: LeadRunRow, owner: string): Promise<CollectOutcome> {
  if (run.apify_run_id && !FINAL_RUN_STATES.has(run.state)) await p.apify.abortRun(run.apify_run_id);
  const gen = await p.db.runLease(run.id, owner, LEASE_SECONDS);
  if (gen === null) {
    // Keyed by the minute, as the checker's poll is: a Stop that meets a busy
    // lease twice would otherwise ask for the one row it already has out.
    await p.schedule("lead_collect", { run_id: run.id, seq: `stop.${minute(p)}` }, 30);
    return { kind: "busy" };
  }
  try {
    const page: CollectPage = {
      judgment: null,
      places: [],
      usage_usd: run.usage_usd,
      items_seen: run.items_seen,
      run_state: FINAL_RUN_STATES.has(run.state) ? null : "aborted",
      next: null,
      round:
        round.state === "ended" || round.state === "checking"
          ? null
          : { state: "checking", question: null, ending: null, ending_pending: "stopped" },
    };
    const res = await p.db.collectCommit(run.id, owner, gen, run.read_offset, run.read_offset, page);
    if (!res.ok) return { kind: "lost", why: res.why };
    if (page.round) await p.schedule("lead_check", { round_id: round.id, batch: 0 }, 0);
    return { kind: "stopped" };
  } finally {
    await p.db.runRelease(run.id, owner, gen);
  }
}

/* ------------------------------------------------------------- the check */

export type CheckOutcome =
  | { kind: "not_open" }
  | { kind: "paused" }
  | { kind: "nothing_to_check" }
  | { kind: "started"; emails: number; more: boolean }
  | { kind: "already" }
  | { kind: "unknown" }
  | { kind: "refused" };

/** Check again (D3, 00145): the nonce that gives the run an id of its own, and the leads the owner named. */
export type CheckAgain = { nonce: string; leadIds: string[] };
/** A run started by Check again: the door's nonce is in its term, so the round may have ended by the time it commits. */
export const isAgainRun = (run: Pick<LeadRunRow, "purpose" | "term">): boolean =>
  run.purpose === "check" && (run.term ?? "").startsWith("again:");

/**
 * The business's own mark (D6), for the places this page is about to commit: one small GET of each new lead's home
 * page, read for the logos it declares (mark.ts), then the first of those whose bytes are a mark worth keeping
 * (mark-image.ts), stored as our own copy (00161) -- the site's address never draws past the dashboard's content
 * policy, and our copy does. It is the last thing the collect does and the first thing it gives up: a page that does
 * not answer inside the allowance, or a collect already short of time, simply commits leads with no mark, and the
 * next round's copy of that place fills it where it was empty.
 *
 * A left-out place is never marked, as it stores none of the rest (§0.4), and a place with no site has nothing to read.
 * Answers how many places were given a kept copy.
 */
export const MARK_ALLOWANCE_MS = 8_000;
export const MARK_AT_ONCE = 6;
/**
 * A page's candidates tried for bytes worth keeping: its said logo, then its best icon. Past two, it is a favicon.
 * An SVG is never kept (mark-image.ts), so an address that says it is one is not asked for and spends no try.
 */
export const MARK_TRIES = 2;
const SAYS_SVG = /\.svg(?:[?#]|$)/i;
export async function markPlaces(p: LeadPorts, places: CollectPlace[]): Promise<number> {
  const { fetchText, fetchBytes, storeMark } = p;
  if (!fetchText) return 0;
  const want = places.filter((x) => x.member.class !== "excluded" && !!x.place.website_host);
  const until = Math.min(p.deadline - JUDGE_MARGIN_MS, p.now().getTime() + MARK_ALLOWANCE_MS);
  const left = () => until - p.now().getTime();
  let kept = 0;

  const markOne = async (x: CollectPlace): Promise<void> => {
    const origin = `https://${x.place.website_host}`;
    const html = await fetchText(origin, left()).catch(() => null);
    if (!html) return;
    const marks = leadMarksFrom(html, origin);
    if (marks.length === 0) return;
    x.place.logo_url = marks[0];
    if (!fetchBytes || !storeMark) return;
    for (const url of marks.filter((u) => !SAYS_SVG.test(u)).slice(0, MARK_TRIES)) {
      if (left() <= 250) return;
      const bytes = await fetchBytes(url, left(), MARK_MAX_BYTES).catch(() => null);
      const image = bytes ? markImageFrom(bytes) : null;
      if (!bytes || !image) continue;
      const path = await storeMark(bytes, image).catch(() => null);
      if (!path) return;
      x.place.logo_url = url;
      x.place.mark_path = path;
      kept += 1;
      return;
    }
  };

  // Six at a time, each taking the next place as it finishes: one slow site holds up only its own lead.
  let next = 0;
  const worker = async () => {
    while (next < want.length && left() > 250) await markOne(want[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(MARK_AT_ONCE, want.length) }, worker));
  return kept;
}

/** The members whose picked address still waits for its check, in one fixed order. */
export function checkable(members: LeadMemberRow[]): LeadMemberRow[] {
  return members
    .filter((m) => m.email !== null && m.email_state === "checking")
    .sort((a, b) => (a.lead_id < b.lead_id ? -1 : a.lead_id > b.lead_id ? 1 : 0));
}

export async function check(
  p: LeadPorts,
  roundId: string,
  batch: number,
  owner: string,
  again: CheckAgain | null = null,
): Promise<CheckOutcome> {
  const round = await p.db.round(roundId);
  // A round that ended is closed to its own checks; a Check again runs under it after it ended, by design (00145).
  if (!round || (round.state === "ended" && !again)) return { kind: "not_open" };
  const card = CARDS[round.plan.card];
  const named = again ? new Set(again.leadIds) : null;
  const all = checkable(await p.db.membersOfRound(round.id)).filter((m) => !named || named.has(m.lead_id));
  const slice = all.slice(batch * CHECK_BATCH, (batch + 1) * CHECK_BATCH);
  // The switch, read before anything reaches the provider, as a start reads it
  // (§0.5). The mailbox check is money too: with searches off the addresses
  // still waiting say "Couldn't check", and the round ends the word the
  // endings carry for it.
  if (!(await p.db.leadSearchesOn(round.tenant_id))) {
    if (slice.length)
      await p.db.checkCommit(
        round.id,
        null,
        slice.map((m) => ({ lead_id: m.lead_id, email_state: "unknown" as const, checked_at: iso(p.now()) })),
        0,
        false,
      );
    if (!again) await p.db.roundEnd(round.id, "paused");
    return { kind: "paused" };
  }
  if (!slice.length) {
    if (batch === 0 && round.state === "checking" && !again) await p.db.checkCommit(round.id, null, [], 0, true);
    return { kind: "nothing_to_check" };
  }
  const term = again ? `again:${again.nonce}:${batch}` : `batch:${batch}`;
  const id = await runIdFor(round.id, "check", term);
  const token = await p.webhookToken(id);
  const emails = [...new Set(slice.map((m) => m.email as string))];
  const brief = LEAD_CARDS.find((c) => c.id === round.plan.card);
  const capUsd = Math.max(
    0.5,
    Math.round(emails.length * (brief?.checkPerEmailUsd ?? 0.00089) * LEAD_ESTIMATE_MARGIN * 100) / 100,
  );
  const rows = await p.db.runsEnsure([
    {
      id,
      tenant_id: round.tenant_id,
      round_id: round.id,
      purpose: "check",
      term,
      actor: card.checker.actor,
      build: card.checker.build,
      webhook_token_hash: await sha256Hex(token),
      cap_usd: capUsd,
    },
  ]);
  const row = rows.find((r) => r.id === id);
  if (!row || (row.state !== "claimed" && !(row.state === "starting" && row.claimed_by === owner)))
    return { kind: "already" };
  if (outOfTime(p)) throw new LeadRetry("out of time before the checker");
  const claim = await claimOrRecover(p, card.checker.actor, row, owner);
  if (claim !== "mine") return { kind: "already" };
  try {
    const started = await p.apify.startRun(
      card.checker.actor,
      { ...(card.checker.buildInput(emails) as Record<string, unknown>), [INPUT_MARKER]: row.id },
      {
        build: card.checker.build,
        timeoutSecs: CHECKER_RUN_TIMEOUT_SECS,
        maxTotalChargeUsd: capUsd,
        webhooks: [{ eventTypes: [...APIFY_RUN_END_EVENTS], requestUrl: webhookUrl(p, row.id, token) }],
      },
    );
    await p.db.runRecordStart(row.id, owner, started.id, started.datasetId, capUsd);
    await p.schedule("lead_collect", { run_id: row.id, seq: "p0" }, FIRST_COLLECT_SECONDS);
    const more = all.length > (batch + 1) * CHECK_BATCH;
    if (more)
      await p.schedule(
        "lead_check",
        { round_id: round.id, batch: batch + 1, ...(again ? { again: again.nonce, lead_ids: again.leadIds } : {}) },
        0,
      );
    return { kind: "started", emails: emails.length, more };
  } catch (e) {
    const kind = await startFailed(p, row, owner, e);
    if (kind === "refused") {
      // These addresses cannot be checked: "Couldn't check", so the round can end.
      await p.db.checkCommit(
        round.id,
        row.id,
        slice.map((m) => ({ lead_id: m.lead_id, email_state: "unknown" as const, checked_at: iso(p.now()) })),
        0,
        !again && all.length <= (batch + 1) * CHECK_BATCH,
      );
    }
    return { kind };
  }
}

/** A checker run's collect: read its answers once the run is over, and hand them to lead_check_commit. */
async function collectCheck(
  p: LeadPorts,
  round: LeadRoundRow,
  run: LeadRunRow,
  owner: string,
): Promise<CollectOutcome> {
  // A Check again run commits after its round ended: it decides nothing, and it is never the round's last check.
  const again = isAgainRun(run);
  if (round.state === "ended" && !again) return { kind: "round_ended" };
  if (!run.apify_run_id && !FINAL_RUN_STATES.has(run.state)) return { kind: "not_started" };
  const gen = await p.db.runLease(run.id, owner, LEASE_SECONDS);
  if (gen === null) {
    await p.schedule("lead_collect", { run_id: run.id, seq: `c${minute(p)}` }, 30);
    return { kind: "busy" };
  }
  try {
    const card = CARDS[round.plan.card];
    let state: LeadRunState = run.state;
    let datasetId = run.dataset_id;
    let usage = run.usage_usd;
    if (!FINAL_RUN_STATES.has(run.state)) {
      if (outOfTime(p)) throw new LeadRetry("out of time before reading the checker's run");
      try {
        const remote = await p.apify.getRun(run.apify_run_id as string);
        state = runStateOf(remote.status);
        datasetId = remote.datasetId ?? datasetId;
        usage = remote.usageTotalUsd ?? usage;
      } catch (e) {
        if (!isRefused(e)) throw e;
        state = "failed";
      }
      if (state === "running") {
        await p.schedule("lead_collect", { run_id: run.id, seq: `p${minute(p)}` }, POLL_SECONDS);
        return { kind: "polling" };
      }
    }
    const byEmail = new Map<string, LeadEmailState>();
    let items: unknown[] = [];
    if (state === "succeeded" && datasetId)
      items = (await p.apify.listItems(datasetId, 0, CHECK_BATCH, [...card.checker.fields])).items;
    for (const it of items) {
      const r = card.checker.mapItem(it);
      if (r) byEmail.set(r.email, r.state);
    }
    const waiting = checkable(await p.db.membersOfRound(round.id));
    // A run that succeeded answers the addresses it was given; one that did not leaves every address still waiting "Couldn't check".
    const results = waiting
      .filter((m) => state !== "succeeded" || byEmail.has(m.email as string))
      .map((m) => ({
        lead_id: m.lead_id,
        email_state: byEmail.get(m.email as string) ?? ("unknown" as const),
        checked_at: iso(p.now()),
      }));
    const others = (await p.db.runsOfRound(round.id)).filter((r) => r.purpose === "check" && r.id !== run.id);
    const answered = new Set(results.map((r) => r.lead_id));
    const last =
      !again && others.every((r) => FINAL_RUN_STATES.has(r.state)) && waiting.every((m) => answered.has(m.lead_id));
    const commit = await p.db.collectCommit(run.id, owner, gen, run.read_offset, run.read_offset + items.length, {
      judgment: null,
      places: [],
      usage_usd: usage,
      items_seen: items.length,
      run_state: FINAL_RUN_STATES.has(run.state) ? null : state,
      next: null,
      round: null,
    });
    if (!commit.ok) return { kind: "lost", why: commit.why };
    // The run's own total, never a delta: the commit above settled it already, so nothing settles twice (E4).
    await p.db.checkCommit(round.id, run.id, results, usage, last);
    return { kind: "checked", results: results.length, last };
  } finally {
    await p.db.runRelease(run.id, owner, gen);
  }
}

/* ------------------------------------------------------------- the sweep */

export type ReconcileOutcome = { runId: string; kind: "reconciled" | "failed" | "waiting" };

/** An unknown start is reconciled against the provider's own list; ours carry the run row id in their input (PRD §0.5, E1). */
export async function reconcileUnknownRuns(p: LeadPorts, unknownRuns: LeadRunRow[]): Promise<ReconcileOutcome[]> {
  const out: ReconcileOutcome[] = [];
  for (const row of unknownRuns) {
    if (outOfTime(p)) break;
    const round = await p.db.round(row.round_id);
    const card = CARDS[round?.plan.card ?? "local_businesses"];
    const found = await findOurRun(p, row.purpose === "check" ? card.checker.actor : card.actor, row);
    if (found) {
      await p.db.runReconcile(row.id, found.id, found.datasetId, runStateOf(found.status));
      await p.schedule("lead_collect", { run_id: row.id, seq: `s${minute(p)}` }, 0);
      out.push({ runId: row.id, kind: "reconciled" });
      continue;
    }
    if (p.now().getTime() - Date.parse(row.claimed_at ?? row.created_at) > UNKNOWN_START_GRACE_MS) {
      await p.db.runReconcile(row.id, null, null, "failed");
      await p.schedule("lead_collect", { run_id: row.id, seq: `s${minute(p)}` }, 0);
      out.push({ runId: row.id, kind: "failed" });
    } else out.push({ runId: row.id, kind: "waiting" });
  }
  return out;
}
