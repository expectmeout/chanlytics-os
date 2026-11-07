/**
 * The API says the product's nouns (docs/naming.md): a new segment of a member route is a glossary word or an action on
 * one, and the glossary's table of names that do not agree yet names things that exist. The segments said before this
 * test (6 November 2026) are listed by name, and the list may only fall; moving them is the API's layer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { ROOT, readRaw } from "../../_source.mjs";
import { VERBS, wordsOf } from "./_names.mjs";

const glossary = () => readRaw("docs/glossary.md").toLowerCase();
const routes = () =>
  execFileSync("git", ["ls-files", "apps/dashboard/app/api/v1"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith("/route.ts"))
    .map((f) => f.slice("apps/dashboard/app/api/v1/".length, -"/route.ts".length));

/** Each literal segment of a route, with whether it is the route's first (a resource, which an action cannot be). */
const segmentsOf = (route) =>
  route
    .split("/")
    .map((segment, at) => ({ segment, first: at === 0 }))
    .filter(({ segment }) => segment && !/^[[(]/.test(segment));

/** A segment the glossary says, word for word, or an action on what the route before it names. */
export function isKnownSegment(segment, first, text) {
  const words = segment.replace(/\.[a-z]+$/, "").split("-");
  const said = words.join(" ");
  const singular = said.replace(/s$/, "");
  if (text.includes(said) || text.includes(singular) || text.includes(segment)) return true;
  return !first && VERBS.has(wordsOf(segment)[0] ?? "");
}

const SAID_BEFORE_THE_RULE = new Set(
  `accent alerts booking-request bugs buy callback capabilities checkout choices client-errors deliveries doubts exclude
  fact-suggestions filler.ics headline health idea invited invoices lead-operations lead-previews lead-searches lead-suggestions
  lead-words locations mailbox-connections mailbox-senders marketing-consent media morning not-a-customer not-a-person not-right
  notifications overview payout portal preview-claims qr quick reach-out-replies reach-out-sends refile
  seen signup signup-confirm speech starter touches vitals waitlist`.split(/\s+/),
);

test("every segment of a member route is a glossary word, an action on one, or was said before the rule", () => {
  const text = glossary();
  const unknown = new Set();
  for (const route of routes())
    for (const { segment, first } of segmentsOf(route))
      if (!isKnownSegment(segment, first, text) && !SAID_BEFORE_THE_RULE.has(segment))
        unknown.add(`${route}: ${segment}`);
  assert.deepEqual([...unknown].sort(), [], "give the word a row in docs/glossary.md, or use the word it already has");
});

test("the list of what was said before the rule only names what is still said and still unknown", () => {
  const text = glossary();
  const seen = new Map();
  for (const route of routes())
    for (const { segment, first } of segmentsOf(route)) seen.set(segment, (seen.get(segment) ?? false) || first);
  assert.deepEqual(
    [...SAID_BEFORE_THE_RULE].filter((s) => !seen.has(s) || isKnownSegment(s, seen.get(s), text)).sort(),
    [],
    "take it off SAID_BEFORE_THE_RULE: the route moved, or the glossary says it now",
  );
});

test("the rule refuses a segment no one defined, and takes an action on a known noun", () => {
  const text = "| **people** | everyone a workspace knows |\n| **deal** | a sale |";
  assert.equal(isKnownSegment("people", true, text), true);
  assert.equal(isKnownSegment("deals", true, text), true);
  assert.equal(isKnownSegment("widgets", true, text), false);
  assert.equal(isKnownSegment("send-now", false, text), true);
  assert.equal(isKnownSegment("send-now", true, text), false, "a resource is never an action");
});

test("the names the glossary says do not agree yet exist: each storage name in the schema, each path a route", () => {
  const page = readRaw("docs/glossary.md");
  const at = page.indexOf("## Where the names do not agree yet");
  const table = page.slice(at, page.indexOf("## Words to avoid"));
  const rows = table.split("\n").filter((l) => /^\| [A-Z]/.test(l) && !/^\| The product/.test(l));
  assert.ok(rows.length >= 8, `the table was read (${rows.length} rows)`);
  const schema = readRaw("supabase/schema.sql");
  const known = new Set(routes());
  const missing = [];
  for (const row of rows) {
    const [, , storage, api] = row.split("|").map((c) => c.trim());
    const name = /`(\w+)`/.exec(storage)?.[1];
    if (name && !new RegExp(`^CREATE TABLE public\\.${name} \\(`, "m").test(schema)) missing.push(`table ${name}`);
    const route = /\/api\/v1\/([\w/-]+)/.exec(api)?.[1]?.replace(/\/$/, "");
    if (route && ![...known].some((r) => r === route || r.startsWith(`${route}/`))) missing.push(`route ${route}`);
  }
  assert.deepEqual(missing, [], "docs/glossary.md names something that is gone: take its row out");
});
