/**
 * The veto window's wait, said from the wait itself. A batch under veto is scheduled PLAYBOOK_VETO_DELAY_MS ahead, and
 * the sentences that promise that wait are run here: How it runs' choice and what it does (decision 0064, where a
 * sequence's mode is set; the Autonomy rows say only how a new sequence starts), two on the reach-out sheet, and three of
 * Ask's (a definition, the playbooks read, a playbook's card). Each typed "30 minutes" or "thirty minutes" by hand once,
 * so a change to the wait would have left every one of them promising the old one. Each must say the words delayWords
 * derives from the constant, and no other length of time.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import {
  PLAYBOOK_VETO_DELAY_MS,
  PLAYBOOK_VETO_DELAY_WORDS,
  REACH_OUT_SHEET_WORDS,
  SEQUENCE_MODE_WORDS,
  delayWords,
  startWords,
  HOUR_MS,
  MIN_MS,
} from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { ASK_DEFINITIONS } = await import(at("apps/dashboard/src/server/ask/prompt.ts"));
const { runTool, newToolContext, buildProposal } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));

/**
 * Says the veto's wait in the derived words, and no other length of time: each wait it names is that one (a sentence
 * may name it twice, as Ask's definition does for veto and for a new campaign's trial, which waits as veto's runs do).
 */
function saysTheWait(sentence, where) {
  assert.ok(sentence.includes(PLAYBOOK_VETO_DELAY_WORDS), `${where} says ${PLAYBOOK_VETO_DELAY_WORDS}: ${sentence}`);
  const lengths = sentence.match(/\b(\d+|an?|thirty|one|two|half an) (minutes?|hours?)\b/gi) ?? [];
  assert.deepEqual(
    lengths.filter((l) => l !== PLAYBOOK_VETO_DELAY_WORDS),
    [],
    `${where} says no other wait: ${sentence}`,
  );
}

test("the wait in words: whole minutes, or whole hours once it is one", () => {
  assert.equal(delayWords(30 * MIN_MS), "30 minutes");
  assert.equal(delayWords(MIN_MS), "1 minute");
  assert.equal(delayWords(45 * MIN_MS), "45 minutes");
  assert.equal(delayWords(HOUR_MS), "an hour");
  assert.equal(delayWords(90 * MIN_MS), "90 minutes");
  assert.equal(delayWords(2 * HOUR_MS), "2 hours");
  assert.equal(PLAYBOOK_VETO_DELAY_WORDS, delayWords(PLAYBOOK_VETO_DELAY_MS), "the veto's words are its wait's");
  assert.equal(PLAYBOOK_VETO_DELAY_WORDS, "30 minutes");
});

test("How it runs promises the wait a batch under veto is given, as its choice and as what it does", () => {
  saysTheWait(SEQUENCE_MODE_WORDS.veto.choice, "How it runs' choice");
  saysTheWait(SEQUENCE_MODE_WORDS.veto.does, "what a batch does under it");
});

test("the reach-out sheet promises it, before Start and after", () => {
  saysTheWait(REACH_OUT_SHEET_WORDS.first, "the sheet's first-run line");
  saysTheWait(startWords({ outcome: "sent", reason: null, planned: 3, run_id: null }).text, "Start's answer");
});

test("Ask defines a playbook with the same wait", () => {
  saysTheWait(ASK_DEFINITIONS.playbook, "Ask's definition of a playbook");
});

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TPL = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const TZ = "America/New_York";
const NOW = new Date("2026-09-14T14:00:00Z");

/** Harbor, whose new re-engage and offers sequences start under veto, with one approved template. */
function world() {
  return {
    memberships: [
      { user_id: "u1", tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
    ],
    tenants: [{ id: A, name: "Harbor", timezone: TZ }],
    tenant_config: [],
    // A number that can send: a campaign no channel of its own can carry is no card (the 30 Oct 2026 review, item 6), and
    // this one's words are the case.
    tenant_channels: [
      {
        tenant_id: A,
        kind: "whatsapp",
        status: "active",
        number_e164: "+442079460100",
        config: { quality_rating: "GREEN", messaging_limit: "TIER_1K" },
      },
    ],
    policies: ["reengage", "campaign"].map((cls, i) => ({
      id: `pol-${i}`,
      tenant_id: A,
      class: cls,
      mode: "veto",
      subject_type: null,
      subject_id: null,
      limits: {},
      updated_at: "2026-09-01T00:00:00Z",
    })),
    conversations: [],
    escalations: [],
    messages: [],
    calls: [],
    contacts: [],
    templates: [
      {
        id: TPL,
        tenant_id: A,
        channel: "whatsapp",
        name: "open_saturday",
        language: "en",
        meta_status: "approved",
        category: "MARKETING",
        variables: [],
        body_preview: "We are open Saturday 9 to 5.",
        hidden_at: null,
      },
    ],
    segments: [],
    segment_members: [],
    playbooks: [],
  };
}
const RPCS = {
  people_list: () => [],
  lead_list_counts: () => ({ all: 0, ready: 0, nurture: 0, converted: 0, said_no: 0, not_a_fit: 0 }),
};
const toolContext = () => {
  readerCache.clear();
  const t = world();
  return newToolContext(
    { supabase: fakeDb(t, {}, RPCS), userId: "u1", email: "ada@example.com", params: {} },
    A,
    "owner",
    TZ,
    NOW,
  );
};

test("Ask's playbooks read tells the model what veto does in the same words", async () => {
  const out = await runTool(toolContext(), { name: "sequences", input: { action: "moments" } });
  assert.equal(out.isError, false, out.result);
  const read = JSON.parse(out.result);
  assert.equal(read.new_sequences_start_as.reengage, "veto");
  saysTheWait(read.mode_words.veto, "the playbooks read's veto words");
});

test("a playbook Ask proposes under veto says the same wait on its card", async () => {
  const card = await buildProposal(toolContext(), "propose_sequence", {
    action: "moment",
    trigger: "quiet_30",
    template_id: TPL,
    params: [],
  });
  assert.equal(card.isError, false, card.result);
  // Its first batch waits for an OK (decision 0064); after that, each batch waits the veto's wait.
  const [, afterThat] = card.proposal.summary.split("after that, ");
  assert.ok(afterThat, card.proposal.summary);
  saysTheWait(afterThat.split(". Says:")[0], "the card's veto words");
});
