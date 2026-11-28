/**
 * A form as its owner makes it and answers it (00680; the Forms plan, F1 and F2), through the dashboard's own routes
 * over a database in memory, the model scripted: a form made by saying what to collect, AI's draft kept as a draft and
 * live only by the owner's press; its link and its printed code made once, at the first publish; a change kept in place
 * that visitors do not see until it is published; AI told what to change, and one question it proposes and never keeps;
 * a form turned off and on, duplicated, and deleted only while nobody was ever sent to it; a link per place, by saying
 * where; and each request as Inbox answers it: what was asked and how it came, a member's word that it was answered
 * and that word taken back, one that is not a real request held and let through again.
 *
 * The plan's "done when" lines lead: a form that could not be answered is never published; nothing a member has not
 * pressed is live; a reply to a person whose page says another address waits for the member's pick, and one to a held
 * entry is refused, with nothing sent either time. The reply's own send runs through the doors every message leaves by
 * (core's beginConversation, proved by tests/new-conversation and on a database); here, what answers a request is
 * read from its link to the message, so a reply taken back or one that failed answers nothing.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { A, consultForm, emailWire, FORM, formWorld, LINK, V1 } from "./_form-requests.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
// The dashboard may ask the edge whether email can send: a form's sheet says where a reply by email cannot go.
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
for (const name of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[name];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const forms = await import(at("apps/dashboard/app/api/v1/forms/route.ts"));
const sheet = await import(at("apps/dashboard/app/api/v1/forms/sheet/route.ts"));
const links = await import(at("apps/dashboard/app/api/v1/forms/links/route.ts"));
const requests = await import(at("apps/dashboard/app/api/v1/forms/requests/route.ts"));
const requestsMore = await import(at("apps/dashboard/app/api/v1/forms/requests/more/route.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const { setModelStream } = await import(at("apps/dashboard/src/server/shared/model-json.ts"));
const { readerContext, load } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { formRequestsOpen } = await import(at("apps/dashboard/src/server/readers/forms/forms.ts"));
const { CHANNEL_WORDS, formDescriptionProblems } = await import("@chanlytics/contracts");
const { getEmailWire } = await import(at("apps/dashboard/src/server/connections/email-readiness.ts"));

/** The edge's answer about email: it can send as each test begins, and the salon has its mailbox (formWorld). */
const wire = emailWire(getEmailWire);

beforeEach(async () => {
  setRateStore(memoryStore());
  await wire.says(true);
});
after(() => {
  setModelStream(null);
  setServiceClient(null);
  wire.undo();
});

const U = "11111111-1111-4111-8111-111111111111";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/** The model answers each of `answers` in turn; every call it was made is kept. */
function modelSays(...answers) {
  const calls = [];
  let n = 0;
  setModelStream(async function* (call) {
    calls.push(call);
    const said = answers[Math.min(n++, answers.length - 1)];
    if (said === "error") {
      yield { type: "error", message: "the model is away" };
      return;
    }
    yield { type: "text", index: 0, text: JSON.stringify(said) };
    yield { type: "stop", stopReason: "end_turn" };
  });
  return calls;
}

const field = (kind, label, over = {}) => ({ id: "", kind, label, help: "", needed: true, choices: [], ...over });
/** What the model writes for "a form for a first visit": a name, an address and what they need. */
const FIRST_VISIT = {
  ask: "",
  heading: "First visit",
  intro: "Tell us what you need, and we'll get back to you.",
  lang: "en",
  thanks: "Thanks, we have your request.",
  fields: [field("short", "Your name"), field("email", "Email"), field("long", "What do you need?")],
  words: [],
  said: "",
};

/** The salon's world (_form-requests.mjs) with one member signed in, and the service role's client the same world's. */
function world({ role = "owner", ...options } = {}) {
  const made = formWorld({
    ...options,
    more: {
      memberships: [
        {
          user_id: U,
          tenant_id: A,
          role,
          tenants: { slug: "luma-salon", name: "Luma Salon", timezone: "America/New_York" },
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      messages: [],
      ...options.more,
    },
  });
  setServiceClient(made.db);
  const ctx = { supabase: made.db, userId: U, email: "ada@example.com", params: {} };
  const address = (route, query = "") => `http://localhost/api/v1/${route}?workspace=${A}${query}`;
  const post = (module, route) => (body, headers) =>
    module.POST.run(new Request(address(route), { method: "POST", body: JSON.stringify(body), headers }), ctx);
  /** A request as a visitor sends one through the form's link (the visitor's own page is proved beside this file). */
  const arrives = (reach, over = {}) =>
    made.db
      .rpc("form_request_take", {
        p_tenant_id: A,
        p_form_id: FORM,
        p_version_id: V1,
        p_ref: crypto.randomUUID(),
        p_answers: { f1name: reach.name, f2mail: reach.email, f3phon: reach.phone, f4want: "A warm, soft blonde." },
        p_reach: { name: reach.name ?? null, email: reach.email ?? null, phone: reach.phone ?? null },
        p_words: "0".repeat(64),
        p_link_code: "k7q2md",
        ...over,
      })
      .then((r) => r.data);
  return {
    ...made,
    ctx,
    arrives,
    press: post(forms, "forms"),
    pressLink: post(links, "forms/links"),
    pressRequest: post(requests, "forms/requests"),
    list: () => forms.GET.run(new Request(address("forms")), ctx),
    sheetOf: (id) => sheet.GET.run(new Request(address("forms/sheet", `&form=${id}`)), ctx),
    requestOf: (id) => requests.GET.run(new Request(address("forms/requests", `&id=${id}`)), ctx),
    /** Needs you's own list, as Today's read carries it: the requests, and the one count. */
    needsYou: async () => (await load(readerContext(ctx, { tenantId: A, role }), formRequestsOpen, undefined)).data,
    /** The requests past a list's end (GET forms/requests/more): read on from the request it ended on. */
    moreAfter: (id) => requestsMore.GET.run(new Request(address("forms/requests/more", `&after=${id}`)), ctx),
    open: () => made.db.rpc("form_requests_open", { p_tenant_id: A }).then((r) => r.data),
  };
}

async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.match(e.message, words);
    return true;
  });
}

const ANA = { name: "Ana Ruiz", email: "ana@example.com" };

test("who may read a business's forms and press on them, and how often", () => {
  const anyMember = { kind: "read", scope: "workspace", role: null, rate: null, spend: false };
  const change = { kind: "write", scope: "workspace", role: "operator", rate: "form_change", spend: false };
  assert.deepEqual(forms.GET.policy, anyMember);
  assert.deepEqual(sheet.GET.policy, anyMember);
  assert.deepEqual(requests.GET.policy, anyMember);
  assert.deepEqual(forms.POST.policy, change);
  assert.deepEqual(links.POST.policy, change);
  // One press of Send is one reply: the route keeps the page's own key for it (decision 0035).
  assert.deepEqual(requests.POST.policy, { ...change, rate: "reply", idempotent: "own" });
  assert.equal(forms.maxDuration, 60, "AI's draft has the platform's whole minute");
});

test("an owner says what to collect: AI drafts it, and it is kept as a draft at an address of its own", async () => {
  const w = world();
  const calls = modelSays(FIRST_VISIT);
  const pressed = await w.press({ act: "make", sentence: "A form for people who want a first visit" });
  assert.equal(pressed.failed, false);
  assert.equal(pressed.asked, false);
  const kept = w.tables.forms.find((f) => f.id === pressed.form_id);
  assert.equal(kept.slug, "first-visit");
  assert.equal(kept.state, "draft", "AI writes words and never state");
  assert.equal(kept.live_version_id, null);
  assert.equal(kept.created_by, U);
  assert.deepEqual(formDescriptionProblems(kept.draft), []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].purpose, "form_draft");
  const brief = JSON.stringify(calls[0].request.messages);
  assert.match(brief, /A form for people who want a first visit/);
  assert.match(brief, /Luma Salon/, "the business's own name, from its record");
  const { forms: listed, can_change: canChange } = await w.list();
  assert.equal(canChange, true);
  assert.deepEqual(
    listed.map((f) => [f.heading, f.state, f.changed]),
    [
      ["First visit", "draft", false],
      ["Colour consultation", "live", false],
    ],
    "the newest first",
  );
  // The same heading again: an address of its own, never the first one's.
  const again = await w.press({ act: "make", sentence: "A form for people who want a first visit" });
  assert.equal(w.tables.forms.find((f) => f.id === again.form_id).slug, "first-visit-2");
});

test("a sentence with no form in it is one question back, and a model that is away makes nothing", async () => {
  const w = world();
  modelSays({ ...FIRST_VISIT, ask: "What should people ask you for?", fields: [] });
  assert.deepEqual(await w.press({ act: "make", sentence: "hello there" }), {
    form_id: null,
    proposed: null,
    said: "What should people ask you for?",
    asked: true,
    failed: false,
  });
  modelSays("error");
  const away = await w.press({ act: "make", sentence: "A form for a first visit" });
  assert.equal(away.failed, true);
  assert.equal(away.form_id, null);
  assert.equal(w.tables.forms.length, 1, "nothing was made either time");
});

test("a form is live only by its owner's press, with its link and its printed code made once", async () => {
  const w = world();
  modelSays(FIRST_VISIT);
  const { form_id: id } = await w.press({ act: "make", sentence: "A form for a first visit" });
  assert.equal((await w.sheetOf(id)).live, null, "nobody sees a draft");
  await w.press({ act: "publish", form_id: id });
  const live = await w.sheetOf(id);
  assert.equal(live.state, "live");
  assert.deepEqual(live.live, live.draft);
  assert.equal(live.changed, false);
  assert.deepEqual(
    live.links.map((l) => [l.place, l.printed, l.stopped, l.opens, l.requests]),
    [
      ["Your link", false, false, 0, 0],
      ["Printed code", true, false, 0, 0],
    ],
  );
  assert.ok(live.links.every((l) => /^[a-hjkmnp-z2-9]{6}$/.test(l.code)));
  assert.notEqual(live.links[0].code, live.links[1].code);
  // Published again with nothing changed: the same version, and no second pair of links.
  await w.press({ act: "publish", form_id: id });
  assert.equal(w.tables.form_versions.filter((v) => v.form_id === id).length, 1);
  assert.equal((await w.sheetOf(id)).links.length, 2);
});

test("a form with no way to answer its visitor is never published: the refusal says what to add", async () => {
  const w = world();
  modelSays(FIRST_VISIT);
  const { form_id: id } = await w.press({ act: "make", sentence: "A form for a first visit" });
  const draft = (await w.sheetOf(id)).draft;
  const noWay = { ...draft, fields: draft.fields.filter((f) => f.kind !== "email") };
  await w.press({ act: "save", form_id: id, draft: noWay });
  await refused(w.press({ act: "publish", form_id: id }), "validation", 400, /email|phone/i);
  assert.equal(w.tables.forms.find((f) => f.id === id).state, "draft");
  assert.equal(w.tables.form_versions.filter((v) => v.form_id === id).length, 0);
  assert.equal(w.tables.links.filter((l) => l.subject_id === id).length, 0, "and no link to a form nobody can open");
});

test("a change is kept in place, and visitors see it only once it is published", async () => {
  const w = world();
  const before = (await w.sheetOf(FORM)).draft;
  const changed = { ...before, heading: "Colour consultation, spring" };
  await w.press({ act: "save", form_id: FORM, draft: changed });
  const waiting = await w.sheetOf(FORM);
  assert.equal(waiting.changed, true);
  assert.equal(waiting.live.heading, "Colour consultation", "what visitors see has not moved");
  assert.equal(waiting.draft.heading, "Colour consultation, spring");
  assert.equal((await w.list()).forms[0].changed, true);
  await w.press({ act: "publish", form_id: FORM });
  const after = await w.sheetOf(FORM);
  assert.equal(after.changed, false);
  assert.equal(after.live.heading, "Colour consultation, spring");
  assert.equal(w.tables.form_versions.filter((v) => v.form_id === FORM).length, 2, "each published form is kept");
  assert.equal(after.links.length, 2, "the link it already had, and its printed code made now");
  assert.equal(after.links[0].id, LINK);
  // A draft that is not a form's shape is refused at the door, and nothing is kept.
  await refused(w.press({ act: "save", form_id: FORM, draft: { ...changed, fields: [] } }), "validation");
  await refused(w.press({ act: "save", form_id: B, draft: changed }), "not_found", 404);
});

test("AI told what to change writes the draft; a question it proposes is the owner's to keep", async () => {
  const w = world();
  const written = {
    ...FIRST_VISIT,
    heading: "Colour consultation",
    fields: [...FIRST_VISIT.fields, field("short", "When suits you?", { needed: false })],
    said: "I added a question about when suits them.",
  };
  const calls = modelSays(written);
  const told = await w.press({ act: "tell", form_id: FORM, sentence: "Ask when suits them" });
  assert.equal(told.said, "I added a question about when suits them.");
  assert.equal(told.proposed, null);
  const kept = w.tables.forms.find((f) => f.id === FORM);
  assert.equal(kept.draft.fields.at(-1).label, "When suits you?");
  assert.equal(kept.state, "live", "the form stays as it was: only its draft moved");
  assert.equal((await w.sheetOf(FORM)).changed, true);
  assert.match(JSON.stringify(calls[0].request.messages), /Colour consultation/, "AI is handed the form as it stands");

  const asked = await w.press({ act: "question", form_id: FORM, sentence: "Something about their hair now" });
  assert.equal(asked.proposed.fields.at(-1).label, "When suits you?");
  assert.equal(asked.form_id, FORM);
  // Asked for a question while the model is away: nothing changes, and the page is told so.
  modelSays("error");
  const away = await w.press({ act: "question", form_id: FORM, sentence: "Something about their hair now" });
  assert.deepEqual([away.failed, away.proposed], [true, null]);
});

test("a form is turned off and on, duplicated, and deleted only while it was never published", async () => {
  const w = world();
  await w.press({ act: "turn_off", form_id: FORM });
  assert.equal((await w.sheetOf(FORM)).state, "off");
  await w.press({ act: "turn_on", form_id: FORM });
  assert.equal((await w.sheetOf(FORM)).state, "live");
  await refused(w.press({ act: "delete", form_id: FORM }), "conflict", 409, /turned off, not deleted/);
  assert.equal(w.tables.forms.length, 1);

  const { form_id: copy } = await w.press({ act: "duplicate", form_id: FORM });
  const copied = await w.sheetOf(copy);
  assert.equal(copied.state, "draft");
  assert.equal(copied.slug, "colour-consultation-copy");
  assert.equal(copied.draft.heading, "Colour consultation copy");
  assert.deepEqual(copied.draft.fields, (await w.sheetOf(FORM)).draft.fields);
  assert.deepEqual(copied.links, [], "a copy is shared nowhere yet");
  assert.deepEqual(await w.press({ act: "delete", form_id: copy }), {
    form_id: null,
    proposed: null,
    said: null,
    asked: false,
    failed: false,
  });
  assert.equal(w.tables.forms.length, 1);
});

test("a link for each place, made by saying where: renamed, stopped and started again", async () => {
  const w = world();
  const { link_id: id } = await w.pressLink({ act: "make", form_id: FORM, place: "  Google listing " });
  const made = w.tables.links.find((l) => l.id === id);
  assert.equal(made.place, "Google listing");
  assert.equal(made.subject_id, FORM);
  assert.equal(made.created_by, U);
  assert.notEqual(made.code, "k7q2md");
  await w.pressLink({ act: "rename", link_id: id, place: "Google" });
  await w.pressLink({ act: "stop", link_id: id });
  const stopped = (await w.sheetOf(FORM)).links.find((l) => l.id === id);
  assert.deepEqual([stopped.place, stopped.stopped], ["Google", true]);
  await w.pressLink({ act: "start", link_id: id });
  assert.equal((await w.sheetOf(FORM)).links.find((l) => l.id === id).stopped, false);
  await refused(w.pressLink({ act: "stop", link_id: B }), "not_found", 404);
  await refused(w.pressLink({ act: "make", form_id: B, place: "Flyer" }), "not_found", 404);
  await refused(w.pressLink({ act: "make", form_id: FORM, place: "   " }), "validation");
});

test("a request as Inbox answers it: what was asked, who, where it came through, and where it stands", async () => {
  const w = world();
  const taken = await w.arrives(ANA);
  assert.equal(taken.outcome, "accepted");
  const request = await w.requestOf(taken.entry_id);
  assert.equal(request.heading, "Colour consultation");
  assert.equal(request.standing, "open");
  assert.equal(request.place, "Your link");
  assert.deepEqual(request.reach, { name: "Ana Ruiz", email: "ana@example.com", phone: null });
  assert.equal(request.person.id, taken.contact_id);
  assert.equal(request.other_email, null);
  assert.equal(request.drafts, true);
  assert.ok(request.lines.some((line) => /warm, soft blonde/.test(JSON.stringify(line))));
  assert.match(request.note, /warm, soft blonde/);
  const { entries, held, results, links: shared } = await w.sheetOf(FORM);
  assert.deepEqual(
    entries.map((e) => [e.name, e.standing, e.place, e.phone_only]),
    [["Ana Ruiz", "open", "Your link", false]],
  );
  assert.deepEqual(held, []);
  assert.equal(results.requests, 1);
  assert.equal(results.talked, 0);
  assert.equal(shared[0].requests, 1);
  // Another workspace's request is not found, nor one that is no request.
  await refused(w.requestOf(B), "not_found", 404);
});

test("a member's word answers a request, and taken back it is open again", async () => {
  const w = world();
  const { entry_id: id } = await w.arrives(ANA);
  await w.pressRequest({ act: "mark", entry_id: id });
  const marked = await w.requestOf(id);
  assert.equal(marked.standing, "answered");
  assert.equal(marked.answered.how, "marked");
  assert.equal(w.tables.form_entry_links[0].created_by, U);
  assert.equal((await w.sheetOf(FORM)).entries[0].standing, "answered");
  // Pressed twice (two tabs): one word, never two.
  await w.pressRequest({ act: "mark", entry_id: id });
  assert.equal(w.tables.form_entry_links.length, 1);
  await w.pressRequest({ act: "unmark", entry_id: id });
  assert.equal((await w.requestOf(id)).standing, "open");
  assert.equal(w.tables.form_entry_links.length, 0);
});

test("a reply answers the request it was sent from, and one taken back or failed answers nothing", async () => {
  const w = world();
  const first = await w.arrives(ANA);
  const second = await w.arrives(ANA);
  const message = {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    tenant_id: A,
    conversation_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    channel: "email",
    direction: "outbound",
    sender: "human",
    type: "text",
    body: "Hi Ana, we'd love to help.",
    status: "queued",
    created_at: new Date().toISOString(),
  };
  w.tables.messages.push(message);
  // Linked in the message's own write, as the database links a reply that names its request (00713).
  w.tables.form_entry_links.push({
    id: "abababab-abab-4bab-8bab-abababababab",
    tenant_id: A,
    entry_id: first.entry_id,
    kind: "reply",
    message_id: message.id,
    conversation_id: null,
    appointment_id: null,
    created_by: U,
    created_at: new Date().toISOString(),
  });
  // Still waiting to go, for the seconds it can be taken back: sending, never answered yet (00726).
  const going = await w.requestOf(first.entry_id);
  assert.deepEqual(
    [going.standing, going.answered],
    ["sending", null],
    "REGRESSION: a reply that had not left yet read as answered",
  );
  assert.equal((await w.sheetOf(FORM)).entries.find((e) => e.id === first.entry_id).standing, "sending");
  assert.equal(
    (await w.open()).some((line) => line.id === first.entry_id),
    false,
    "and it waits in Needs you no more while it goes",
  );
  assert.equal((await w.requestOf(second.entry_id)).standing, "open", "a reply never closes another request");
  // It left: answered, and by what.
  message.status = "sent";
  const answered = await w.requestOf(first.entry_id);
  assert.equal(answered.standing, "answered");
  assert.equal(answered.answered.how, "reply");
  assert.equal((await w.sheetOf(FORM)).entries.find((e) => e.id === first.entry_id).standing, "answered");
  // Undo, inside its seconds: the message is canceled, and the request is open again with no write of its own.
  message.status = "canceled";
  assert.equal((await w.requestOf(first.entry_id)).standing, "open");
  // It left and never reached them: open again, and said so.
  message.status = "failed";
  const bounced = await w.requestOf(first.entry_id);
  assert.deepEqual([bounced.standing, bounced.unreached], ["open", true]);
  assert.equal((await w.open()).find((line) => line.id === first.entry_id)?.unreached, true, "back in Needs you");
});

test("a request nobody answered in sixty days is never called answered, on its page or in its form's list", async () => {
  const w = world();
  const old = await w.arrives(ANA);
  const fresh = await w.arrives(ANA);
  // Sixty-one days on: it has left Needs you, on purpose (form_requests_open's sixty days).
  w.tables.form_entries.find((e) => e.id === old.entry_id).created_at = new Date(
    Date.now() - 61 * 86_400_000,
  ).toISOString();
  assert.deepEqual(
    (await w.open()).map((line) => line.id),
    [fresh.entry_id],
    "Needs you holds the one inside its sixty days",
  );
  const listed = (await w.sheetOf(FORM)).entries;
  assert.equal(
    listed.find((e) => e.id === old.entry_id).standing,
    "aged",
    "REGRESSION: the form's own list called it answered, since it was not in the open list",
  );
  assert.equal(listed.find((e) => e.id === fresh.entry_id).standing, "open");
  const page = await w.requestOf(old.entry_id);
  assert.deepEqual([page.standing, page.answered], ["aged", null], "and its own page said answered, by nothing");
  // Answered late, it is answered: a member's word counts whatever its age.
  await w.pressRequest({ act: "mark", entry_id: old.entry_id });
  assert.equal((await w.requestOf(old.entry_id)).standing, "answered");
});

test("one that is not a real request is held and counted nowhere, and let through it is a request again", async () => {
  const w = world();
  const { entry_id: id } = await w.arrives(ANA);
  await w.pressRequest({ act: "hold", entry_id: id });
  const held = await w.requestOf(id);
  assert.deepEqual([held.standing, held.held_why], ["held", "member"]);
  const pile = await w.sheetOf(FORM);
  assert.deepEqual(pile.entries, []);
  assert.deepEqual(
    pile.held.map((e) => [e.name, e.held_why]),
    [["Ana Ruiz", "member"]],
  );
  assert.equal(pile.results.requests, 0, "held is in no count");
  assert.equal((await w.list()).forms[0].held, 1);
  // A reply to a held entry is refused, with nothing sent.
  await refused(
    w.pressRequest({ act: "reply", entry_id: id, wire: "email", text: "Hello" }),
    "conflict",
    409,
    /Let it through/,
  );
  assert.equal(w.tables.messages.length, 0);
  await w.pressRequest({ act: "let_through", entry_id: id });
  assert.equal((await w.requestOf(id)).standing, "open");
  assert.equal((await w.list()).forms[0].held, 0);
});

test("an entry the page held for a look has no person until it is let through", async () => {
  const w = world();
  const taken = await w.arrives({ name: "Bo", email: "bo@example.com" }, { p_held_why: "too_fast" });
  assert.equal(taken.outcome, "held");
  assert.equal(w.tables.contacts.length, 0, "a held entry makes no person");
  const held = await w.requestOf(taken.entry_id);
  assert.deepEqual([held.standing, held.held_why, held.person], ["held", "too_fast", null]);
  await w.pressRequest({ act: "let_through", entry_id: taken.entry_id });
  const through = await w.requestOf(taken.entry_id);
  assert.equal(through.standing, "open");
  assert.equal(through.person.email, "bo@example.com");
  assert.equal(w.tables.events.filter((e) => e.kind === "form_entry.accepted").length, 1, "and its owner is told now");
});

test("entries held for a look that nobody looked at in three days are said by form, beside the open requests", async () => {
  const w = world();
  const DAY_MS = 86_400_000;
  const now = new Date("2026-11-22T15:00:00Z");
  const held = async (name, daysAgo, why = "too_fast") => {
    const taken = await w.arrives({ name, email: `${name.toLowerCase()}@example.com` }, { p_held_why: why });
    w.tables.form_entries.find((e) => e.id === taken.entry_id).created_at = new Date(
      now.getTime() - daysAgo * DAY_MS,
    ).toISOString();
    return taken.entry_id;
  };
  await held("Bo", 5);
  await held("Cy", 4, "too_many");
  const fresh = await held("Di", 1);
  const open = await w.arrives(ANA);
  const read = () => load(readerContext(w.ctx, { tenantId: A, role: "owner" }, now), formRequestsOpen, undefined);
  const { requests, held: piles } = (await read()).data;
  assert.deepEqual(
    requests.map((r) => r.id),
    [open.entry_id],
    "a held entry is no open request",
  );
  assert.deepEqual(piles, [
    {
      form_id: FORM,
      heading: "Colour consultation",
      held: 2,
      oldest_at: new Date(now.getTime() - 5 * DAY_MS).toISOString(),
    },
  ]);
  // Looked at: one let through and one that is a day old leave the pile of two alone; both gone, nothing is said.
  await w.pressRequest({ act: "let_through", entry_id: fresh });
  assert.equal((await read()).data.held[0].held, 2);
  for (const e of w.tables.form_entries)
    if (e.state === "held") Object.assign(e, { state: "accepted", held_why: null });
  assert.deepEqual((await read()).data.held, []);
});

test("a reply waits for the member's pick where the request's address is not the one on their page", async () => {
  const w = world();
  w.tables.contacts.push({
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    tenant_id: A,
    phone_e164: "+13055550142",
    email: "ana.old@example.com",
    display_name: "Ana Ruiz",
    consent: "unknown",
    dnc: false,
    email_marketing: "unknown",
  });
  const taken = await w.arrives({ name: "Ana Ruiz", email: "ana.new@example.com", phone: "+13055550142" });
  assert.equal(taken.contact_id, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "the same person, found by her number");
  assert.equal((await w.requestOf(taken.entry_id)).other_email, "ana.new@example.com");
  await refused(
    w.pressRequest({ act: "reply", entry_id: taken.entry_id, wire: "email", text: "Hello Ana" }),
    "conflict",
    409,
    /ana\.new@example\.com.*ana\.old@example\.com/,
  );
  // An address that is neither is no pick.
  await refused(
    w.pressRequest({
      act: "reply",
      entry_id: taken.entry_id,
      wire: "email",
      text: "Hello Ana",
      email_to: "someone@example.com",
    }),
    "conflict",
    409,
  );
  assert.equal(w.tables.contacts[0].email, "ana.old@example.com", "her page is never overwritten by a form");
  assert.equal(w.tables.messages.length, 0, "and nothing was sent");
});

test("a form's sheet says whether a reply by email can go, as the send door answers it, and the form publishes either way", async () => {
  // The business's mailbox, on a deployment whose email can send.
  assert.deepEqual((await world().sheetOf(FORM)).email, { ready: true, why: null, connect: false, unchecked: false });

  // No mailbox: the door's own sentence, and the business has the door that opens it.
  const none = world({ email: false, state: "draft" });
  assert.deepEqual((await none.sheetOf(FORM)).email, {
    ready: false,
    why: CHANNEL_WORDS.noMailbox,
    connect: true,
    unchecked: false,
  });
  // The owner is told and nothing is held: it goes live by the same press.
  await none.press({ act: "publish", form_id: FORM });
  const live = await none.sheetOf(FORM);
  assert.equal(live.state, "live");
  assert.equal(live.email.ready, false);

  // A deployment whose email cannot send: a no, with no door of the business's to open.
  await wire.says(false);
  assert.deepEqual((await world().sheetOf(FORM)).email, {
    ready: false,
    why: CHANNEL_WORDS.noEmailDomain,
    connect: false,
    unchecked: false,
  });

  // An edge that does not answer is not a no: the sheet says nothing of it, and never that email is ready.
  await wire.says(null);
  const unasked = (await world().sheetOf(FORM)).email;
  assert.equal(unasked.unchecked, true);
  assert.equal(unasked.ready, false);
  assert.equal(unasked.connect, false);
});

test("a viewer reads a business's forms and presses nothing", async () => {
  const w = world({ role: "viewer" });
  const { entry_id: id } = await w.arrives(ANA);
  const listed = await w.list();
  assert.equal(listed.can_change, false);
  assert.equal((await w.sheetOf(FORM)).can_change, false);
  assert.equal((await w.requestOf(id)).standing, "open");
  const before = JSON.stringify(w.tables);
  for (const pressed of [
    w.press({ act: "make", sentence: "A form for a first visit" }),
    w.press({ act: "publish", form_id: FORM }),
    w.press({ act: "turn_off", form_id: FORM }),
    w.press({ act: "save", form_id: FORM, draft: consultForm({ heading: "Mine now" }) }),
    w.pressLink({ act: "make", form_id: FORM, place: "Flyer" }),
    w.pressRequest({ act: "mark", entry_id: id }),
    w.pressRequest({ act: "hold", entry_id: id }),
  ])
    await refused(pressed, "forbidden", 403);
  assert.equal(JSON.stringify(w.tables), before, "nothing moved");
});

test("Needs you reads on past the 200 it lists: every request the count counts can be reached", async () => {
  const w = world();
  const sent = [];
  // 207 requests nobody has answered, a minute apart, the oldest first.
  for (let n = 0; n < 207; n += 1) {
    const taken = await w.arrives({ name: `Visitor ${n}`, email: `visitor${n}@example.com` });
    w.tables.form_entries.find((e) => e.id === taken.entry_id).created_at = new Date(
      Date.now() - (207 - n) * 60_000,
    ).toISOString();
    sent.push(taken.entry_id);
  }
  const listed = await w.needsYou();
  assert.deepEqual([listed.requests.length, listed.count], [200, 207], "the list holds 200, the count every one");
  const seen = new Set(listed.requests.map((request) => request.id));
  const more = await w.moreAfter(listed.requests.at(-1).id);
  assert.equal(more.requests.length, 7, "REGRESSION: the seven past the list were counted and could not be reached");
  assert.equal(
    more.requests.some((request) => seen.has(request.id)),
    false,
    "none of them one the list already holds",
  );
  assert.deepEqual(
    more.requests.map((request) => request.id),
    sent.slice(0, 7).reverse(),
    "the next ones in the list's own order: the newest of the rest first",
  );
  assert.deepEqual(
    Object.keys(more.requests[0]).sort(),
    Object.keys(listed.requests[0]).sort(),
    "each read as Needs you reads a request: who asked, in their words, through which form",
  );
  assert.deepEqual((await w.moreAfter(more.requests.at(-1).id)).requests, [], "read on to the end: none is left");
  assert.deepEqual(
    (await w.moreAfter("99999999-9999-4999-8999-999999999999")).requests,
    [],
    "a request that is not this workspace's reads nothing on",
  );
});

test("the reply's pick puts the request's address on their page: the line names both, and a yes to offers by email ends", async () => {
  const w = world();
  const ANA_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  w.tables.contacts.push({
    id: ANA_ID,
    tenant_id: A,
    phone_e164: "+13055550142",
    email: "ana.old@example.com",
    display_name: "Ana Ruiz",
    consent: "unknown",
    dnc: false,
    // She confirmed a sign-up from the address on her page: a yes that address gave.
    email_marketing: "opted_in",
    email_marketing_source: "confirmed_signup",
    created_at: "2026-01-01T00:00:00Z",
  });
  const taken = await w.arrives({ name: "Ana Ruiz", email: "ana.new@example.com", phone: "+13055550142" });
  const before = await w.requestOf(taken.entry_id);
  assert.deepEqual(
    [before.other_email, before.person.email, before.person.offers],
    ["ana.new@example.com", "ana.old@example.com", true],
    "the page says both addresses, and that the old one said yes to offers, before the pick",
  );
  // The member picks the request's own. Whatever becomes of the send, the pick is the page's from then on.
  await w
    .pressRequest({
      act: "reply",
      entry_id: taken.entry_id,
      wire: "email",
      text: "Hello Ana",
      email_to: "ana.new@example.com",
    })
    .catch(() => undefined);
  const ana = w.tables.contacts.find((c) => c.id === ANA_ID);
  assert.equal(ana.email, "ana.new@example.com", "her page takes it");
  const line = w.tables.events.filter((e) => e.kind === "contact.email_set").at(-1);
  assert.deepEqual(
    [line.data.was, line.data.now],
    ["ana.old@example.com", "ana.new@example.com"],
    "REGRESSION: the change left a line that named neither address, so the old one was lost",
  );
  assert.deepEqual(
    [ana.email_marketing, ana.email_marketing_source],
    ["unknown", "address_changed"],
    "REGRESSION: a yes the old address gave was carried to one that never gave it",
  );
  assert.equal((await w.requestOf(taken.entry_id)).person.offers, false);
  assert.equal((await w.requestOf(taken.entry_id)).other_email, null, "and the request and her page agree now");
});
