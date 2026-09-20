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
import { LEAD_CARDS, LEAD_ESTIMATE_MARGIN, LEAD_JUDGE_BATCH, classify, type JudgePlaceAnswer, type LeadEmailState, type LeadRoundState, type LeadRunState, type LeadSearchPlan } from "@chanlytics/contracts";
import { APIFY_RUN_END_EVENTS } from "@chanlytics/channels";
import { CARDS, CHECKER_RUN_TIMEOUT_SECS, MAPS_RUN_TIMEOUT_SECS, areaCenter, type LeadCardRunner } from "./cards";
import { cleanPlace, type CleanPlace } from "./clean";
import { discoveryEnding, FINAL_RUN_STATES, runStateOf, termsShortOf } from "./endings";
import { inArea, haversineM, medianCenter, radiusFromSpread, type LatLng } from "./geo";
import { runIdFor, sha256Hex } from "./ids";
import { foldDuplicates, identityOf, shareKeysOf, sharesWithin } from "./identity";
import { JUDGE_REFUSED_REASON, factsOf, judgeBatch, opIdFor, type JudgedBatch } from "./judge";
import type { CollectCommitResult, CollectPage, CollectPlace, LeadMemberRow, LeadPorts, LeadRoundRow, LeadRunRow, LeadShare } from "./ports";
import { afterProbe } from "./question";
import { mainAsk, probeAsk, probeYield, runCaps } from "./sizing";

export const LEASE_SECONDS = 90;
export const FIRST_COLLECT_SECONDS = 20;
export const POLL_SECONDS = 15;
export const PAGE_ITEMS = 100;
export const CHECK_BATCH = 500;
/** No provider or model call starts with less than this left before the function is killed. */
export const DEADLINE_MARGIN_MS = 8_000;
/** An unknown start with no run at the provider after this long is failed. */
export const UNKNOWN_START_GRACE_MS = 10 * 60_000;
/** The key our runs carry in their input, so the sweep can tell ours from anyone else's. */
export const INPUT_MARKER = "chanlyticsRunId";
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
const isRetryable = (e: unknown): e is { name: string; status: number | null } => (e as { name?: string } | null)?.name === "ApifyRetryable";
const minute = (p: LeadPorts) => Math.floor(p.now().getTime() / 60_000);
const outOfTime = (p: LeadPorts) => p.now().getTime() + DEADLINE_MARGIN_MS > p.deadline;
const webhookUrl = (p: LeadPorts, runRowId: string, token: string) => `${p.webhookBase}/api/apify-webhook?run=${encodeURIComponent(runRowId)}&token=${encodeURIComponent(token)}`;
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
  | { kind: "started"; phase: Phase; runs: { term: string; kind: TermOutcome }[] };

/** The provider's run that carries this row's id in its input, if one exists. */
async function findOurRun(p: LeadPorts, actor: string, row: LeadRunRow): Promise<{ id: string; status: string; datasetId: string | null } | null> {
  const since = new Date(Date.parse(row.claimed_at ?? row.created_at) - 5 * 60_000);
  const runs = await p.apify.listActorRuns(actor, iso(since));
  for (const r of runs.slice(0, 20)) {
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
async function claimOrRecover(p: LeadPorts, actor: string, row: LeadRunRow, owner: string): Promise<"mine" | "recovered" | "not_mine"> {
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
  const plan = round.plan;
  const card = CARDS[plan.card];
  const phase: Phase = round.purpose === "probe" && !resume && round.state !== "running" ? "probe" : "main";

  let ask: { terms: string[]; perTerm: number[] };
  if (phase === "probe") {
    ask = probeAsk(plan);
  } else {
    const members = await p.db.membersOfRound(round.id);
    const judged = members.filter(wasJudged);
    const counted = members.filter((m) => m.counted).length;
    // Round 1 sizes from its probe; a top-up or a renewal has no probe of its own and starts from an even yield.
    const y = round.purpose === "probe" ? probeYield(plan.contact, judged) : 0.5;
    ask = mainAsk(plan, targetOf(round) - counted, y, round.question?.dropTerm ?? null);
  }
  const caps = runCaps(plan, ask.perTerm, round.cost_reserved_usd - round.cost_usd);

  const wanted: { id: string; term: string; hash: string; places: number; cap: number }[] = [];
  for (const [i, term] of ask.terms.entries()) {
    // placesToAsk may give a term nothing at all when little is left (S6): a run asked for no places is never started.
    if (ask.perTerm[i] <= 0) continue;
    const id = await runIdFor(round.id, phase, term);
    wanted.push({ id, term, hash: await sha256Hex(await p.webhookToken(id)), places: ask.perTerm[i], cap: caps[i] });
  }
  if (!wanted.length) return { kind: "started", phase, runs: [] };
  const rows = await p.db.runsEnsure(wanted.map((w) => ({
    id: w.id, tenant_id: round.tenant_id, round_id: round.id, purpose: "discover", term: w.term, actor: card.actor, build: card.build, webhook_token_hash: w.hash, cap_usd: w.cap,
  })));

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
        build: card.build, timeoutSecs: MAPS_RUN_TIMEOUT_SECS, maxTotalChargeUsd: w.cap,
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
  | { kind: "busy" }
  | { kind: "lost"; why: Exclude<CollectCommitResult, { ok: true }>["why"] }
  | { kind: "committed"; commits: number; toOffset: number; runState: LeadRunState | null; roundState: LeadRoundState | null }
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
  const points = members.filter((m): m is LeadMemberRow & { lat: number; lng: number } => m.lat !== null && m.lng !== null).map((m) => ({ lat: m.lat, lng: m.lng }));
  const center = medianCenter(points);
  return { center, radiusM: center ? radiusFromSpread(center, points) : plan.area.radius_m };
}

/** One place as the commit takes it: the lead's columns, the member's class decided by code (§0.1), its shares. */
export function memberOf(plan: LeadSearchPlan, term: string, c: CleanPlace, a: JudgePlaceAnswer | null, opId: string | null, model: string | null, rule: Prepared["rule"], geo: { center: LatLng | null; radiusM: number }, shares: LeadShare[], duplicateOf: string | null): CollectPlace {
  const loc = c.raw.location;
  const distance = geo.center && loc ? haversineM(geo.center, loc) : null;
  const picked = a && a.email_index !== null ? c.emails[a.email_index] ?? null : null;
  const emailState: LeadEmailState = picked ? "checking" : "none";
  // The class is code's (§0.1): contracts' classify from the judge's answers, or a rule that never reached the judge.
  let verdict: { class: "qualified" | "review" | "excluded"; excluded_by: string | null; fit: "strong" | "look" | "long" | null; reasons: string[] };
  let reason: string;
  if (rule) {
    verdict = { class: rule.class, excluded_by: rule.excluded_by, fit: null, reasons: [rule.token] };
    reason = rule.reason;
  } else if (!a) {
    verdict = { class: "review", excluded_by: null, fit: null, reasons: ["judge:refused"] };
    reason = JUDGE_REFUSED_REASON;
  } else {
    verdict = classify(plan, a, factsOf(0, c), emailState, geo.center ? inArea(geo.center, geo.radiusM, loc) : true);
    reason = a.reason;
  }
  const excluded = verdict.class === "excluded";
  return {
    place: {
      place_id: c.raw.placeId, business_name: c.raw.title, category: c.raw.category, street: c.raw.street, city: c.raw.city, region: c.region ?? c.raw.state,
      postal_code: c.raw.postalCode, country: "US", lat: loc?.lat ?? null, lng: loc?.lng ?? null, website_host: c.host, instagram_url: c.raw.instagram,
      phone_e164: c.phone, phone_sources: c.phoneSources,
      // A left-out place never stores its candidate emails (PRD §0.4, §15).
      email: excluded ? null : picked,
      email_alternates: excluded ? [] : c.emails.filter((e) => e !== picked).slice(0, 4).map((e) => ({ email: e, why: c.host && e.endsWith(`@${c.host}`) ? "on their own domain" : "another domain" })),
      email_state: excluded ? "none" : emailState,
      rating: c.raw.rating, reviews: c.raw.reviews,
    },
    member: {
      judgment: { op_id: opId, term, answer: a, model, reasons: verdict.reasons },
      class: verdict.class, excluded_by: verdict.excluded_by, fit: verdict.fit,
      reason: reason.slice(0, 120),
      distance_m: distance,
    },
    duplicate_of_place_id: duplicateOf,
    shares,
  };
}

/** The next batch of items from `cursor`: at most LEAD_JUDGE_BATCH places the judge must see, with the items around them. */
export function takeBatch(card: LeadCardRunner, items: unknown[], cursor: number): { end: number; prepared: Prepared[] } {
  const prepared: Prepared[] = [];
  let judgeable = 0;
  let end = cursor;
  while (end < items.length) {
    const mapped = card.mapItem(items[end]);
    if (mapped) {
      const clean = cleanPlace(mapped);
      const rule: Prepared["rule"] = mapped.closed
        ? { class: "excluded", reason: CLOSED_REASON, token: "closed", excluded_by: "closed" }
        : mapped.location === null ? { class: "review", reason: NO_LOCATION_REASON, token: "out_of_area", excluded_by: null } : null;
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
  if (seq === "stop" || seq === "stop.b") return stopRun(p, round, run, owner);
  if (round.state === "ended") {
    if (run.apify_run_id && !FINAL_RUN_STATES.has(run.state)) await p.apify.abortRun(run.apify_run_id).catch(() => undefined);
    return { kind: "round_ended" };
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

async function collectHeld(p: LeadPorts, round: LeadRoundRow, run: LeadRunRow, owner: string, gen: number): Promise<CollectOutcome> {
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

  let from = run.read_offset;
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
  let lastRoundState: LeadRoundState | null = null;
  let lastRunState: LeadRunState | null = null;

  do {
    const { end, prepared } = takeBatch(card, items, cursor);
    const isLastOfPage = end >= items.length;
    // Identity, by what the workspace already holds: place ids, suppressions, shared details (decision 25).
    const cleans = prepared.map((x) => x.clean);
    const { folded } = foldDuplicates(cleans);
    const keys = cleans.map(shareKeysOf);
    const [held, supp, shares] = await Promise.all([
      p.db.placeIdsHeld(round.tenant_id, cleans.map((c) => c.raw.placeId)),
      p.db.suppressed(round.tenant_id, { emails: keys.flatMap((k) => k.emails), placeIds: cleans.map((c) => c.raw.placeId) }),
      p.db.sharesOf(round.tenant_id, { phones: keys.flatMap((k) => k.phones), emails: keys.flatMap((k) => k.emails), hosts: keys.flatMap((k) => k.hosts) }),
    ]);
    const within = sharesWithin(cleans.filter((c) => !folded.has(c.raw.placeId)));
    const toJudge: { prep: Prepared; ref: number }[] = [];
    const rows: { prep: Prepared; shares: LeadShare[]; duplicateOf: string | null }[] = [];
    for (const prep of prepared) {
      const idn = identityOf(prep.clean, held, supp.placeIds, shares);
      if (idn.kind === "already_yours" || idn.kind === "hidden") continue;
      const dup = folded.get(prep.clean.raw.placeId) ?? null;
      if (!prep.rule && geo.center && !inArea(geo.center, geo.radiusM, prep.clean.raw.location)) prep.rule = { class: "review", reason: OUT_OF_AREA_REASON, token: "out_of_area", excluded_by: null };
      // A suppressed address is not a hidden place, but the email is never offered again.
      prep.clean.emails = prep.clean.emails.filter((e) => !supp.emails.has(e));
      rows.push({ prep, shares: [...idn.shares, ...(within.get(prep.clean.raw.placeId) ?? [])], duplicateOf: dup });
      if (!prep.rule && !dup) toJudge.push({ prep, ref: toJudge.length });
    }
    // The judge: one call for the batch, kept by operation id; refused twice is Needs review (§7.1).
    let judged: JudgedBatch = { answers: new Map(), judgment: null, model: null, refused: false };
    if (toJudge.length) {
      if (outOfTime(p)) throw new LeadRetry("out of time before the judge");
      judged = await judgeBatch(p.judge, plan, toJudge.map((t) => factsOf(t.ref, t.prep.clean)), opIdFor(run.id, from, 0));
    }
    const places = rows.map((r) => {
      const ref = toJudge.find((t) => t.prep === r.prep)?.ref;
      const answer = ref === undefined ? null : judged.answers.get(ref) ?? null;
      const rule = r.duplicateOf && !r.prep.rule ? { class: "excluded" as const, reason: DUPLICATE_REASON, token: "duplicate", excluded_by: "duplicate" } : r.prep.rule;
      return memberOf(plan, run.term ?? "", r.prep.clean, answer, judged.judgment?.op_id ?? null, judged.model, rule, geo, r.shares, r.duplicateOf);
    });
    newMembers.push(...places);

    const to = from + end;
    const runDone = isLastOfPage && pageShort && remoteFinal;
    const stopHere = !isLastOfPage && outOfTime(p);
    // The next collect rides the commit when this invocation will not read on: the page ended, or time is short.
    const next: CollectPage["next"] = runDone ? null : !isLastOfPage && !stopHere ? null : { kind: "lead_collect", seq: `p${to}`, run_after_seconds: isLastOfPage && pageShort ? POLL_SECONDS : 0 };
    const decision = runDone ? await roundDecision(p, round, run, phase, remoteState, [...members, ...memberRows(newMembers, run.term)], seen + end) : null;
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

  return { kind: "committed", commits, toOffset: from, runState: lastRunState, roundState: lastRoundState };
}

/** The rows just committed, as members of the round, for a decision made in the same invocation. */
function memberRows(places: CollectPlace[], term: string | null): LeadMemberRow[] {
  return places.map((x) => ({
    lead_id: x.place.place_id, class: x.member.class, excluded_by: x.member.excluded_by, fit: x.member.fit, reason: x.member.reason, distance_m: x.member.distance_m,
    counted: false, judgment: x.member.judgment, lat: x.place.lat, lng: x.place.lng, phone: x.place.phone_e164, email: x.place.email, email_state: x.place.email_state, term,
  }));
}

interface Decision {
  round: CollectPage["round"];
  next: CollectPage["next"];
  after?: () => Promise<void>;
}

/** When a run's last item is committed: is the phase over, and what follows (§7.2, §0.5). */
async function roundDecision(p: LeadPorts, round: LeadRoundRow, run: LeadRunRow, phase: Phase, runState: LeadRunState, members: LeadMemberRow[], itemsSeenNow: number): Promise<Decision | null> {
  const runs = (await p.db.runsOfRound(round.id)).map((r) => (r.id === run.id ? { ...r, state: runState, items_seen: itemsSeenNow } : r));
  const phaseOf = new Map<string, Phase>();
  for (const r of runs) if (r.purpose === "discover" && r.term !== null) phaseOf.set(r.id, (await runIdFor(round.id, "probe", r.term)) === r.id ? "probe" : "main");
  const inPhase = runs.filter((r) => r.purpose === "discover" && phaseOf.get(r.id) === phase);
  if (!inPhase.every((r) => FINAL_RUN_STATES.has(r.state))) return null;

  // What will have counted once this page settles: a phone standard counts qualified places now; an email standard counts nothing until the checks.
  const countedNow = members.filter((m) => m.counted).length;
  const countable = round.plan.contact === "phone" ? members.filter((m) => !m.counted && m.class === "qualified").length : 0;
  const counted = countedNow + Math.min(countable, Math.max(0, round.allowance_reserved - round.allowance_used));
  const toChecks: Decision = { round: { state: "checking", question: null, ending: null, ending_pending: "target_reached" }, next: null, after: () => p.schedule("lead_check", { round_id: round.id, batch: 0 }, 0) };

  if (phase === "probe") {
    // The probe alone may reach the count: nothing more is asked for, and the round goes to its checks.
    if (counted >= targetOf(round)) return toChecks;
    const judged = members.filter(wasJudged);
    const a = afterProbe(round.plan, judged.map((m) => ({ class: m.class, excluded_by: m.excluded_by, term: m.term, phone: m.phone, email: m.email })), p.now());
    if (a.kind === "ask") return { round: { state: "waiting_on_owner", question: a.question, ending: null }, next: null };
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
  const ending = discoveryEnding(round, runs, { counted, target: targetOf(round), termsShort: termsShortOf(inPhase, (r) => asked.get(r.id) ?? null), stopped: false });
  return {
    round: { state: "checking", question: null, ending: null, ending_pending: ending },
    next: null,
    after: () => p.schedule("lead_check", { round_id: round.id, batch: 0 }, 0),
  };
}

/** Stop: abort at the provider, then the round goes to its checks with "stopped" pending (PRD §0.5, decision 17). */
async function stopRun(p: LeadPorts, round: LeadRoundRow, run: LeadRunRow, owner: string): Promise<CollectOutcome> {
  if (run.apify_run_id && !FINAL_RUN_STATES.has(run.state)) await p.apify.abortRun(run.apify_run_id);
  const gen = await p.db.runLease(run.id, owner, LEASE_SECONDS);
  if (gen === null) {
    await p.schedule("lead_collect", { run_id: run.id, seq: "stop.b" }, 30);
    return { kind: "busy" };
  }
  try {
    const page: CollectPage = {
      judgment: null, places: [], usage_usd: run.usage_usd, items_seen: run.items_seen, run_state: FINAL_RUN_STATES.has(run.state) ? null : "aborted", next: null,
      round: round.state === "ended" || round.state === "checking" ? null : { state: "checking", question: null, ending: null, ending_pending: "stopped" },
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

export type CheckOutcome = { kind: "not_open" } | { kind: "nothing_to_check" } | { kind: "started"; emails: number; more: boolean } | { kind: "already" } | { kind: "unknown" } | { kind: "refused" };

/** The members whose picked address still waits for its check, in one fixed order. */
export function checkable(members: LeadMemberRow[]): LeadMemberRow[] {
  return members.filter((m) => m.email !== null && m.email_state === "checking").sort((a, b) => (a.lead_id < b.lead_id ? -1 : a.lead_id > b.lead_id ? 1 : 0));
}

export async function check(p: LeadPorts, roundId: string, batch: number, owner: string): Promise<CheckOutcome> {
  const round = await p.db.round(roundId);
  if (!round || round.state === "ended") return { kind: "not_open" };
  const card = CARDS[round.plan.card];
  const all = checkable(await p.db.membersOfRound(round.id));
  const slice = all.slice(batch * CHECK_BATCH, (batch + 1) * CHECK_BATCH);
  if (!slice.length) {
    if (batch === 0 && round.state === "checking") await p.db.checkCommit(round.id, null, [], 0, true);
    return { kind: "nothing_to_check" };
  }
  const term = `batch:${batch}`;
  const id = await runIdFor(round.id, "check", term);
  const token = await p.webhookToken(id);
  const emails = [...new Set(slice.map((m) => m.email as string))];
  const brief = LEAD_CARDS.find((c) => c.id === round.plan.card);
  const capUsd = Math.max(0.5, Math.round(emails.length * (brief?.checkPerEmailUsd ?? 0.00089) * LEAD_ESTIMATE_MARGIN * 100) / 100);
  const rows = await p.db.runsEnsure([{ id, tenant_id: round.tenant_id, round_id: round.id, purpose: "check", term, actor: card.checker.actor, build: card.checker.build, webhook_token_hash: await sha256Hex(token), cap_usd: capUsd }]);
  const row = rows.find((r) => r.id === id);
  if (!row || (row.state !== "claimed" && !(row.state === "starting" && row.claimed_by === owner))) return { kind: "already" };
  if (outOfTime(p)) throw new LeadRetry("out of time before the checker");
  const claim = await claimOrRecover(p, card.checker.actor, row, owner);
  if (claim !== "mine") return { kind: "already" };
  try {
    const started = await p.apify.startRun(card.checker.actor, { ...(card.checker.buildInput(emails) as Record<string, unknown>), [INPUT_MARKER]: row.id }, {
      build: card.checker.build, timeoutSecs: CHECKER_RUN_TIMEOUT_SECS, maxTotalChargeUsd: capUsd,
      webhooks: [{ eventTypes: [...APIFY_RUN_END_EVENTS], requestUrl: webhookUrl(p, row.id, token) }],
    });
    await p.db.runRecordStart(row.id, owner, started.id, started.datasetId, capUsd);
    await p.schedule("lead_collect", { run_id: row.id, seq: "p0" }, FIRST_COLLECT_SECONDS);
    const more = all.length > (batch + 1) * CHECK_BATCH;
    if (more) await p.schedule("lead_check", { round_id: round.id, batch: batch + 1 }, 0);
    return { kind: "started", emails: emails.length, more };
  } catch (e) {
    const kind = await startFailed(p, row, owner, e);
    if (kind === "refused") {
      // These addresses cannot be checked: "Couldn't check", so the round can end.
      await p.db.checkCommit(round.id, row.id, slice.map((m) => ({ lead_id: m.lead_id, email_state: "unknown" as const, checked_at: iso(p.now()) })), 0, all.length <= (batch + 1) * CHECK_BATCH);
    }
    return { kind };
  }
}

/** A checker run's collect: read its answers once the run is over, and hand them to lead_check_commit. */
async function collectCheck(p: LeadPorts, round: LeadRoundRow, run: LeadRunRow, owner: string): Promise<CollectOutcome> {
  if (round.state === "ended") return { kind: "round_ended" };
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
    if (state === "succeeded" && datasetId) items = (await p.apify.listItems(datasetId, 0, CHECK_BATCH, [...card.checker.fields])).items;
    for (const it of items) {
      const r = card.checker.mapItem(it);
      if (r) byEmail.set(r.email, r.state);
    }
    const waiting = checkable(await p.db.membersOfRound(round.id));
    // A run that succeeded answers the addresses it was given; one that did not leaves every address still waiting "Couldn't check".
    const results = waiting
      .filter((m) => state !== "succeeded" || byEmail.has(m.email as string))
      .map((m) => ({ lead_id: m.lead_id, email_state: byEmail.get(m.email as string) ?? ("unknown" as const), checked_at: iso(p.now()) }));
    const others = (await p.db.runsOfRound(round.id)).filter((r) => r.purpose === "check" && r.id !== run.id);
    const answered = new Set(results.map((r) => r.lead_id));
    const last = others.every((r) => FINAL_RUN_STATES.has(r.state)) && waiting.every((m) => answered.has(m.lead_id));
    const commit = await p.db.collectCommit(run.id, owner, gen, run.read_offset, run.read_offset + items.length, { judgment: null, places: [], usage_usd: usage, items_seen: items.length, run_state: FINAL_RUN_STATES.has(run.state) ? null : state, next: null, round: null });
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
