/**
 * An automatic out-of-office pauses a chain (Reach out Part 5, PR 4; G8, N1): the lead's facts say `away` until the day
 * the reply names (00226), and the one mapping the send door and the step both ask refuses them `outreach_away`, after
 * every refusal that ends the chain. It is no wait: the send is skipped, and the step takes the lead back after the day
 * (00226's followers pass over that skip). The database's side is reply-away.db.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  outreachRefusalOf,
  isWaitRefusal,
  DELIVERY_REFUSALS,
  PURPOSE_REFUSALS,
  HELD_REASONS,
} from "@chanlytics/contracts";
import { outreachFactsOf } from "../../../../packages/db/src/repositories/outreach.ts";

const facts = (over = {}) => ({ leadStage: "ready", suppressed: false, wroteBack: false, away: false, ...over });

test("away is refused outreach_away, after every refusal that ends the chain", () => {
  assert.equal(outreachRefusalOf(facts({ away: true })), "outreach_away");
  assert.equal(outreachRefusalOf(facts({ leadStage: "nurture", away: true })), "outreach_away");
  assert.equal(outreachRefusalOf(facts({ away: true, wroteBack: true })), "outreach_wrote_back");
  assert.equal(outreachRefusalOf(facts({ away: true, suppressed: true })), "outreach_suppressed");
  assert.equal(outreachRefusalOf(facts({ away: true, leadStage: "said_no" })), "outreach_lead_closed");
  assert.equal(outreachRefusalOf(facts({ away: true, leadStage: null })), "outreach_not_a_lead");
  assert.equal(outreachRefusalOf(facts()), null);
  assert.ok(
    DELIVERY_REFUSALS.indexOf("outreach_away") === DELIVERY_REFUSALS.indexOf("outreach_wrote_back") + 1,
    "listed after wrote back, in the door's order",
  );
});

test("it is no wait: the send is skipped, never planned again in place (the step takes the lead back)", () => {
  assert.equal(isWaitRefusal("outreach_away"), false);
});

test("its words, in a thread and on a run's line", () => {
  assert.equal(
    PURPOSE_REFUSALS.outreach_away,
    "Away: their automatic reply says they're out. This email waits, and goes to them after the day they're back.",
  );
  assert.equal(HELD_REASONS.outreach_away, "away until the day they're back");
});

/** A database that answers outreach_facts with these facts. */
const answering = (data) => ({
  rpc: async (name) => {
    assert.equal(name, "outreach_facts");
    return { data, error: null };
  },
});
const ask = (db) =>
  outreachFactsOf(db, { tenantId: "t1", contactId: "c1", to: "office@example.com", host: "", since: "2026-09-01" });

test("the facts read away as the database says it, and a database before 00226 as not away", async () => {
  const base = { lead_stage: "ready", suppressed: false, wrote_back: false, domain: null, sent_since: 0 };
  assert.equal((await ask(answering({ ...base, away: true }))).away, true);
  assert.equal((await ask(answering({ ...base, away: false }))).away, false);
  assert.equal((await ask(answering(base))).away, false, "absent: not away, as before this part");
  assert.equal((await ask(answering({ ...base, away: "yes" }))).away, false, "only true is away");
});
