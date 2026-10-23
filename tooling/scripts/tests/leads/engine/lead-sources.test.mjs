/**
 * The lead finder's providers, watched for the platform (apps/edge/lib/leads/lead-sources.ts), executed over a fake
 * pager memory and a fake transport.
 *
 * 23 Oct 2026: the Maps actor's pinned build was deleted by its provider, every Maps search was refused at its start,
 * and the refusal's words were kept nowhere. A refusal pages at once, in the provider's words; each morning
 * a pin behind the provider's latest pages, before the provider removes it; Health says both in words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pageKeyWords } from "@chanlytics/contracts";
import { leadPins } from "../../../../../packages/core/src/leads/cards.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const { pageSourceRefused, watchLeadPins } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/leads/lead-sources.ts")).href
);

process.env.LEAD_TO = "ops@example.test";
process.env.LEAD_FROM = "pager@example.test";

/** The pager's memory (operator_pages): the read, the upsert and the stamp pageOperator makes. */
function pagerMemory() {
  const rows = new Map();
  return {
    rows,
    from(table) {
      assert.equal(table, "operator_pages");
      return {
        select: () => ({
          eq: (_c, key) => ({ maybeSingle: async () => ({ data: rows.get(key) ?? null, error: null }) }),
        }),
        upsert: async (row) => {
          rows.set(row.key, { alerted_at: null, ...(rows.get(row.key) ?? {}), ...row });
          return { data: null, error: null };
        },
        update: (patch) => ({
          eq: async (_c, key) => {
            rows.set(key, { ...(rows.get(key) ?? {}), ...patch });
            return { data: null, error: null };
          },
        }),
      };
    },
  };
}
function mailbox() {
  const sent = [];
  return { sent, send: async (_from, _to, subject, body) => (sent.push({ subject, body }), true) };
}

const FIVE_AM = Date.parse("2026-10-24T05:10:00.000Z");
const MAPS = "compass/crawler-google-places";

test("every actor a search starts is pinned once, at its build", () => {
  assert.deepEqual(leadPins(), [
    { actor: MAPS, build: "0.14.775" },
    { actor: "olympus/b2b-leads-finder", build: "0.0.259" },
    { actor: "bounceverify/bounceverify-email-verifier", build: "0.1.16" },
  ]);
});

test("a refused start pages the platform once a window, naming the actor, the build and the provider's words", async () => {
  const db = pagerMemory();
  const m = mailbox();
  const why = 'the provider refused: record-not-found (Build with number "0.14.757" was not found.)';
  await pageSourceRefused(db, { actor: MAPS, build: "0.14.757", why }, { send: m.send, now: () => FIVE_AM });
  await pageSourceRefused(db, { actor: MAPS, build: "0.14.757", why }, { send: m.send, now: () => FIVE_AM + 60_000 });
  assert.equal(m.sent.length, 1, "the second refusal is counted, not mailed again");
  assert.equal(db.rows.get(`lead_source_refused:${MAPS}`).count, 2);
  assert.match(m.sent[0].subject, /A lead source refused to start: compass\/crawler-google-places$/);
  assert.ok(m.sent[0].body.startsWith(`${MAPS} refused to start a run at build 0.14.757: ${why}`));
  assert.match(m.sent[0].body, /packages\/core\/src\/leads\/cards\.ts/, "it says where the pin is");
});

test("each morning a pin behind the provider's latest pages, one page an actor; a pin at its latest says nothing", async () => {
  const db = pagerMemory();
  const m = mailbox();
  const asked = [];
  const latest = {
    [MAPS]: "0.14.775",
    "olympus/b2b-leads-finder": "0.0.260",
    "bounceverify/bounceverify-email-verifier": "0.1.18",
  };
  const apify = { latestBuild: async (actor) => (asked.push(actor), latest[actor]) };
  assert.equal(await watchLeadPins(db, apify, FIVE_AM, { send: m.send, now: () => FIVE_AM }), 2);
  assert.deepEqual(
    asked,
    leadPins().map((p) => p.actor),
  );
  assert.deepEqual(
    m.sent.map((s) => s.subject),
    [
      "[Chanlytics] A lead source's pinned build is behind: olympus/b2b-leads-finder",
      "[Chanlytics] A lead source's pinned build is behind: bounceverify/bounceverify-email-verifier",
    ],
  );
  assert.match(
    m.sent[1].body,
    /^bounceverify\/bounceverify-email-verifier is pinned to build 0\.1\.16; its latest build is 0\.1\.18\./,
  );
});

test("the watch runs in its one hour, with a key, and a latest it cannot read skips that pin alone", async () => {
  const db = pagerMemory();
  const m = mailbox();
  let calls = 0;
  const apify = {
    latestBuild: async (actor) => {
      calls += 1;
      if (actor === MAPS) throw new Error("the provider did not answer");
      return "9.9.9";
    },
  };
  assert.equal(await watchLeadPins(db, apify, FIVE_AM + 3600_000, { send: m.send }), 0, "not its hour");
  assert.equal(calls, 0);
  assert.equal(await watchLeadPins(db, null, FIVE_AM, { send: m.send }), 0, "no key on this deployment");
  assert.equal(await watchLeadPins(db, apify, FIVE_AM, { send: m.send, now: () => FIVE_AM }), 2);
  assert.equal(calls, 3, "the unreadable one is skipped and the others are still held");
});

test("Health says both pages in words, the actor after the colon", () => {
  assert.equal(pageKeyWords(`lead_source_refused:${MAPS}`), `A lead source refusing to start: ${MAPS}`);
  assert.equal(
    pageKeyWords("lead_source_pin:bounceverify/bounceverify-email-verifier"),
    "A lead source's pinned build behind its latest: bounceverify/bounceverify-email-verifier",
  );
});
