#!/usr/bin/env node
/**
 * The lead finder's internal runner (PRD §12.6, decision 30): a search posted
 * through the real route as the nightly's owner, on the nightly's own
 * workspace (the one listed in lead_platform.tenants_on while the switch is
 * off for everyone), watched until it ends, and scored against a labelled set
 * for gate G2.
 *
 *   node tooling/scripts/ops/lead-search.mjs --plan docs/plans/lead-plan.json [--workspace chanlytics-e2e] [--wait]
 *   node tooling/scripts/ops/lead-search.mjs --search <id> --label labels.json
 *
 * Env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
 * SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY), E2E_USER_EMAIL, and
 * E2E_BASE_URL (default https://app.chanlytics.com): the nightly's own
 * (e2e/session.ts). Sign-in is an emailed code, so a session is minted the
 * way the nightly mints one: generate_link with the service role, verified
 * with the anon key, handed to the app as the cookie it reads. No password
 * exists to leak, and generate_link sends no email.
 *
 * The labelled set (docs/plans/lead-labels.example.json): each place id the
 * search may find, with its kind of business and whether a person says it
 * qualifies under the plan's contract (a likely buyer is not a confirmed
 * stockist). What the printed score's fields mean, since two of them are
 * easy to misread: `labelled` and `qualified` count the LABELLED subset
 * only, a sample of what the search found, and drive `precision` (Qualified
 * by kind of business, with the 95% Wilson interval `passes` reads against
 * decision 29's bar) and `labelled_qualified_share` (that subset's own
 * qualified share - not the engine's yield, which is the probe's share that
 * clears exclusion and holds what the contact standard needs; see
 * packages/core/src/leads/sizing.ts#yieldOf. lead_searches_view exposes no
 * per-member contact-standard tally, so the engine's yield cannot be shown
 * beside it here). `review_share` is the labelled subset sent to Needs
 * review. `cost_per_qualified_usd` divides the round's whole cost by the
 * SEARCH's own qualified count (`row.qualified`, lead_searches_view) - not
 * the labelled subset, which is usually far smaller than what the search
 * actually found.
 */
import fs from "node:fs";
import { createChunks } from "@supabase/ssr/dist/main/utils/chunker.js";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, all) =>
      a.startsWith("--") ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true] : [],
    )
    .filter((x) => x.length),
);
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const EMAIL = process.env.E2E_USER_EMAIL;
const BASE = process.env.E2E_BASE_URL ?? "https://app.chanlytics.com";
const WORKSPACE = args.workspace ?? "chanlytics-e2e";
const POLL_MS = 15_000;
const WAIT_MAX_MS = 45 * 60_000;

/** Wilson's 95% interval for k of n. */
export function wilson(k, n, z = 1.96) {
  if (n === 0) return { p: null, lo: null, hi: null };
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const e = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { p, lo: (c - e) / d, hi: (c + e) / d };
}

/**
 * G2's numbers from the members the route answered and the labels a person
 * wrote. `qualified` and `labelled_qualified_share` count the LABELLED
 * subset only (for precision); `cost_per_qualified_usd` divides by
 * `roundQualified`, the search's own tally (lead_searches_view's
 * `qualified`, passed by the caller as `row.qualified`), which is what the
 * cost was actually spread over.
 */
export function score(members, labels, costUsd, roundQualified) {
  const byKind = new Map();
  let seen = 0;
  let qualified = 0;
  let review = 0;
  for (const m of members) {
    // leads_page keys a row by its lead; the labelled set may name a place id (the listing) or a lead id.
    const label = labels.places[m.place_id ?? ""] ?? labels.places[m.lead_id];
    if (!label) continue;
    seen += 1;
    if (m.class === "review") review += 1;
    if (m.class !== "qualified") continue;
    qualified += 1;
    const k = byKind.get(label.category_key) ?? { n: 0, right: 0 };
    k.n += 1;
    if (label.qualified) k.right += 1;
    byKind.set(label.category_key, k);
  }
  const all = [...byKind.values()].reduce((a, k) => ({ n: a.n + k.n, right: a.right + k.right }), { n: 0, right: 0 });
  const precision = Object.fromEntries(
    [...byKind.entries()].map(([kind, k]) => [kind, { n: k.n, ...wilson(k.right, k.n) }]),
  );
  return {
    labelled: seen,
    qualified,
    precision: { all: { n: all.n, ...wilson(all.right, all.n) }, ...precision },
    // The labelled subset's own qualified share - NOT the engine's yield
    // (renamed so the two can't be confused; see the file's own docstring).
    labelled_qualified_share: seen ? qualified / seen : null,
    review_share: seen ? review / seen : null,
    cost_per_qualified_usd:
      typeof costUsd === "number" && roundQualified ? Math.round((costUsd / roundQualified) * 10_000) / 10_000 : null,
    passes: all.n > 0 && all.right / all.n >= 0.95 && wilson(all.right, all.n).lo >= 0.9,
  };
}

async function mint() {
  for (const [k, v] of Object.entries({ URL_, KEY, ANON, EMAIL })) if (!v) throw new Error(`missing env for ${k}`);
  const gen = await fetch(`${URL_}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: KEY, authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ type: "magiclink", email: EMAIL }),
  });
  if (!gen.ok) throw new Error(`could not mint a session link (${gen.status}): ${await gen.text()}`);
  const body = await gen.json();
  const tokenHash = body.hashed_token ?? body.properties?.hashed_token;
  if (!tokenHash) throw new Error("generate_link returned no hashed_token");
  const ver = await fetch(`${URL_}/auth/v1/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON },
    body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
  });
  if (!ver.ok) throw new Error(`could not verify the minted token (${ver.status}): ${await ver.text()}`);
  const session = await ver.json();
  const ref = new URL(URL_).hostname.split(".")[0];
  const value =
    "base64-" +
    Buffer.from(JSON.stringify(session), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return createChunks(`sb-${ref}-auth-token`, value)
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

function api(cookie) {
  return async (method, path, body) => {
    const url = `${BASE}/api/v1/${path}${path.includes("?") ? "&" : "?"}workspace=${encodeURIComponent(WORKSPACE)}`;
    const res = await fetch(url, {
      method,
      headers: { cookie, origin: new URL(BASE).origin, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) {
      const err = new Error(`${method} ${path}: ${res.status} ${json.error?.code ?? ""} ${json.error?.message ?? ""}`);
      err.status = res.status;
      throw err;
    }
    return json.data;
  };
}

/** Every member of one class, a page at a time: leads_page keysets on the last row's sort_key. */
async function membersOf(call, searchId, cls) {
  const out = [];
  let after = null;
  for (;;) {
    const rows = await call(
      "GET",
      `leads?search=${searchId}&class=${cls}&limit=500${after ? `&after=${encodeURIComponent(after)}` : ""}`,
    );
    if (!Array.isArray(rows) || !rows.length) return out;
    out.push(...rows);
    if (rows.length < 500) return out;
    after = rows[rows.length - 1].sort_key;
  }
}
async function allMembers(call, searchId) {
  return [
    ...(await membersOf(call, searchId, "qualified")),
    ...(await membersOf(call, searchId, "review")),
    ...(await membersOf(call, searchId, "excluded")),
  ];
}

/** The line a watched round prints. Its question is said only while the round is waiting on it: 00140 stores the question and never clears it, so an answered round still carries the one it asked. */
function line(row) {
  const asking = row.state === "waiting_on_owner" && row.question ? ` (asking: ${row.question.sentence})` : "";
  return `${new Date().toISOString()} ${row.state}${asking} qualified ${row.qualified} review ${row.review} excluded ${row.excluded} counted ${row.counted}`;
}

async function main() {
  const call = api(await mint());
  let searchId = args.search;
  if (!searchId) {
    if (!args.plan) throw new Error("--plan <file.json> or --search <id>");
    const plan = JSON.parse(fs.readFileSync(String(args.plan), "utf8"));
    const made = await call("POST", "lead-searches", plan);
    searchId = made.search_id;
    console.log(`search ${searchId}, round ${made.round_id}`);
  }
  let row = (await call("GET", `lead-searches/${searchId}`)).search;
  if (args.wait || args.label) {
    const until = Date.now() + WAIT_MAX_MS;
    while (row.state !== "ended" && Date.now() < until) {
      console.log(line(row));
      if (row.state === "waiting_on_owner") {
        try {
          await call("POST", `lead-searches/${searchId}/answer`, { answer: "keep" });
          console.log("answered: keep going");
        } catch (e) {
          // lead_round_answer's only refusal is {error:"state"}, said back as a 409
          // conflict, when the round already left waiting_on_owner between our read
          // above and this call (someone else answered it, or it ended on its own).
          // That race is not a run failure: re-read below, on the same poll, and
          // carry on instead of aborting a 45-minute wait over it.
          if (e?.status !== 409) throw e;
          console.log(`answer raced the round's own state, re-reading: ${e.message}`);
        }
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
      row = (await call("GET", `lead-searches/${searchId}`)).search;
    }
  }
  console.log(
    JSON.stringify(
      {
        state: row.state,
        ending: row.ending,
        qualified: row.qualified,
        review: row.review,
        excluded: row.excluded,
        counted: row.counted,
        judge_tokens: row.judge_tokens,
        cost_usd: row.cost_usd ?? null,
      },
      null,
      2,
    ),
  );
  if (args.label) {
    const labels = JSON.parse(fs.readFileSync(String(args.label), "utf8"));
    const members = await allMembers(call, searchId);
    console.log(JSON.stringify(score(members, labels, row.cost_usd, row.qualified), null, 2));
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").replace(/^.*\//, ""))) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
