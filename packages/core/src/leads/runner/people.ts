/**
 * A people search's round (the people card, 00430): one run at the provider for the plan's filters, its items read a
 * page at a time into companies with the people named on them, then the round goes to its checks. Nothing is probed or
 * judged: the provider's filters are the criteria, so what a run finds waits in Needs review on its address alone, and
 * the check promotes what checks out, as it does a list's rows (00242's J2). The rest is the places round's own: the
 * run row by its deterministic id, the claim, the commit that moves the offset and the round, the checker.
 *
 *   startPeople     lead_round_start for a people plan: one run, asking for twice the count (two found make a lead)
 *   collectPeople   lead_collect for its run: a page of items to companies, kept (lead_company_upsert), then committed;
 *                   a run whose first items it reads none of is stopped at the provider (the card's fields changed)
 *   companiesOf     a page's people by company: each company once, its people (five at most) and its addressee, the
 *                   most senior one with a work address; a company with nobody to write to is no lead
 */
import { APIFY_RUN_END_EVENTS } from "@chanlytics/channels";
import {
  LEAD_CARDS,
  LEAD_ESTIMATE_MARGIN,
  LEAD_PEOPLE_MAX,
  PEOPLE_RUN_FLOOR_USD,
  firstNameOf,
  leadRoleOf,
  type LeadPeoplePlan,
  type LeadPerson,
  type LeadRole,
  type LeadRoundEnding,
  type LeadRunState,
} from "@chanlytics/contracts";
import { CARDS, PEOPLE_CAP_FLOOR_USD, PEOPLE_RUN_TIMEOUT_SECS, type PersonAtCompany } from "../cards";
import { FINAL_RUN_STATES, runStateOf } from "../endings";
import { runIdFor, sha256Hex } from "../ids";
import type { CollectCompany, CollectPage, LeadPorts, LeadRoundRow, LeadRunRow } from "../ports";
import { claimOrRecover, startFailed } from "./claim";
import type { CollectOutcome } from "./collect";
import type { StartOutcome, TermOutcome } from "./start";
import {
  FIRST_COLLECT_SECONDS,
  INPUT_MARKER,
  LeadRetry,
  PAGE_ITEMS,
  POLL_SECONDS,
  isRefused,
  outOfTime,
  webhookUrl,
} from "./rules";

/** The one run's term: a people round has no search phrases, so its run is named for the card. */
const PEOPLE_TERM = "people";
/** The most people one run asks for: the plan's count doubled, never past the provider's sensible page of work. */
const PEOPLE_ASK_MAX = 1000;
/**
 * A run whose first items, this many, the mapper reads none of is a provider writing fields the card does not know (a
 * build changed since its calibration): every person it charges for would be lost, so the run is stopped there.
 */
const UNREADABLE_PAGE = 10;

const ROLE_RANK: Record<LeadRole, number> = {
  owner: 0,
  founder: 1,
  executive: 2,
  partner: 3,
  director: 4,
  manager: 5,
  staff: 6,
};
const rankOf = (r: LeadRole | null): number => (r === null ? 7 : ROLE_RANK[r]);

/** The people asked for: twice the count, as a search assumes two found make one lead. */
const peopleToAsk = (plan: LeadPeoplePlan): number => Math.min(PEOPLE_ASK_MAX, 2 * plan.count);

/**
 * What the run may charge (its cap): the people asked for at the card's price, and its start, with the room; never under
 * the provider's floor, and never past what the round has left once the checker's floor is kept for the addresses (the
 * door reserved both floors: contracts peopleEstimateUsd).
 */
function capOf(plan: LeadPeoplePlan, leftUsd: number): number {
  const brief = LEAD_CARDS.find((c) => c.id === "people_at_companies");
  const want =
    (peopleToAsk(plan) * (brief?.costPerPlaceUsd ?? 0.002) + (brief?.startUsd ?? 0.01)) * LEAD_ESTIMATE_MARGIN;
  const room = leftUsd - PEOPLE_RUN_FLOOR_USD;
  return Math.round(Math.max(PEOPLE_CAP_FLOOR_USD, Math.min(room, want)) * 100) / 100;
}

/** lead_round_start for a people plan: its one run, made by its id, claimed, and only then started at the provider. */
export async function startPeople(
  p: LeadPorts,
  round: LeadRoundRow,
  plan: LeadPeoplePlan,
  owner: string,
  leftUsd: number,
): Promise<StartOutcome> {
  const card = CARDS.people_at_companies;
  const id = await runIdFor(round.id, "main", PEOPLE_TERM);
  const cap = capOf(plan, leftUsd);
  const [row] = await p.db.runsEnsure([
    {
      id,
      tenant_id: round.tenant_id,
      round_id: round.id,
      purpose: "discover",
      term: PEOPLE_TERM,
      actor: card.actor,
      build: card.build,
      webhook_token_hash: await sha256Hex(await p.webhookToken(id)),
      cap_usd: cap,
    },
  ]);
  if (!row) throw new Error("lead_round_start: the people run's row was not made");
  const said = (kind: TermOutcome): StartOutcome => ({
    kind: "started",
    phase: "main",
    runs: [{ term: PEOPLE_TERM, kind }],
  });
  if (row.state !== "claimed" && !(row.state === "starting" && row.claimed_by === owner)) return said("already");
  if (outOfTime(p)) throw new LeadRetry("out of time before the people run's start");
  const claim = await claimOrRecover(p, card.actor, row, owner);
  if (claim !== "mine") return said(claim === "recovered" ? "reconciled" : "someone_elses");
  const token = await p.webhookToken(row.id);
  const input = { ...(card.buildInput(plan, peopleToAsk(plan)) as Record<string, unknown>), [INPUT_MARKER]: row.id };
  try {
    const started = await p.apify.startRun(card.actor, input, {
      build: card.build,
      timeoutSecs: PEOPLE_RUN_TIMEOUT_SECS,
      maxTotalChargeUsd: cap,
      webhooks: [{ eventTypes: [...APIFY_RUN_END_EVENTS], requestUrl: webhookUrl(p, row.id, token) }],
    });
    await p.db.runRecordStart(row.id, owner, started.id, started.datasetId, cap);
    await p.schedule("lead_collect", { run_id: row.id, seq: "p0" }, FIRST_COLLECT_SECONDS);
    return said("started");
  } catch (e) {
    const kind = await startFailed(p, row, owner, e);
    if (kind === "refused") await p.db.roundEnd(round.id, "source_failed");
    return said(kind);
  }
}

/** What a company's person says on its row: their title and the company's size. */
const reasonOf = (who: LeadPerson | undefined, size: string | null): string =>
  [who?.title, size ? `${size} people` : null].filter((x): x is string => !!x).join(" · ");

/** A page's people by company (00430): each company once, with its people and its addressee. */
export function companiesOf(found: readonly PersonAtCompany[]): CollectCompany[] {
  const by = new Map<string, { company: PersonAtCompany["company"]; people: LeadPerson[] }>();
  // Those with a work address first, the most senior first among them, so the five a company keeps are the ones it can
  // be written to through.
  const ranked = found
    .map((f, i) => ({ f, i, rank: rankOf(leadRoleOf(f.person.seniority, f.person.title)) }))
    .sort((a, b) => Number(!a.f.person.email) - Number(!b.f.person.email) || a.rank - b.rank || a.i - b.i)
    .map((x) => x.f);
  for (const f of ranked) {
    const at = by.get(f.company.key) ?? { company: f.company, people: [] };
    const named = f.person.name.toLowerCase();
    const twice = at.people.some(
      (x) => (f.person.email && x.email === f.person.email) || x.name.toLowerCase() === named,
    );
    if (!twice && at.people.length < LEAD_PEOPLE_MAX)
      at.people.push({
        name: f.person.name,
        first_name: f.person.first_name ?? firstNameOf(f.person.name, null),
        title: f.person.title,
        role: leadRoleOf(f.person.seniority, f.person.title),
        email: f.person.email,
        profile_url: f.person.profile_url,
      });
    by.set(f.company.key, at);
  }
  const out: CollectCompany[] = [];
  for (const { company, people } of by.values()) {
    // The addressee: the most senior person with a work address, the first found among equals.
    const ranked = people
      .map((person, i) => ({ person, i }))
      .filter((x) => x.person.email !== null)
      .sort((a, b) => rankOf(a.person.role) - rankOf(b.person.role) || a.i - b.i);
    const top = ranked[0];
    const email = top?.person.email;
    if (!top || !email) continue;
    out.push({
      source_key: company.key,
      name: company.name,
      category: company.industry,
      city: company.city,
      region: company.region,
      country: company.country,
      linkedin_url: company.linkedin,
      about: company.about,
      email,
      facts: { people, addressee: top.i, size: company.size },
      reason: reasonOf(top.person, company.size),
    });
  }
  return out;
}

/**
 * How a people round ends once its run is over: the source's failure when it found nothing and did not finish, else
 * everything the plan covers was searched. Never "found what you asked for": that is the checks' to say, and a company
 * found is not yet one written to.
 */
function endingOf(state: LeadRunState, held: number): LeadRoundEnding {
  return held === 0 && state !== "succeeded" ? "source_failed" : "searched_everything";
}

/**
 * Whether the run's first UNREADABLE_PAGE items, however many collects they came in, are all ones the card cannot read:
 * judged once, on the read that reaches that many, with the earlier ones read again where they came in a read before.
 */
async function unreadableStart(
  p: LeadPorts,
  at: { datasetId: string | null; base: number; items: readonly unknown[]; found: number },
): Promise<boolean> {
  const card = CARDS.people_at_companies;
  const reaches = at.base < UNREADABLE_PAGE && at.base + at.items.length >= UNREADABLE_PAGE;
  if (!reaches || at.found > 0) return false;
  if (at.base === 0 || !at.datasetId) return true;
  if (outOfTime(p)) throw new LeadRetry("out of time before reading the first people again");
  const head = (await p.apify.listItems(at.datasetId, 0, at.base, [...card.fields])).items;
  return head.every((it) => card.mapItem(it) === null);
}

/**
 * lead_collect for a people run, under its lease: the run as the provider has it now, a page of its items to companies
 * kept (lead_company_upsert), then the commit that moves the offset, settles the usage and, once the run is over and
 * read, sends the round to its checks.
 */
export async function collectPeople(
  p: LeadPorts,
  round: LeadRoundRow,
  run: LeadRunRow,
  owner: string,
  gen: number,
): Promise<CollectOutcome> {
  const card = CARDS.people_at_companies;
  const alreadyFinal = FINAL_RUN_STATES.has(run.state);
  let remoteState: LeadRunState = run.state;
  let usage = run.usage_usd;
  let datasetId = run.dataset_id;
  if (!alreadyFinal) {
    if (outOfTime(p)) throw new LeadRetry("out of time before reading the people run");
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
  const base = run.read_offset;
  let items: unknown[] = [];
  if (datasetId && !alreadyFinal) {
    if (outOfTime(p)) throw new LeadRetry("out of time before reading the people");
    items = (await p.apify.listItems(datasetId, base, PAGE_ITEMS, [...card.fields])).items;
  }
  const found = items.map((it) => card.mapItem(it)).filter((x): x is PersonAtCompany => x !== null);
  const companies = companiesOf(found);
  if (companies.length) await p.db.companyUpsert(round.id, companies);
  // Nothing of the run's first items read: it is stopped at the provider now, never paid for to its cap. The provider's
  // own state then ends it, read by the next collect with its last usage, and the round ends as the source's failure
  // (endingOf: aborted, nobody held), never as a search that found nobody. A stop the provider did not answer leaves the
  // page uncommitted, so the collect is tried again and asks again; one it refused (the run is over already) is an answer.
  if (await unreadableStart(p, { datasetId, base, items, found: found.length })) {
    await p.apify.abortRun(run.apify_run_id as string).catch((e: unknown) => {
      if (!isRefused(e)) throw e;
    });
  }

  const to = base + items.length;
  const pageShort = items.length < PAGE_ITEMS;
  const runOver = pageShort && FINAL_RUN_STATES.has(remoteState);
  // A round goes queued -> running -> checking (lead_rounds_guard refuses queued -> checking): a run already over at its
  // first collect is read as running here, and the collect this one schedules at once sends the round to its checks.
  const queued = round.state === "queued";
  const runDone = runOver && !queued;
  const held = runDone ? (await p.db.membersOfRound(round.id)).length : 0;
  const page: CollectPage = {
    judgment: null,
    places: [],
    usage_usd: usage,
    items_seen: run.items_seen + items.length,
    run_state: runDone ? remoteState : null,
    next: runDone
      ? null
      : { kind: "lead_collect", seq: `p${to}`, run_after_seconds: pageShort && !runOver ? POLL_SECONDS : 0 },
    round: runDone
      ? { state: "checking", question: null, ending: null, ending_pending: endingOf(remoteState, held) }
      : queued
        ? { state: "running", question: null, ending: null }
        : null,
  };
  const res = await p.db.collectCommit(run.id, owner, gen, base, to, page);
  if (!res.ok) return { kind: "lost", why: res.why };
  if (runDone) await p.schedule("lead_check", { round_id: round.id, batch: 0 }, 0);
  return {
    kind: "committed",
    commits: 1,
    toOffset: to,
    runState: page.run_state,
    roundState: res.round_state,
    judgeRefused: null,
  };
}
