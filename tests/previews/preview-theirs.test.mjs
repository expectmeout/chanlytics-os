/**
 * What a business makes of its own preview before it signs up (decision 0079; the canvas's calls P4 and P5):
 *
 *   it teaches it     up to three things, each kept as a note of the preview's own record, where everything AI says is
 *                     composed from (and where a price the business itself gave may be said)
 *   it puts it right  a fact it says is not right, with what is right: the listing's is let go and theirs is told
 *   the sender        still gets each as a line on the lead's sheet
 *
 * The rules are contracts' (previews/theirs.ts), pure; the two public doors are the dashboard's
 * (server/previews/doors.ts), run here over a database in memory. Made-up businesses only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PREVIEW_TAUGHT,
  previewAnswerUsesTaught,
  previewFactOf,
  previewKnowsOf,
  previewSaidOf,
  previewTheirsOf,
  withPreviewFix,
  withPreviewTaught,
} from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { importSrc } from "../_source.mjs";

const PROFILE = {
  address: "12 Main St, Austin, TX 78701",
  hours: { mon: { open: "08:00", close: "18:00" } },
  website: "https://harbormovers.example",
  services: [{ name: "Local moves" }, { name: "Packing" }],
};

test("a thing it is taught is a note of its record, three at most, and never an empty or an endless one", () => {
  const once = withPreviewTaught(PROFILE, "  We answer emergency calls all night.  ");
  assert.deepEqual(once.notes, [{ title: PREVIEW_TAUGHT.title, text: "We answer emergency calls all night." }]);
  assert.equal(once.address, PROFILE.address, "nothing else of the record moves");
  const thrice = withPreviewTaught(withPreviewTaught(once, "Two"), "Three");
  assert.equal(thrice.notes.length, 3);
  assert.equal(withPreviewTaught(thrice, "Four"), "full", "a fourth is refused");
  assert.equal(withPreviewTaught(PROFILE, "   "), null);
  assert.equal(withPreviewTaught(PROFILE, "x".repeat(PREVIEW_TAUGHT.chars + 1)), null);
  // A record whose notes are full already (its own ten) has no room either.
  const ten = { ...PROFILE, notes: Array.from({ length: 10 }, (_, n) => ({ title: `Note ${n}`, text: "kept" })) };
  assert.equal(withPreviewTaught(ten, "One more"), "full");
});

test("a fact put right: the listing's is let go, theirs is told, and a second fix of the same fact replaces the first", () => {
  const hours = withPreviewFix(PROFILE, "hours", "Saturday we close at 1");
  assert.equal(hours.hours, undefined, "the grid the listing gave is no longer said");
  assert.deepEqual(previewTheirsOf(hours).fixed, { hours: "Saturday we close at 1" });
  const again = withPreviewFix(hours, "hours", "Closed Saturdays");
  assert.deepEqual(previewTheirsOf(again).fixed, { hours: "Closed Saturdays" });
  assert.equal(again.notes.length, 1, "one note a fact, never a pile of them");
  const address = withPreviewFix(PROFILE, "address", "40 Oak Ave, Austin");
  assert.equal(address.address, undefined);
  assert.equal(previewTheirsOf(address).fixed.address, "40 Oak Ave, Austin");
  // Its services are a list no sentence replaces: the list stays, and what they said is told beside it.
  const services = withPreviewFix(PROFILE, "services", "We no longer do packing");
  assert.equal(services.services.length, 2);
  assert.equal(previewTheirsOf(services).fixed.services, "We no longer do packing");
  assert.equal(withPreviewFix(PROFILE, "hours", "  "), null, "nothing said is nothing to put right");
});

test("a fact is named by its key or by its row's label, and anything else is none", () => {
  assert.equal(previewFactOf("Hours"), "hours");
  assert.equal(previewFactOf("address"), "address");
  assert.equal(previewFactOf("Prices"), null);
});

test("what it knows says theirs where they put it right, and what they told it", () => {
  const theirs = withPreviewTaught(withPreviewFix(PROFILE, "hours", "Saturday we close at 1"), "We answer all night.");
  const rows = previewKnowsOf(theirs, null);
  const hours = rows.find((row) => row.key === "hours");
  assert.deepEqual([hours.value, hours.from], ["Saturday we close at 1", "From you"]);
  assert.equal(rows.find((row) => row.key === "address").from, "From Google", "what they left alone is the listing's");
  assert.deepEqual(previewTheirsOf(theirs).taught, ["We answer all night."]);
});

test("an answer is said to say a thing they told it only where it carries its figure or a run of its words", () => {
  const taught = ["A new water heater starts at $1,450, tank and labor.", "We don't do gas line work at all."];
  // Its figure, however it is written.
  assert.equal(previewAnswerUsesTaught("A new one starts at $1,450, installed.", taught), true);
  assert.equal(previewAnswerUsesTaught("It starts at 1450 dollars.", taught), true);
  // A run of its own words, whatever the case and the punctuation.
  assert.equal(previewAnswerUsesTaught("Sorry, we don't do gas line work.", taught), true);
  // An answer the record would have given anyway is never credited to them.
  assert.equal(previewAnswerUsesTaught("Yes, that's one of our services. Want a call back?", taught), false);
  assert.equal(previewAnswerUsesTaught("We do gas ranges and water heaters.", taught), false);
  // A single digit is no figure, and nothing told credits nothing.
  assert.equal(previewAnswerUsesTaught("We have 2 trucks.", ["We run 2 crews."]), false);
  assert.equal(previewAnswerUsesTaught("A new one starts at $1,450.", []), false);
});

test("the sender's line says what they told it apart from what they said is not right", () => {
  assert.deepEqual(
    previewSaidOf([
      { fact: "Hours", said: "Saturday we close at 1", at: "x" },
      { fact: PREVIEW_TAUGHT.fact, said: "We answer all night.", at: "x" },
    ]),
    ["Says the hours aren't right: “Saturday we close at 1”", "Told it: “We answer all night.”"],
  );
});

/* ---- the two public doors, over a database in memory ---- */

const { recordPreviewNotRightBy, tellPreviewBy } = await importSrc("apps/dashboard/src/server/previews/doors.ts");
const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/shared/rate-limit.ts");
const { setLinkPageClient } = await importSrc("apps/dashboard/src/server/public/link-page.ts");

const TOKEN = "TokenTokenTokenToken01";
const OURS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function world(over = {}) {
  const tables = {
    lead_previews: [
      {
        id: "p1",
        tenant_id: OURS,
        lead_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        preview_tenant_id: WS,
        state: "ready",
        token: TOKEN,
        ends_at: new Date(Date.now() + 20 * 86_400_000).toISOString(),
        asked_count: 0,
        call_count: 0,
        call_seconds: 0,
        turns: [],
        not_right: [],
        ...over,
      },
    ],
    tenant_config: [
      {
        tenant_id: WS,
        config: {
          brain: {
            business_name: "Harbor Movers",
            system_prompt: "You answer customers for Harbor Movers, a made-up moving company in Austin.",
            fallbacks: {
              greeting: "Hi! Someone will be with you shortly.",
              error: "Sorry, something went wrong on our side.",
              non_text: "Thanks, a person will look at this.",
            },
            profile: PROFILE,
          },
        },
        version: 1,
        updated_at: "2026-11-15T12:00:00Z",
        updated_by: null,
      },
    ],
  };
  const db = fakeDb(
    tables,
    {},
    {
      preview_not_right: (a) => {
        const row = tables.lead_previews.find((r) => r.id === a.p_id);
        row.not_right = [...row.not_right, { fact: a.p_fact, ...(a.p_said ? { said: a.p_said } : {}), at: "now" }];
        return row.not_right.length;
      },
    },
  );
  setRateStore(memoryStore());
  setLinkPageClient(db);
  const profile = () => tables.tenant_config[0].config.brain.profile;
  return { tables, profile };
}

test("the teach door: what they told it is in its record at once, the sender gets the line, and a fourth is refused", async () => {
  const w = world();
  assert.deepEqual(await tellPreviewBy(TOKEN, "We answer emergency calls all night."), { taught: 1, left: 2 });
  assert.deepEqual(w.profile().notes, [{ title: PREVIEW_TAUGHT.title, text: "We answer emergency calls all night." }]);
  assert.equal(w.tables.tenant_config[0].version, 2, "through the settings' compare-and-swap");
  assert.deepEqual(
    w.tables.lead_previews[0].not_right.map((line) => [line.fact, line.said]),
    [[PREVIEW_TAUGHT.fact, "We answer emergency calls all night."]],
  );
  await tellPreviewBy(TOKEN, "Two");
  await tellPreviewBy(TOKEN, "Three");
  await assert.rejects(tellPreviewBy(TOKEN, "Four"), (e) => e.status === 409);
  assert.equal(w.profile().notes.length, 3);
  await assert.rejects(tellPreviewBy(TOKEN, "   "), (e) => e.status === 400);
});

test("the not-right door puts it right where they say what is right, and only notes it where they do not", async () => {
  const w = world();
  assert.deepEqual(await recordPreviewNotRightBy(TOKEN, "Hours", "Saturday we close at 1"), { kept: 1, fixed: true });
  assert.equal(w.profile().hours, undefined);
  assert.equal(previewTheirsOf(w.profile()).fixed.hours, "Saturday we close at 1");
  // No right value given: the sender is told, and its record is as it was.
  const before = JSON.stringify(w.profile());
  assert.deepEqual(await recordPreviewNotRightBy(TOKEN, "Address", ""), { kept: 2, fixed: false });
  assert.equal(JSON.stringify(w.profile()), before);
  // A thing that is no fact of the page is kept for the sender and changes nothing.
  assert.deepEqual(await recordPreviewNotRightBy(TOKEN, "Prices", "We charge by the hour"), { kept: 3, fixed: false });
});

test("a preview that has ended, or is someone's own, takes neither", async () => {
  world({ state: "claimed" });
  await assert.rejects(tellPreviewBy(TOKEN, "Anything"), (e) => e.status === 409);
  world({ ends_at: "2026-01-01T00:00:00Z" });
  await assert.rejects(recordPreviewNotRightBy(TOKEN, "Hours", "Closed"), (e) => e.status === 409);
});
