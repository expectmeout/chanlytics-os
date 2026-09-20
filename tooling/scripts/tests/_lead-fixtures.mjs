/**
 * The lead finder's fixtures: the real shape with fictional values.
 *
 * The shapes were read from the calibration's datasets on 18 September 2026
 * (PRD Appendix C, "shapes kept, values not"): a Maps item carries every
 * MAPS_FIELDS key, `state` is the full name ("Texas"), `instagrams[0]` is the
 * business and later entries can be staff, `phonesUncertain` mixes coordinates
 * with numbers and is never read, `location` is { lat, lng }; a checker item
 * says `status` (valid | risky | unknown | invalid) with `is_catch_all`, and
 * its input key is `emails`. Every value here is invented: numbers in
 * 555-01xx, hosts under .example, place ids ChIJfixture plus four digits,
 * streets that do not exist. Nothing token-shaped, so the secret scanner has
 * nothing to find.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */

/** The plan the tests run: personal trainers in Austin, an email standard unless a test says otherwise. */
export const PLAN = {
  version: 1,
  card: "local_businesses",
  name: "Personal trainers in Austin",
  asked: "personal trainers in Austin that are not big gyms",
  terms: ["personal trainer", "strength coach"],
  area: { kind: "city", label: "in Austin, TX", state: "TX", center: null, radius_m: 25_000, query: "Austin, TX, USA" },
  count: 20,
  contact: "phone",
  criteria: [
    { key: "right_kind", text: "a personal trainer or coaching studio", standard: "likely", required: true },
    { key: "independent", text: "independent, not part of a chain gym", standard: "likely", required: true },
  ],
  exclusions: [{ key: "chains", text: "chain gyms", origin: "claude" }],
};

/** How a person labelling the fixture would answer for each title: what the fake judge reads. */
export const LABELS = new Map();

const AUSTIN = { lat: 30.2672, lng: -97.7431 };
const four = (n) => String(n).padStart(4, "0");

/** One Maps item with every key MAPS_FIELDS reads (and the two it never reads), overridable. */
export function mapsItem(n, over = {}) {
  const host = `place${four(n)}.example`;
  return {
    title: `Place ${four(n)}`,
    categoryName: "Personal trainer",
    neighborhood: "Zilker",
    street: `${100 + n} Fictional Way`,
    city: "Austin",
    state: "Texas",
    postalCode: "78704",
    countryCode: "US",
    phoneUnformatted: `+1512555${four(100 + (n % 100))}`,
    phone: `(512) 555-${four(100 + (n % 100))}`,
    phones: [`(512) 555-${four(100 + (n % 100))}`],
    phonesUncertain: [`30.26, -97.74`],
    website: `https://www.${host}/`,
    domain: host,
    emails: [`hello@${host}`],
    instagrams: [`https://www.instagram.com/place${four(n)}`, `https://www.instagram.com/staff${four(n)}`],
    placeId: `ChIJfixture${four(n)}`,
    totalScore: 4.8,
    reviewsCount: 40,
    permanentlyClosed: false,
    temporarilyClosed: false,
    location: { lat: AUSTIN.lat + (n % 7) * 0.01, lng: AUSTIN.lng - (n % 5) * 0.01 },
    description: "Independent strength studio in South Austin.",
    // What the listing shows about the business (D2): kept for the owner's peek, never handed to the judge.
    ownerDescription: "Family-run since 2009.",
    openingHours: [{ day: "Monday", hours: "9 AM to 6 PM" }, { day: "Sunday", hours: "Closed" }],
    imageUrl: `https://lh3.example/place${four(n)}.jpg`,
    reviewsDistribution: { oneStar: 1, twoStar: 1, threeStar: 3, fourStar: 10, fiveStar: 25 },
    price: "$$",
    facebooks: [`https://www.facebook.example/place${four(n)}`],
    linkedIns: [],
    tiktoks: [],
    claimThisBusiness: false,
    rank: (n % 20) + 1,
    url: `https://maps.example/?cid=${n}`,
    ...over,
  };
}

function label(item, kind) {
  LABELS.set(item.title, kind);
  return item;
}

/**
 * The probe: 25 places for the plan above. 12 fit, 9 chain gyms, 3 other kinds
 * (a dog trainer, a gymnastics club, a physical therapist), 1 closed. One fit
 * place lists a platform address beside its own; one has a placeholder phone;
 * two fit places share one phone (a shared front desk); places 0-12 came from
 * "personal trainer", the rest from "strength coach".
 */
export function probeItems() {
  const out = [];
  for (let n = 1; n <= 12; n++) out.push(label(mapsItem(n), "fit"));
  for (let n = 13; n <= 21; n++) out.push(label(mapsItem(n, { title: `PowerGym Austin #${n}`, categoryName: "Gym" }), "chain"));
  out.push(label(mapsItem(22, { title: "Good Dog Training Co", categoryName: "Dog trainer" }), "other"));
  out.push(label(mapsItem(23, { title: "Tumble Town Gymnastics", categoryName: "Gymnastics center" }), "other"));
  out.push(label(mapsItem(24, { title: "Barton Physical Therapy", categoryName: "Physical therapist" }), "other"));
  out.push(label(mapsItem(25, { title: "Closed Strength Studio", permanentlyClosed: true }), "fit"));
  out[1].emails = ["support@vagaro.com", "hello@place0002.example"];
  out[2].phoneUnformatted = "+11234567890";
  out[2].phone = "(123) 456-7890";
  out[2].phones = [];
  out[4].phoneUnformatted = out[3].phoneUnformatted;
  out[4].phone = out[3].phone;
  out[4].phones = [out[3].phone];
  return out;
}

/** The main run: 40 more, 30 fitting, 8 chains, 2 other kinds; one fit place is in Dallas (out of the area). */
export function mainItems() {
  const out = [];
  for (let n = 101; n <= 130; n++) out.push(label(mapsItem(n), "fit"));
  for (let n = 131; n <= 138; n++) out.push(label(mapsItem(n, { title: `PowerGym Austin #${n}`, categoryName: "Gym" }), "chain"));
  out.push(label(mapsItem(139, { title: "Lakeline Pilates", categoryName: "Pilates studio" }), "other"));
  out.push(label(mapsItem(140, { title: "Hill Country Chiropractic", categoryName: "Chiropractor" }), "other"));
  out[0].location = { lat: 32.7767, lng: -96.797 };
  out[0].city = "Dallas";
  return out;
}

/** A checker item in the calibration's shape. */
export function checkerItem(email, status, is_catch_all = false) {
  return { email, status, score: status === "valid" ? 95 : 40, smtp_valid: status === "valid", is_catch_all, is_role_based: false, is_disposable: false, risk_type: is_catch_all ? "catch_all" : "none", reason: "", mx_records: ["mx.example"], verified_at: "2026-09-19T12:00:00.000Z" };
}

/** A run object as the provider answers it. */
export function actorRun(over = {}) {
  return {
    id: "RunFixture0001", actId: "nwua9Gu5YrADL7ZDj", status: "RUNNING", startedAt: "2026-09-19T12:00:00.000Z", finishedAt: null,
    defaultDatasetId: "DsFixture0001", defaultKeyValueStoreId: "KvFixture0001", usageTotalUsd: 0.0413,
    chargedEventCounts: { "place-scraped": 25, "contact-details-scraped": 20, "apify-actor-start": 1 },
    ...over,
  };
}

/** The default ad-hoc webhook body. */
export function webhookBody(runId = "RunFixture0001", eventType = "ACTOR.RUN.SUCCEEDED") {
  return { eventType, eventData: { actorId: "nwua9Gu5YrADL7ZDj", actorRunId: runId }, resource: actorRun({ id: runId, status: eventType.replace("ACTOR.RUN.", "").replace("_", "-") }) };
}

/**
 * A judge that answers the way a person labelling the fixture would, in the
 * real answer's shape: every criterion, the fact keys used, the email index,
 * a short reason. A title it does not know is "unknown" on every criterion.
 */
export function fakeJudge(model = "claude-opus-5-fixture") {
  const calls = [];
  return {
    calls,
    async judge(plan, places) {
      calls.push(places.map((p) => p.ref));
      const answers = places.map((p) => {
        const kind = LABELS.get(p.name) ?? "unknown";
        const facts = ["name", "category"].filter((k) => p[k] !== null);
        // The engine's own kind criterion first (contracts LEAD_KIND_KEY), then every criterion and every exclusion
        // (contracts' rubric): an exclusion fails when the place is what is left out; the kind fails when it is
        // another kind of business, which is what "other" labels.
        const rubric = ["kind", ...plan.criteria.map((c) => c.key), ...plan.exclusions.map((e) => e.key)];
        const criteria = rubric.map((key) => ({
          key,
          answer: kind === "unknown" ? "unknown" : kind === "fit" ? "pass" : kind === "chain" && (key === "independent" || key === "chains") ? "fail" : kind === "other" && (key === "kind" || key === "right_kind") ? "fail" : "pass",
          facts,
        }));
        return { ref: p.ref, criteria, email_index: p.emails.length ? 0 : null, reason: kind === "fit" ? "Independent studio with its own site" : kind === "chain" ? "Part of a gym chain" : kind === "other" ? "Another kind of business" : "The facts do not say" };
      });
      return { answers, model, tokens: 40 * places.length, raw: { places: answers }, requestHash: "f".repeat(64) };
    },
  };
}

/**
 * The provider, in memory: datasets by id, runs whose status a test sets, every
 * call recorded, a fault a test can arm per method.
 */
export function fakeApify({ datasets = {}, runs = {} } = {}) {
  const calls = [];
  const faults = {};
  const state = { datasets: { ...datasets }, runs: { ...runs }, started: 0 };
  const fail = (op) => {
    const f = faults[op];
    if (f) {
      delete faults[op];
      throw f;
    }
  };
  return {
    calls,
    faults,
    state,
    async startRun(actor, input, opts) {
      calls.push({ op: "startRun", actor, input, opts });
      fail("startRun");
      state.started += 1;
      const id = `RunFake${String(state.started).padStart(4, "0")}`;
      const datasetId = `DsFake${String(state.started).padStart(4, "0")}`;
      state.runs[id] = actorRun({ id, status: "RUNNING", defaultDatasetId: datasetId, usageTotalUsd: 0 });
      state.datasets[datasetId] ??= [];
      state.runs[id].input = input;
      return { id, datasetId };
    },
    async getRun(id) {
      calls.push({ op: "getRun", id });
      fail("getRun");
      const r = state.runs[id];
      if (!r) throw Object.assign(new Error("the provider refused: record-not-found"), { name: "ApifyRefused", status: 404 });
      return { id: r.id, status: r.status, datasetId: r.defaultDatasetId, usageTotalUsd: r.usageTotalUsd, startedAt: r.startedAt, finishedAt: r.finishedAt };
    },
    async listActorRuns(actor, sinceIso) {
      calls.push({ op: "listActorRuns", actor, sinceIso });
      return Object.values(state.runs).filter((r) => r.startedAt >= sinceIso).map((r) => ({ id: r.id, status: r.status, startedAt: r.startedAt, datasetId: r.defaultDatasetId }));
    },
    async runInput(id) {
      calls.push({ op: "runInput", id });
      return state.runs[id]?.input ?? null;
    },
    async listItems(datasetId, offset, limit, fields) {
      calls.push({ op: "listItems", datasetId, offset, limit, fields });
      fail("listItems");
      const all = state.datasets[datasetId] ?? [];
      return { items: all.slice(offset, offset + limit), total: all.length };
    },
    async abortRun(id) {
      calls.push({ op: "abortRun", id });
      if (state.runs[id]) state.runs[id].status = "ABORTED";
    },
    async eventPrices(actor) {
      calls.push({ op: "eventPrices", actor });
      return { "place-scraped": 0.003 };
    },
    /** The test's hand on the provider: a run ends. */
    finish(id, status = "SUCCEEDED", usageTotalUsd = 0.05) {
      Object.assign(state.runs[id], { status, finishedAt: "2026-09-19T12:03:00.000Z", usageTotalUsd });
    },
  };
}
