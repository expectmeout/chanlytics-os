/**
 * The proposal follow-up's facts stop on the number or on Meta's approval exactly as its run does (One message, every
 * channel, step 3): by the channels the playbook ticks. The run (core run-playbook) asks contracts' playbookStopBy, and so
 * does the dashboard's followUpFacts (what People and Today say of the follow-up), so the page never promises a run that
 * stops, and never says nothing of one that goes. Before, the facts passed no `byOthers`: a follow-up that also went by
 * email or text was read as stopped by a WhatsApp template Meta had not approved, though its run went on for them.
 *
 * A message needs no WhatsApp row (lane 1): the facts read the message's rows once (db messageVersionRowsOf, contracts
 * campaignMessageOf), so a follow-up on a message that has only an email or a text version has its facts, its purpose is
 * the message's, and a workspace with no number reads as the edge's run reads it: numberHealth of nothing, which can send.
 *
 * Executed: the real followUpFacts over a database in memory, and the one helper the run asks, over every cell of its table.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { numberHealth, playbookRunStop, playbookStopBy } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { followUpFacts } = await import(at("apps/dashboard/src/server/campaigns/playbooks.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = new Date("2026-10-03T16:00:00.000Z");
const DAY = 86_400_000;

/** A row of the follow-up's message on a channel: WhatsApp's as Meta has it, or an email's or a text's, written here and approved. */
const version = (channel, over = {}) => ({
  id: `tpl-${channel}`,
  tenant_id: A,
  channel,
  name: "proposal_follow_up",
  language: "en_US",
  meta_status: "approved",
  category: null,
  variables: [],
  hidden_at: null,
  title: null,
  source: channel === "whatsapp" ? "meta" : "chanlytics",
  components: [],
  body_preview: null,
  rejected_reason: null,
  ...over,
});

/**
 * A workspace whose proposal follow-up runs (its class asks, a proposal is out), going by `channels` (none named: the
 * column the database before 00298 has not got, WhatsApp alone), its WhatsApp template at `status` with Meta, and a number
 * connected (`true`, or `"flagged"`: its quality RED) or not. `templates` are the message's rows where the test names them.
 */
const world = ({ channels, status = "approved", number = true, templates } = {}) => ({
  playbooks: [
    {
      id: "pb1",
      tenant_id: A,
      trigger: "proposal_waiting",
      state: "running",
      run_hour: 10,
      last_run_for: null,
      template_name: "proposal_follow_up",
      template_language: "en_US",
      ...(channels ? { channels } : {}),
    },
  ],
  policies: [{ tenant_id: A, class: "follow_up", subject_type: null, subject_id: null, mode: "ask" }],
  tenants: [{ id: A, status: "active", timezone: "UTC" }],
  tenant_channels: number
    ? [
        {
          tenant_id: A,
          kind: "whatsapp",
          status: "active",
          config: { quality_rating: number === "flagged" ? "RED" : "GREEN" },
        },
      ]
    : [],
  deals: [
    { id: "d1", tenant_id: A, contact_id: P, stage: "proposed", proposed_at: new Date(NOW - 10 * DAY).toISOString() },
  ],
  templates: templates ?? [version("whatsapp", { meta_status: status, category: "utility" })],
  broadcasts: [],
  broadcast_recipients: [],
});
const factsOf = (over) => followUpFacts({ supabase: fakeDb(world(over)) }, A, NOW);

test("a follow-up that goes by WhatsApp alone is stopped by a template Meta has not approved: no facts, as its run would send nothing", async () => {
  assert.equal(await factsOf({ channels: ["whatsapp"], status: "pending" }), null, "ticked WhatsApp alone");
  assert.equal(
    await factsOf({ status: "pending" }),
    null,
    "no channels kept (a database before 00298): WhatsApp alone",
  );
  assert.equal(await factsOf({ channels: ["whatsapp"], status: "rejected" }), null);
  // The same follow-up with its template approved has its facts: who had a follow-up, who waits.
  const approved = await factsOf({ channels: ["whatsapp"], status: "approved" });
  assert.deepEqual([approved.run_hour, approved.asks, approved.purpose], [10, true, "conversational"]);
});

test("a follow-up that also goes by email or text is NOT stopped by a WhatsApp template Meta has not approved: its run goes on for them", async () => {
  for (const channels of [
    ["whatsapp", "email"],
    ["whatsapp", "sms"],
    ["whatsapp", "sms", "email"],
  ]) {
    const facts = await factsOf({ channels, status: "pending" });
    assert.notEqual(facts, null, channels.join("+"));
    assert.deepEqual(facts.channels, channels, "and the facts say which channels it goes by");
  }
  // The number's health still stops the whole run, as it does in core: a number WhatsApp flagged cannot send.
  assert.equal(await factsOf({ channels: ["whatsapp", "email"], status: "approved", number: "flagged" }), null);
});

test("a workspace with no number reads as the edge's run reads it, a number that cannot be flagged: a follow-up that also goes by email is promised, not stopped for want of a number", async () => {
  // The edge's run builds the health from whatever the number's config says, and an absent number says nothing:
  // numberHealth of nothing is a number that can send (the run then holds WhatsApp's people for want of one, channelsReady).
  assert.equal(numberHealth({ quality: null, event: null, limit: null }).canSend, true);
  for (const channels of [
    ["whatsapp", "email"],
    ["whatsapp", "sms"],
    ["whatsapp", "sms", "email"],
  ])
    for (const status of ["approved", "pending"]) {
      const facts = await factsOf({ channels, status, number: false });
      assert.notEqual(facts, null, `${channels.join("+")} ${status}`);
      assert.deepEqual(facts.channels, channels);
      assert.equal(
        facts.purpose,
        "conversational",
        "and the purpose is the message's, Meta's word for its WhatsApp row",
      );
    }
  // The purpose follows the row's category, not a default: Meta filed this one as an offer.
  const offer = await factsOf({
    channels: ["whatsapp", "email"],
    number: false,
    templates: [version("whatsapp", { category: "marketing" })],
  });
  assert.equal(offer.purpose, "marketing");
});

test("a follow-up whose message has no WhatsApp row has its facts when it ticks anything else, with the message's own purpose: its own rows' category, the strictest, none an offer", async () => {
  const own = (category, channels = ["email"]) => channels.map((channel) => version(channel, { category }));
  // A message about their proposal: an email and a text filed utility. No number, no WhatsApp row, and the facts are there.
  for (const channels of [["email"], ["sms"], ["email", "sms"], ["whatsapp", "email"]]) {
    const facts = await factsOf({ channels, number: false, templates: own("utility", ["email", "sms"]) });
    assert.notEqual(facts, null, channels.join("+"));
    assert.equal(facts.purpose, "conversational", "the rows' category is the message's");
  }
  // An offer's rows, or a row that names none, are an offer, as the send reads them.
  assert.equal((await factsOf({ channels: ["email"], templates: own("marketing") })).purpose, "marketing");
  assert.equal((await factsOf({ channels: ["email"], templates: own(null) })).purpose, "marketing");
  // The strictest of the rows': one that reads as an offer makes it one.
  const mixed = [version("email", { category: "utility" }), version("sms", { category: "marketing" })];
  assert.equal((await factsOf({ channels: ["email", "sms"], templates: mixed })).purpose, "marketing");
  // Meta's word, where there is a WhatsApp row, wins over the own rows' (and stands whatever its status).
  const meta = [
    version("whatsapp", { meta_status: "pending", category: "utility" }),
    version("email", { category: "marketing" }),
  ];
  assert.equal((await factsOf({ channels: ["whatsapp", "email"], templates: meta })).purpose, "conversational");
  // WhatsApp is all it goes by, and the message has no WhatsApp version to send: stopped, as a withdrawn one is.
  assert.equal(await factsOf({ channels: ["whatsapp"], templates: own("utility") }), null);
  assert.equal(await factsOf({ templates: own("utility") }), null, "no channels kept: WhatsApp alone");
  // A message that is gone (no row of any channel): a follow-up that goes by email has its facts and an offer's purpose,
  // as a missing WhatsApp row always read.
  const gone = await factsOf({ channels: ["email"], templates: [] });
  assert.deepEqual([gone === null, gone?.purpose], [false, "marketing"]);
  assert.equal(await factsOf({ channels: ["whatsapp"], templates: [] }), null);
  // Another message's rows, or another language's, are not this one's.
  const elsewhere = [
    version("email", { category: "utility", name: "another_message" }),
    version("email", { category: "utility", language: "es_ES" }),
  ];
  assert.equal((await factsOf({ channels: ["email"], templates: elsewhere })).purpose, "marketing");
});

test("a follow-up that goes by email or text alone is stopped by neither the number nor Meta: it never asks them", async () => {
  for (const channels of [["email"], ["sms"], ["email", "sms"]]) {
    for (const status of ["pending", "approved", null])
      assert.notEqual(await factsOf({ channels, status, number: false }), null, `${channels.join("+")} ${status}`);
  }
});

test("playbookStopBy is the run's one reading of its ticks: the number stops it only where WhatsApp is ticked, Meta's approval only where WhatsApp is all it goes by", () => {
  const stop = (channels, templateStatus, numberCanSend) => playbookStopBy({ channels, templateStatus, numberCanSend });
  // WhatsApp alone: the template and the number each stop it.
  assert.equal(stop(["whatsapp"], "approved", true), null);
  assert.equal(stop(["whatsapp"], "pending", true), "template_not_approved");
  assert.equal(stop(["whatsapp"], null, true), "template_not_approved", "a template nobody has is not approved");
  assert.equal(stop(["whatsapp"], "approved", false), "number_flagged");
  // WhatsApp and others: the template no longer stops the run (its WhatsApp people are held), the number still does.
  assert.equal(stop(["whatsapp", "email"], "pending", true), null);
  assert.equal(stop(["whatsapp", "sms"], null, true), null);
  assert.equal(stop(["whatsapp", "email"], "approved", false), "number_flagged");
  // Others alone: nothing about WhatsApp stops it, and a message with no WhatsApp version at all (status null) stops nothing here.
  assert.equal(stop(["email"], "pending", false), null);
  assert.equal(stop(["sms"], null, false), null);
  assert.equal(stop(["email"], null, true), null);
  assert.equal(stop(["email", "sms"], null, true), null);
  // The number the edge gives a workspace with none (numberHealth of nothing) can send: a run that ticks WhatsApp and email
  // is not stopped by it, and a message with no WhatsApp version does not stop it either.
  const noNumber = numberHealth({ quality: null, event: null, limit: null }).canSend;
  assert.equal(stop(["whatsapp", "email"], null, noNumber), null);
  assert.equal(stop(["whatsapp", "email"], "pending", noNumber), null);
  assert.equal(stop(["whatsapp"], null, noNumber), "template_not_approved", "WhatsApp alone, with no WhatsApp version");
  // And it is playbookRunStop with the ticks read out, never a second rule.
  for (const channels of [["whatsapp"], ["whatsapp", "email"], ["email"], ["sms", "email"]])
    for (const templateStatus of ["approved", "pending", null])
      for (const numberCanSend of [true, false])
        assert.equal(
          stop(channels, templateStatus, numberCanSend),
          playbookRunStop({
            templateStatus,
            canSend: !channels.includes("whatsapp") || numberCanSend,
            byOthers: channels.some((c) => c !== "whatsapp"),
          }),
          `${channels.join("+")} ${templateStatus} ${numberCanSend}`,
        );
});
