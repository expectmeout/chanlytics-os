/**
 * A search that stops to ask tells the workspace by email (apps/edge/lib/leads/lead-tell.ts).
 *
 * The bell's row is lead_rounds_notify's, written in the same transaction as the question; the question waits a
 * day and then ends, and an owner who is not looking at the page never heard of it. The runner calls the tell once
 * the question is committed. These run the real module over a database in memory with the transport handed in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { tellLeadQuestion } from "../../../../apps/edge/lib/leads/lead-tell.ts";

const T = "11111111-1111-4111-8111-111111111111";
const R = "22222222-2222-4222-8222-222222222222";
const S = "a516a5a6-ecb5-4ad1-96bf-56a65afceac8";
const SENTENCE = "Some of the first 16 are large studio chains, which I'm leaving out. Is that what you meant?";
/** The rows as they are kept: the question in core's RoundQuestion shape, the workspace by its slug. */
const tables = (config, state = "waiting_on_owner") => ({
  lead_rounds: [
    {
      id: R,
      tenant_id: T,
      search_id: S,
      state,
      question: {
        sentence: SENTENCE,
        criterionKey: "large_studio_chains",
        dropTerm: null,
        asked_at: "2026-09-24T04:30:11Z",
      },
    },
  ],
  lead_searches: [{ id: S, tenant_id: T, name: "wedding photographers" }],
  tenants: [{ id: T, slug: "harbor-studio" }],
  tenant_config: config ? [{ tenant_id: T, config }] : [],
  tenant_channels: [],
});
const mailbox = () => {
  const sent = [];
  return { sent, send: async (from, to, subject, text) => (sent.push({ from, to, subject, text }), true) };
};
const OWN = { notifications: { escalation_emails: ["owner@example.com"], from: "Harbor alerts <alerts@example.com>" } };

test("a search that stops to ask mails the workspace's own addresses: the question, what waiting means, and the way back to the left-out pile", async () => {
  const m = mailbox();
  assert.equal(await tellLeadQuestion(fakeDb(tables(OWN)), R, { send: m.send }), true);
  assert.equal(m.sent.length, 1);
  assert.deepEqual([m.sent[0].from, m.sent[0].to], ["Harbor alerts <alerts@example.com>", ["owner@example.com"]]);
  assert.equal(m.sent[0].subject, "Your search for wedding photographers is waiting for your answer");
  assert.equal(
    m.sent[0].text,
    [
      SENTENCE,
      "",
      "Nothing is spent while this waits. With no answer in a day, it stops and keeps what it found.",
      "",
      `Answer it: https://app.chanlytics.com/w/harbor-studio#/clients/leads:s-${S}:c-excluded`,
    ].join("\n"),
  );
});

test("a workspace with nowhere to send is not mailed, and the platform is not told about its question", async () => {
  const m = mailbox();
  assert.equal(await tellLeadQuestion(fakeDb(tables(null)), R, { send: m.send }), false);
  assert.deepEqual(m.sent, [], "a question is nothing the platform acts on, so no redacted notice either");
});

test("a round that is no longer asking sends nothing, and a round that is not there throws nothing", async () => {
  const m = mailbox();
  assert.equal(await tellLeadQuestion(fakeDb(tables(OWN, "running")), R, { send: m.send }), false);
  assert.equal(
    await tellLeadQuestion(fakeDb(tables(OWN)), "33333333-3333-4333-8333-333333333333", { send: m.send }),
    false,
  );
  assert.deepEqual(m.sent, []);
});

test("a round names its own workspace's search: another workspace's search of the same id is not read for the mail's name", async () => {
  const m = mailbox();
  const t = tables(OWN);
  // The round's search_id points at a row of another workspace: the mail says what it can and never that row's name.
  t.lead_searches = [
    { id: S, tenant_id: "99999999-9999-4999-8999-999999999999", name: "another workspace's private search" },
  ];
  assert.equal(await tellLeadQuestion(fakeDb(t), R, { send: m.send }), true);
  assert.equal(m.sent[0].subject, "Your search for leads is waiting for your answer");
  assert.ok(!m.sent[0].text.includes("private"), "another workspace's words never reach this one's mail");
});
