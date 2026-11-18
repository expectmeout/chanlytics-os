/**
 * The lead finder's providers, watched for the platform (apps/edge/lib/leads/lead-sources.ts), executed over a fake
 * pager memory and a fake transport.
 *
 * 23 Oct 2026: the Maps actor's pinned build was deleted by its provider, every Maps search was refused at its start,
 * and the refusal's words were kept nowhere. A refusal pages at once, in the provider's words; each health sweep reads
 * every pin's build by its id, all at once, and one the provider deleted pages, while a pin merely behind the latest
 * says nothing; Health says both in words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pageKeyWords } from "@chanlytics/contracts";
import { leadPins } from "../../../packages/core/src/leads/cards.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { recordPageContactsUnread, recordPagePlatformDay, recordPageSourceRefused, watchLeadPins } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/leads/sources.ts")).href
);

const { watchInstagramPin } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/imports/instagram-read.ts")).href
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
const PEOPLE = "olympus/b2b-leads-finder";
const CHECKER = "bounceverify/bounceverify-email-verifier";

test("every actor a search starts is pinned once, at its build and that build's id", () => {
  assert.deepEqual(leadPins(), [
    { actor: MAPS, build: "0.14.792", buildId: "laWvC2kq0M7jC95UN" },
    { actor: PEOPLE, build: "0.0.259", buildId: "UJAtg4JwDdgEVD6iI" },
    { actor: CHECKER, build: "0.1.16", buildId: "uw7qJdrXWOwYh9MUK" },
  ]);
});

/** The provider as the watch reads it: each build id's number (null: deleted), each actor's latest, every read kept. */
function provider(numbers, latest = {}) {
  const asked = [];
  return {
    asked,
    buildNumberOf: async (id) => {
      asked.push(id);
      const n = numbers[id];
      if (n instanceof Error) throw n;
      return n === undefined ? null : n;
    },
    latestBuild: async (actor) => {
      asked.push(actor);
      return latest[actor] ?? null;
    },
  };
}

/** The same provider, every answer held until `answer` lets it go, by the build id or actor it was asked for. */
function heldProvider(numbers, latest = {}) {
  const asked = [];
  const held = new Map();
  const hold = (key, value) => {
    asked.push(key);
    return new Promise((resolve) => held.set(key, () => resolve(value)));
  };
  return {
    asked,
    answer: (key) => held.get(key)(),
    buildNumberOf: (id) => hold(id, numbers[id] ?? null),
    latestBuild: (actor) => hold(actor, latest[actor] ?? null),
  };
}
/** Every promise already answered runs on. */
const drain = () => new Promise((resolve) => setImmediate(resolve));
const STANDING = Object.fromEntries(leadPins().map((p) => [p.buildId, p.build]));

test("a refused start pages the platform once a window, naming the actor, the build and the provider's words", async () => {
  const db = pagerMemory();
  const m = mailbox();
  const why = 'the provider refused: record-not-found (Build with number "0.14.757" was not found.)';
  await recordPageSourceRefused(db, { actor: MAPS, build: "0.14.757", why }, { send: m.send, now: () => FIVE_AM });
  await recordPageSourceRefused(
    db,
    { actor: MAPS, build: "0.14.757", why },
    { send: m.send, now: () => FIVE_AM + 60_000 },
  );
  assert.equal(m.sent.length, 1, "the second refusal is counted, not mailed again");
  assert.equal(db.rows.get(`lead_source_refused:${MAPS}`).count, 2);
  assert.match(m.sent[0].subject, /A lead source refused to start: compass\/crawler-google-places$/);
  assert.ok(m.sent[0].body.startsWith(`${MAPS} refused to start a run at build 0.14.757: ${why}`));
  assert.match(m.sent[0].body, /packages\/core\/src\/leads\/cards\.ts/, "it says where the pin is");
});

test("REGRESSION (the live run of 14 Nov 2026): a run that read none of its places' websites pages the platform once a window, saying where to look", async () => {
  const db = pagerMemory();
  const m = mailbox();
  const page = { actor: MAPS, build: "0.14.775", sites: 25 };
  await recordPageContactsUnread(db, page, { send: m.send, now: () => FIVE_AM });
  await recordPageContactsUnread(db, page, { send: m.send, now: () => FIVE_AM + 60_000 });
  assert.equal(m.sent.length, 1, "the second is counted, not mailed again");
  assert.equal(db.rows.get(`lead_contacts_unread:${MAPS}`).count, 2);
  assert.match(m.sent[0].subject, /A lead source read no websites: compass\/crawler-google-places$/);
  assert.ok(m.sent[0].body.startsWith(`${MAPS} at build 0.14.775 returned 25 places with a website and read none`));
  assert.match(m.sent[0].body, /Failed to get contact details/, "it names the log line to look for");
  assert.match(m.sent[0].body, /packages\/core\/src\/leads\/cards\.ts/, "it says where the pin is");
});

test("every pin still standing says nothing, however far behind the provider's latest it is", async () => {
  const db = pagerMemory();
  const m = mailbox();
  // The checker's 0.1.16 stood two builds behind its latest for weeks and was still there (23 Oct 2026).
  const apify = provider(STANDING, { [CHECKER]: "0.1.18", [MAPS]: "0.14.799" });
  assert.equal(await watchLeadPins(db, apify, { send: m.send, now: () => FIVE_AM }), 0);
  assert.deepEqual(
    apify.asked,
    leadPins().map((p) => p.buildId),
    "each pin's build is read by its id, and no latest is asked for",
  );
  assert.equal(m.sent.length, 0);
});

test("a pin the provider deleted pages, naming its build and the latest to probe; once a window", async () => {
  const db = pagerMemory();
  const m = mailbox();
  const apify = provider({ ...STANDING, laWvC2kq0M7jC95UN: null }, { [MAPS]: "0.14.799" });
  assert.equal(await watchLeadPins(db, apify, { send: m.send, now: () => FIVE_AM }), 1);
  assert.equal(await watchLeadPins(db, apify, { send: m.send, now: () => FIVE_AM + 1800_000 }), 1);
  assert.equal(m.sent.length, 1, "the next sweep's firing is counted, not mailed again");
  assert.equal(db.rows.get(`lead_source_pin:${MAPS}`).count, 2);
  assert.equal(m.sent[0].subject, `[Chanlytics] A lead source's pinned build is gone: ${MAPS}`);
  assert.match(
    m.sent[0].body,
    /^compass\/crawler-google-places is pinned to build 0\.14\.792, and the provider no longer has it \(id laWvC2kq0M7jC95UN\)\./,
  );
  assert.match(m.sent[0].body, /Probe the latest build, 0\.14\.799, with the card's own input/);
  assert.match(m.sent[0].body, /pin its number and id in packages\/core\/src\/leads\/cards\.ts/);
});

test("a pin whose id names another build pages that the two disagree; a latest it cannot read is not named", async () => {
  const db = pagerMemory();
  const m = mailbox();
  const apify = provider({ ...STANDING, uw7qJdrXWOwYh9MUK: "0.1.18" });
  assert.equal(await watchLeadPins(db, apify, { send: m.send, now: () => FIVE_AM }), 1);
  assert.equal(m.sent[0].subject, `[Chanlytics] A lead source's pin names two builds: ${CHECKER}`);
  assert.match(m.sent[0].body, /pinned to build 0\.1\.16, but the pin's id uw7qJdrXWOwYh9MUK names build 0\.1\.18\./);
  assert.match(m.sent[0].body, /Probe the actor's latest build with/);
});

test("the Instagram actor a pasted account is read by is pinned and watched the same way, and pages in its own words", async () => {
  const INSTAGRAM = "apify/instagram-scraper";
  const db = pagerMemory();
  const m = mailbox();
  const standing = provider({ OlhAMG6xbGzbdIKRQ: "0.0.867" }, { [INSTAGRAM]: "0.0.900" });
  assert.equal(await watchInstagramPin(db, standing, { send: m.send, now: () => FIVE_AM }), 0);
  assert.deepEqual(standing.asked, ["OlhAMG6xbGzbdIKRQ"], "its build is read by its id, and no latest is asked for");
  assert.equal(await watchInstagramPin(db, null, { send: m.send }), 0, "no key on this deployment");
  const gone = provider({}, { [INSTAGRAM]: "0.0.900" });
  assert.equal(await watchInstagramPin(db, gone, { send: m.send, now: () => FIVE_AM }), 1);
  assert.equal(m.sent[0].subject, `[Chanlytics] A photo source's pinned build is gone: ${INSTAGRAM}`);
  assert.match(
    m.sent[0].body,
    /^apify\/instagram-scraper is pinned to build 0\.0\.867, and the provider no longer has it \(id OlhAMG6xbGzbdIKRQ\)\. Every read of an Instagram account that starts this actor is refused at its start/,
  );
  assert.match(m.sent[0].body, /Probe the latest build, 0\.0\.900, with one account's read \(a few posts\)/);
  assert.match(
    m.sent[0].body,
    /videoDuration/,
    "it names what a read takes of an item, so the next build is checked for it",
  );
  assert.match(m.sent[0].body, /pin its number and id in apps\/edge\/lib\/imports\/instagram-read\.ts/);
});

test("a build it cannot read skips that pin alone, and a deployment without the key checks nothing", async () => {
  const db = pagerMemory();
  const m = mailbox();
  assert.equal(await watchLeadPins(db, null, { send: m.send }), 0, "no key on this deployment");
  const apify = provider({
    ...STANDING,
    laWvC2kq0M7jC95UN: new Error("the provider did not answer"),
    uw7qJdrXWOwYh9MUK: null,
  });
  assert.equal(await watchLeadPins(db, apify, { send: m.send, now: () => FIVE_AM }), 1);
  assert.deepEqual(
    m.sent.map((s) => s.subject),
    [`[Chanlytics] A lead source's pinned build is gone: ${CHECKER}`],
    "the unreadable one is skipped and the others are still read",
  );
});

test("the pins are read together, and a pin in trouble asks its latest without waiting on the others", async () => {
  // Read one after another, a provider that hangs would cost the sweep a timeout per pin, inside its 60 s.
  const db = pagerMemory();
  const m = mailbox();
  const apify = heldProvider(
    { ...STANDING, laWvC2kq0M7jC95UN: null, uw7qJdrXWOwYh9MUK: null },
    { [MAPS]: "0.14.799", [CHECKER]: "0.1.18" },
  );
  const watching = watchLeadPins(db, apify, { send: m.send, now: () => FIVE_AM });
  await drain();
  assert.deepEqual(
    apify.asked,
    leadPins().map((p) => p.buildId),
    "every build is asked before any answers",
  );
  apify.answer("laWvC2kq0M7jC95UN");
  await drain();
  assert.equal(apify.asked.at(-1), MAPS, "the gone pin's latest is asked while the other builds are still out");
  for (const key of ["UJAtg4JwDdgEVD6iI", "uw7qJdrXWOwYh9MUK", MAPS, CHECKER]) {
    apify.answer(key);
    await drain();
  }
  assert.equal(await watching, 2);
  assert.deepEqual(
    m.sent.map((s) => s.subject),
    [
      `[Chanlytics] A lead source's pinned build is gone: ${MAPS}`,
      `[Chanlytics] A lead source's pinned build is gone: ${CHECKER}`,
    ],
    "the pages go out in the pins' order, each naming its own latest",
  );
  assert.match(m.sent[0].body, /Probe the latest build, 0\.14\.799,/);
  assert.match(m.sent[1].body, /Probe the latest build, 0\.1\.18,/);
});

test("Health says both pages in words, the actor after the colon", () => {
  assert.equal(pageKeyWords(`lead_source_refused:${MAPS}`), `A lead source refusing to start: ${MAPS}`);
  assert.equal(pageKeyWords(`lead_contacts_unread:${MAPS}`), `A lead source reading no websites: ${MAPS}`);
  assert.equal(
    pageKeyWords("lead_source_pin:bounceverify/bounceverify-email-verifier"),
    "A lead source's pinned build gone: bounceverify/bounceverify-email-verifier",
  );
});

/** The pager's memory beside the platform's day counter for one UTC day, as the read asks for it. */
function platformDay(day, counter) {
  const pager = pagerMemory();
  return {
    rows: pager.rows,
    from(table) {
      if (table !== "lead_counters") return pager.from(table);
      const asked = {};
      const q = {
        select: () => q,
        is: (c, v) => ((asked[c] = v), q),
        eq: (c, v) => ((asked[c] = v), q),
        maybeSingle: async () => {
          assert.deepEqual(asked, { tenant_id: null, kind: "day", period: day }, "the platform's own day row");
          return { data: counter, error: null };
        },
      };
      return q;
    },
  };
}

test("every workspace's searching at 80% of the platform's day pages once that day, and under it says nothing (decision 0133)", async () => {
  const day = "2026-10-24";
  const quiet = platformDay(day, { used: "60.0000", reserved: "59.9900" });
  const m = mailbox();
  assert.equal(
    await recordPagePlatformDay(quiet, FIVE_AM, { send: m.send, now: () => FIVE_AM }),
    false,
    "119.99 of 150",
  );
  assert.equal(m.sent.length, 0);
  const near = platformDay(day, { used: "100.0000", reserved: "20.0000" });
  assert.equal(await recordPagePlatformDay(near, FIVE_AM, { send: m.send, now: () => FIVE_AM }), true, "120 of 150");
  await recordPagePlatformDay(near, FIVE_AM + 60_000, { send: m.send, now: () => FIVE_AM + 60_000 });
  assert.equal(m.sent.length, 1, "once that day: the second is counted, not mailed again");
  assert.equal(near.rows.get(`lead_platform_day:${day}`).count, 2);
  assert.match(m.sent[0].subject, /Lead searching is near today's cap: \$120\.00 of \$150$/);
  assert.match(m.sent[0].body, /raise platform_day_usd in lead_cap and LEAD_PLATFORM_DAY_CAP_USD together/);
  const none = platformDay(day, null);
  assert.equal(
    await recordPagePlatformDay(none, FIVE_AM, { send: m.send, now: () => FIVE_AM }),
    false,
    "no search reserved today",
  );
});
