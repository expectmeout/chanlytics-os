/**
 * A reach-out's email written in place (One message, every channel, step 5), through the version route the Templates page
 * saves every email and text version by: `POST templates/versions` with the email's name, which says its step. The real
 * route modules, their `run` called with a database in memory and the service role's save through a double of its own
 * (reach_out_save, 00211/00228: proved on Postgres in reach-out-sheet-doors.db.test.mjs).
 *
 * What is proved is that the one door keeps what the sheet's save keeps: the member's role is the route's, every word is
 * checked by the one email check over the reach-out's rules before the door is asked, the chain is saved WHOLE with only
 * this step's words changed (so the database's guarantees, that new words send what waits for the step back to the check,
 * hold unchanged), and what the door says comes back in the person's words.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { REACH_OUT_REFUSALS, reachOutRowName, reachOutEditedWords, wordsIssueWords } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const versions = await import(at("apps/dashboard/app/api/v1/templates/versions/route.ts"));

after(() => setServiceClient(null));
beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "11111111-1111-4111-8111-111111111111";
const ROOT_ID = "22222222-2222-4222-8222-222222222222";
const STEP2 = "33333333-3333-4333-8333-333333333333";
const SEARCH = "44444444-4444-4444-8444-444444444444";
const T1 = "77777777-7777-4777-8777-777777777771";
const T2 = "77777777-7777-4777-8777-777777777772";
const FIRST = reachOutRowName(ROOT_ID);
const NUDGE = reachOutRowName(STEP2);
const inA = `?workspace=${A}`;

/** A workspace's configuration as the schema reads it, with the booking link on file or not. */
const config = (booking_link) => ({
  brain: {
    business_name: "Harbor Moving Co",
    system_prompt: "You answer for Harbor Moving Co, a family moving company, and keep each reply short.",
    fallbacks: { greeting: "Hi, this is Harbor.", error: "One moment.", non_text: "Please write to us." },
    ...(booking_link ? { booking_link } : {}),
  },
});

/** Harbor's one chain over its trainers search: the first email, a nudge four days on, a booking link on file. */
const tables = (role = "operator") => ({
  memberships: [{ user_id: USER, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" }],
  billing_accounts: [{ tenant_id: A, mode: "direct", status: "active" }],
  tenants: [{ id: A, name: "Harbor Moving Co", timezone: "America/Chicago" }],
  tenant_config: [{ tenant_id: A, config: config("https://example.com/book") }],
  policies: [{ tenant_id: A, class: "outreach", mode: "ask", subject_type: null }],
  lead_searches: [{ id: SEARCH, tenant_id: A, name: "Personal trainers · Austin" }],
  playbooks: [
    {
      id: STEP2,
      tenant_id: A,
      kind: "reach_out",
      name: "Reach out · Personal trainers · a nudge",
      state: "running",
      trigger: "after_step",
      lead_search_id: null,
      after_playbook_id: ROOT_ID,
      after_days: 4,
      gap_minutes: 12,
      domain_ids: [],
      signed_by: null,
      include_unconfirmed: false,
      template_id: T2,
      run_hour: 9,
      last_run_for: null,
      created_at: "2026-09-20T00:00:00Z",
    },
    {
      id: ROOT_ID,
      tenant_id: A,
      kind: "reach_out",
      name: "Reach out · Personal trainers",
      state: "running",
      trigger: "lead_first",
      lead_search_id: SEARCH,
      after_playbook_id: null,
      after_days: null,
      gap_minutes: 12,
      domain_ids: [],
      signed_by: "Sam",
      include_unconfirmed: false,
      template_id: T1,
      run_hour: 9,
      last_run_for: "2026-09-24",
      created_at: "2026-09-20T00:00:00Z",
    },
  ],
  templates: [
    {
      id: T1,
      tenant_id: A,
      channel: "email",
      name: FIRST,
      language: "en",
      components: [
        { type: "HEADER", format: "TEXT", text: "Quick one for {{business}}" },
        { type: "BODY", text: "{{opening}}\n\nI run Harbor.\n\n{{your name}}" },
      ],
      body_preview: "{{opening}}",
    },
    {
      id: T2,
      tenant_id: A,
      channel: "email",
      name: NUDGE,
      language: "en",
      components: [{ type: "BODY", text: "Just checking in." }],
      body_preview: "",
    },
  ],
  broadcasts: [],
  reach_out_sends: [],
  sending_domains: [],
  decisions: [],
});
const ctxFor = (t) => ({ supabase: fakeDb(t, {}, {}), userId: USER, email: "ada@example.com", params: {} });
const post = (t, body) =>
  versions.POST.run(
    new Request(`http://localhost/api/v1/x${inA}`, { method: "POST", body: JSON.stringify(body) }),
    ctxFor(t),
  );
const write = (over = {}) => ({
  name: FIRST,
  language: "en",
  channel: "email",
  subject: "A quick one for {{business}}",
  body: "{{opening}}\n\nI run {{your business}}.\n\n{{your name}}",
  ...over,
});
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.equal(e.message, words);
    return true;
  });
}

/** The service role's save, as the door answers it: what it was asked, recorded. */
function serviceSave(answer = () => ({ root_id: ROOT_ID, step_ids: [ROOT_ID, STEP2], rechecked: 0 })) {
  const asked = [];
  setServiceClient(
    fakeDb(
      {},
      {},
      {
        reach_out_save: (a) => {
          asked.push(a);
          return answer(a);
        },
      },
    ),
  );
  return asked;
}

/** The chain as the sheet would save it, unchanged but for the first step's words. */
const CHAIN = (first = {}, nudge = {}) => ({
  name: "Reach out · Personal trainers",
  search_id: SEARCH,
  include_unconfirmed: false,
  gap_minutes: 12,
  domain_ids: [],
  signed_by: "Sam",
  steps: [
    {
      id: ROOT_ID,
      subject: "Quick one for {{business}}",
      body: "{{opening}}\n\nI run Harbor.\n\n{{your name}}",
      after_days: null,
      ...first,
    },
    { id: STEP2, subject: null, body: "Just checking in.", after_days: 4, ...nudge },
  ],
  root_id: ROOT_ID,
});

test("the route says how a reach-out's email is written: the same version route, its language the reach-out's own", () => {
  // Counted as a playbook change, as the chain's own save is (PUT reach-outs/:id): the words cannot be rewritten faster from
  // Templates than from the sheet.
  assert.deepEqual(versions.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "operator",
    rate: "playbook",
    spend: false,
  });
});

test("a first email written in place: the whole chain goes to the door, saved as it stands but for this step's words, by the service role with the member's id", async () => {
  const asked = serviceSave(() => ({ root_id: ROOT_ID, step_ids: [ROOT_ID, STEP2], rechecked: 3 }));
  const out = await post(tables(), write());
  assert.equal(asked.length, 1, "one door, the chain's own");
  assert.deepEqual(asked[0], {
    p_tenant_id: A,
    p_user_id: USER,
    // An edit records no start (00360): the chain was started once, when it was first saved.
    p_decision: null,
    p_chain: CHAIN({
      subject: "A quick one for {{business}}",
      body: "{{opening}}\n\nI run {{your business}}.\n\n{{your name}}",
    }),
  });
  // Answered as a version is: the row's id, channel, name and language, and the check's warnings; plus how many sends
  // went back to the check, which the page says.
  assert.deepEqual(out, {
    template: { id: T1, channel: "email", name: FIRST, language: "en" },
    warnings: [],
    rechecked: 3,
  });
  assert.equal(
    reachOutEditedWords(out.rechecked),
    "Saved. 3 emails waiting to go are checked again against these words.",
  );
});

test("a later step is written the same way and has no subject: whatever is sent with it is not read, and the first step is untouched", async () => {
  const asked = serviceSave();
  const out = await post(
    tables(),
    write({ name: NUDGE, subject: "Re: anything", body: "Bumping this. {{booking link}}\n\n{{your name}}" }),
  );
  assert.deepEqual(asked[0].p_chain, CHAIN({}, { body: "Bumping this. {{booking link}}\n\n{{your name}}" }));
  assert.deepEqual(out.template, { id: T2, channel: "email", name: NUDGE, language: "en" });
});

test("every word is checked by the one email check over the reach-out's rules, in its own sentences, before the door is asked", async () => {
  const asked = serviceSave();
  const t = tables();
  const said = (problem, field = "body", slot) => wordsIssueWords({ field, problem, ...(slot ? { slot } : {}) });
  await refused(post(t, write({ subject: "  " })), "validation", 422, said("subject_missing", "subject"));
  await refused(
    post(t, write({ subject: "Re: your studio" })),
    "validation",
    422,
    said("subject_poses_as_reply", "subject"),
  );
  await refused(
    post(t, write({ body: "Hi {{first name}}" })),
    "validation",
    422,
    said("unknown_slot", "body", "first name"),
  );
  await refused(post(t, write({ body: "Hi {{{business}}}" })), "validation", 422, said("stray_brace"));
  await refused(
    post(t, write({ body: "A.\nhttps://a.example https://b.example" })),
    "validation",
    422,
    said("too_many_links"),
  );
  await refused(post(t, write({ body: "SEE THIS NOW\n{{opening}}" })), "validation", 422, said("shouting"));
  await refused(post(t, write({ body: "x".repeat(1201) })), "validation", 422, said("body_too_long"));
  await refused(post(t, write({ body: "word ".repeat(121) })), "validation", 422, said("too_many_words"));
  assert.deepEqual(asked, [], "nothing it refused reached the database");
});

test("what only the chain knows is refused too: a name to sign with when the words name one, and a booking link the workspace lacks", async () => {
  const asked = serviceSave();
  const noSigner = tables();
  noSigner.playbooks.find((p) => p.id === ROOT_ID).signed_by = null;
  await refused(
    post(noSigner, write()),
    "validation",
    422,
    "Your words name {{your name}}. Say the name you sign with.",
  );
  const noLink = tables();
  noLink.tenant_config = [{ tenant_id: A, config: config(null) }];
  await refused(
    post(noLink, write({ body: "{{opening}} {{booking link}}\n\n{{your name}}" })),
    "validation",
    422,
    "Your words name {{booking link}}. Add your booking link in Settings › Business first.",
  );
  assert.deepEqual(asked, []);
});

test("who may: a viewer is refused before anything is read; a step that is not this workspace's, or has no email of its own, is not found", async () => {
  const asked = serviceSave();
  await refused(post(tables("viewer"), write()), "forbidden", 403);
  await refused(
    post(tables(), write({ name: reachOutRowName("99999999-9999-4999-8999-999999999999") })),
    "not_found",
    404,
    REACH_OUT_REFUSALS.notFound,
  );
  // A call or a note is a step with no email: its row has no template, and no name of an email.
  const hand = tables();
  hand.playbooks.find((p) => p.id === STEP2).template_id = null;
  hand.playbooks.find((p) => p.id === STEP2).hand = { kind: "call", words: "Ring them" };
  await refused(post(hand, write({ name: NUDGE })), "not_found", 404, REACH_OUT_REFUSALS.notFound);
  assert.deepEqual(asked, []);
});

test("the door's own refusals come back in the person's words, as the sheet's save says them", async () => {
  serviceSave(() => {
    throw Object.assign(new Error(REACH_OUT_REFUSALS.outOfPlace), { code: "22023" });
  });
  await refused(post(tables(), write()), "validation", 422, REACH_OUT_REFUSALS.outOfPlace);
  serviceSave(() => {
    throw Object.assign(new Error(REACH_OUT_REFUSALS.workspaceNotFound), { code: "P0002" });
  });
  await refused(post(tables(), write()), "not_found", 404, REACH_OUT_REFUSALS.workspaceNotFound);
});
