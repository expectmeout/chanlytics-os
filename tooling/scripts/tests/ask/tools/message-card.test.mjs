/**
 * Ask writes a message (propose_campaign's action message, the marketing manager's spec §5.2): a new message for the
 * Library, one name and language with a version per channel, checked before it is a card by the checks POST
 * templates/message makes (the door's own, one spelling each), so a card never promises what the door refuses, and
 * quoted on the card as the person reached on each channel reads it. Its spec (contracts messageSpec) commits through
 * that door; its receipt says what was filed and what was refused; its undo deletes each email and text version the
 * door filed, one DELETE templates/versions/[id] each within ten minutes, and leaves the WhatsApp version, which WhatsApp
 * holds, saying so; its Open is the Library.
 *
 * Executed through the real registry over a workspace in memory, the edge's answer about email a stubbed fetch; the walk
 * (legacy-bridge/ask/commit.ts) over the typed client on a fake fetch; and a card's commit body through the door itself.
 * Nothing a card is made from is written.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_URL = "https://edge.example.com";
for (const k of ["DIAG_KEY", "VERCEL_ENV"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { buildProposal, newToolContext, toApiTools } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
// Read as a module, so a name contracts does not export yet is a failing assertion, not a file that will not load.
const C = await import("@chanlytics/contracts");
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { emailWire } = await import(at("apps/dashboard/src/server/connections/email-readiness.ts"));
const { createApi } = await import(at("apps/dashboard/src/client/api.ts"));
const { commitProposal, undoProposal } = await import(at("apps/dashboard/src/legacy-bridge/ask/commit.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const messageRoute = await import(at("apps/dashboard/app/api/v1/templates/message/route.ts"));
const { MESSAGE_VALUES_WORDS } = await import(at("apps/dashboard/src/server/campaigns/template-versions.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const TZ = "America/New_York";
const NOW = new Date("2026-10-10T14:00:00Z");
const V = (n) => `77777777-7777-4777-8777-${String(n).padStart(12, "0")}`;
/** The sentence the card says of when each version can go, word for word: WhatsApp's review, never Meta's. */
const GOES = "Goes by email now; its WhatsApp version waits on WhatsApp's review (usually minutes, sometimes a day)";

/** A template row as the table holds it: English is filed under en_US, as the starters are. */
const tpl = (n, over = {}) => ({
  id: V(n),
  tenant_id: A,
  channel: "email",
  name: "autumn_offer",
  language: "en_US",
  body_preview: "Hi {{1}}",
  variables: [
    { position: 1, label: "First name", example: "Dani" },
    { position: 2, label: "Business name", example: "Harbor" },
  ],
  category: "marketing",
  meta_status: "approved",
  quality: null,
  rejected_reason: null,
  synced_at: null,
  source: "chanlytics",
  hidden_at: null,
  title: null,
  ...over,
});

/** A workspace an operator works in: a WhatsApp number, a mailbox, and no message yet. */
const world = (over = {}) => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "operator", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  tenants: [{ id: A, name: "Harbor", timezone: TZ }],
  tenant_channels: [
    {
      id: "ch-wa",
      tenant_id: A,
      kind: "whatsapp",
      status: "active",
      number_e164: "+15550100",
      config: { quality_rating: "GREEN", messaging_limit: "TIER_1K" },
    },
  ],
  lines: [],
  mailboxes: [{ tenant_id: A, local_part: "harbor" }],
  messages: [],
  calls: [],
  templates: [],
  ...over,
});

/** The deployment can send email: the edge's answer about its wire, the one thing this file lets leave. */
const real = globalThis.fetch;
beforeEach(async () => {
  readerCache.clear();
  globalThis.fetch = async (url) => {
    if (!String(url).endsWith("/api/admin/email/wire")) throw new Error(`nothing else is reachable: ${url}`);
    return new Response(JSON.stringify({ ok: true, ready: true, offers: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  await emailWire({ fresh: true });
});
after(() => (globalThis.fetch = real));

/** A proposal of action message by a member of the role, over the world: its outcome, and what reached the database. */
async function propose(input, over = {}, role = "operator") {
  const tables = world(over);
  const supabase = fakeDb(tables, {}, {});
  const t = newToolContext({ supabase, userId: USER, email: "ada@example.com", params: {} }, A, role, TZ, NOW);
  const r = await buildProposal(t, "propose_campaign", { action: "message", ...input });
  return { ...r, seen: supabase.seen, tables };
}
const said = (r) => JSON.parse(r.result).error;
/**
 * The one function a card calls, a read: the workspace's configuration, for the postal address an offer by email's foot
 * names (campaigns/channels-ready.ts), asked where the deployment can send offers by email.
 */
const READ_RPCS = new Set(["tenant_config_read"]);
/** Nothing a card is made from writes: every request a select, and no function called but a read. */
const wroteNothing = (r) =>
  assert.deepEqual(
    r.seen.filter((q) => (q.rpc ? !READ_RPCS.has(q.rpc) : q.op !== "select")),
    [],
    "a card writes nothing",
  );

const SLOTS = [
  { position: 1, label: "First name", kind: "first_name" },
  { position: 2, label: "Business name", kind: "business_name" },
];
/** An offer, by WhatsApp and email, under a name a person typed. */
const OFFER = {
  name: "Autumn offer",
  language: "en",
  category: "marketing",
  versions: {
    whatsapp: { body: "Hi {{1}}, everything at {{2}} is 10% off this month. Reply STOP to opt out." },
    email: { subject: "This month at {{2}}", body: "Hi {{1}},\n\nEverything at {{2}} is 10% off this month." },
  },
  slots: SLOTS,
};
/** A message about their own appointment, in Spanish, on all three channels. */
const THANKS = {
  name: "thanks_for_coming",
  language: "es",
  category: "utility",
  versions: {
    whatsapp: { body: "Hola {{1}}, gracias por tu cita en {{2}}. Escríbenos si necesitas algo." },
    email: { subject: "Gracias, {{1}}", body: "Hola {{1}}, gracias por tu cita en {{2}}." },
    sms: { body: "Hola {{1}}, gracias por tu cita en {{2}}." },
  },
  slots: SLOTS,
};
const without = (input, channel) => {
  const { [channel]: _, ...versions } = input.versions;
  return { ...input, versions };
};

/* ------------------------------------------------------------------ refusals */

test("an offer with a text version is refused in the door's sentence, before anything is read: texts carry no offers", async () => {
  const r = await propose({ ...OFFER, versions: { ...OFFER.versions, sms: { body: "Hi {{1}}, 10% off at {{2}}." } } });
  assert.equal(r.isError, true);
  assert.equal(r.proposal, null);
  assert.equal(said(r), C.MESSAGE_WORDS.smsOffer);
  assert.ok(said(r).startsWith(C.channelNeverCarries("sms", "marketing")), "the door's own sentence, first");
  assert.deepEqual(r.seen, [], "refused from the words alone: nothing was read");
});

test("a message about their appointment with no WhatsApp version for WhatsApp to review is refused in the door's sentence", async () => {
  const r = await propose(without(THANKS, "whatsapp"));
  assert.equal(r.isError, true);
  assert.equal(said(r), C.MESSAGE_WORDS.utilityNeedsWhatsapp);
  assert.ok(said(r).startsWith(C.MESSAGE_BEGIN_WORDS.customIsAnOffer), "the door's own sentence, first");
  wroteNothing(r);
});

test("a WhatsApp version past what WhatsApp takes is refused in the door's sentence", async () => {
  const long = `Hi {{1}}, at {{2}}: ${"a".repeat(C.TEMPLATE_BODY_MAX)}`;
  const r = await propose({ ...OFFER, versions: { ...OFFER.versions, whatsapp: { body: long } } });
  assert.equal(r.isError, true);
  assert.equal(said(r), C.MESSAGE_WORDS.tooLong);
  assert.ok(said(r).includes(C.TEMPLATE_BODY_WORDS), "the door's own sentence");
  // Its line breaks and its ends are read as the review reads them: a body just at the limit, padded, is not too long.
  assert.equal(C.templateBodyTooLong(` ${"a".repeat(C.TEMPLATE_BODY_MAX)}\r\n`), false);
  assert.equal(C.templateBodyTooLong("a".repeat(C.TEMPLATE_BODY_MAX + 1)), true);
});

test("a WhatsApp version on a workspace with no connected number is refused in the door's sentence; its email alone is a card", async () => {
  const none = { tenant_channels: [] };
  const r = await propose(OFFER, none);
  assert.equal(r.isError, true);
  assert.equal(said(r), C.MESSAGE_WORDS.noNumber);
  assert.ok(said(r).startsWith(C.LIBRARY_WORDS.writeNeedsNumber), "what the door answers when the edge finds none");
  // A number that is not active is no number (contracts whatsappLineOf).
  const off = await propose(OFFER, { tenant_channels: [{ ...world().tenant_channels[0], status: "disconnected" }] });
  assert.equal(said(off), C.MESSAGE_WORDS.noNumber);
  const email = await propose(without(OFFER, "whatsapp"), none);
  assert.equal(email.isError, false, email.result);
  assert.equal(email.proposal.kind, "message");
});

test("an email version where email is not set up is refused with the reason channelsReady gives; WhatsApp alone is a card", async () => {
  const none = { mailboxes: [] };
  const r = await propose(OFFER, none);
  assert.equal(r.isError, true);
  assert.equal(said(r), C.MESSAGE_WORDS.noMailbox(C.CHANNEL_WORDS.noMailbox));
  assert.ok(said(r).startsWith(C.CHANNEL_WORDS.noMailbox));
  const wa = await propose(without(OFFER, "email"), none);
  assert.equal(wa.isError, false, wa.result);
});

test("a name and language the Library holds, on any channel, is a twin: refused in the door's sentence, naming the message", async () => {
  for (const channel of ["email", "whatsapp"]) {
    const r = await propose(OFFER, { templates: [tpl(1, { channel })] });
    assert.equal(r.isError, true, channel);
    assert.equal(said(r), C.MESSAGE_WORDS.twin("autumn_offer"), channel);
    assert.ok(said(r).startsWith(C.TEMPLATE_SAME_NAME_WORDS), "the door's own sentence, first");
    wroteNothing(r);
  }
  // The same name in another language is no twin: it is that message's language, written beside it.
  const es = await propose(OFFER, { templates: [tpl(1, { language: "es" })] });
  assert.equal(es.isError, false, es.result);
});

test("the language Ask names is filed under the product's code, through the one mapping: en is en_US, beside the starters, es is es; and a twin of an English name is found where it is held, under en_US", async () => {
  assert.deepEqual(
    ["en", "es"].map((l) => C.messageLanguageCode(l)),
    C.STARTER_LANGUAGES.map((l) => l.id),
    "the starters' own codes",
  );
  const commitOf = (p) => C.PROPOSAL_SPECS.message.commit(p, { settings: null }).body;
  const en = await propose(OFFER);
  assert.equal(en.isError, false, en.result);
  assert.deepEqual([en.proposal.payload.language, commitOf(en.proposal).language], ["en_US", "en_US"]);
  assert.equal(en.proposal.title, "New message: autumn_offer, in English", "the card says the language in words");
  const es = await propose({ ...OFFER, language: "es" });
  assert.deepEqual([es.proposal.payload.language, commitOf(es.proposal).language], ["es", "es"]);
  assert.equal(es.proposal.title, "New message: autumn_offer, in Spanish");
  // An English message the Library holds, as the starters and the composer file it: a twin, never a second message.
  const held = await propose(OFFER, { templates: [tpl(1, { language: "en_US" })] });
  assert.equal(said(held), C.MESSAGE_WORDS.twin("autumn_offer"));
  // A Spanish one held under es is the Spanish card's twin, and not the English card's.
  const spanish = { templates: [tpl(1, { language: "es" })] };
  assert.equal(said(await propose({ ...OFFER, language: "es" }, spanish)), C.MESSAGE_WORDS.twin("autumn_offer"));
  assert.equal((await propose(OFFER, spanish)).isError, false);
});

test("a language of a message held in another, said as another kind or with other values, is refused in the door's words", async () => {
  const held = { templates: [tpl(1, { language: "es", category: "utility" })] };
  const r = await propose(OFFER, held);
  assert.equal(r.isError, true);
  assert.equal(said(r), C.MESSAGE_BEGIN_WORDS.heldOtherwise("utility", 2));
  const fewer = await propose(OFFER, { templates: [tpl(1, { language: "es", variables: [] })] });
  assert.equal(said(fewer), C.MESSAGE_BEGIN_WORDS.heldOtherwise("marketing", 0));
});

test("every other refusal the door makes before filing is the card's, in the door's words: values out of order, an email naming a value the message has not", async () => {
  const gap = await propose({ ...OFFER, slots: [SLOTS[0], { ...SLOTS[1], position: 3 }] });
  assert.equal(gap.isError, true);
  assert.equal(said(gap), MESSAGE_VALUES_WORDS);
  const third = await propose({
    ...OFFER,
    versions: { ...OFFER.versions, email: { subject: "Hi", body: "Hi {{3}}" } },
  });
  assert.match(said(third), /\{\{3\}\} is not one of this message's values/);
  // A name a person typed is the name Meta takes; one with no letter in it is the door's refusal.
  const bare = await propose({ ...OFFER, name: "!!!" });
  assert.equal(said(bare), C.TEMPLATE_NAME_WORDS);
});

/* ------------------------------------------------------------------ the card */

test("an offer by WhatsApp and email is a card that quotes every version as the person reached on it reads it, says when each goes and who it reaches, and carries the door's body", async () => {
  const r = await propose(OFFER);
  assert.equal(r.isError, false, r.result);
  const p = r.proposal;
  assert.equal(p.kind, "message");
  assert.equal(p.needs, "operator");
  assert.equal(p.title, C.MESSAGE_WORDS.title("autumn_offer", "en_US"));
  const slots = SLOTS.map((s, i) => ({ ...s, example: ["Dani", "the business"][i] }));
  assert.deepEqual(p.payload, {
    name: "autumn_offer",
    language: "en_US",
    category: "marketing",
    versions: OFFER.versions,
    slots,
    said: [
      {
        channel: "whatsapp",
        label: "On WhatsApp",
        words: "Hi Dani, everything at the business is 10% off this month. Reply STOP to opt out.",
      },
      {
        channel: "email",
        label: "By email",
        words: "“This month at the business”\nHi Dani,\n\nEverything at the business is 10% off this month.",
      },
    ],
    follows: `${GOES} · ${C.consentGuardWords(["whatsapp", "email"], "marketing", "ours").join(" ")}`,
  });
  assert.ok(p.summary.endsWith(` · ${p.payload.follows}`), "the summary quotes the versions, then says what follows");
  // The summary: every version quoted through the one fill a send makes, then when each goes, then who it reaches.
  assert.ok(p.summary.startsWith("On WhatsApp: Hi Dani, everything at the business is 10% off"), p.summary);
  assert.ok(p.summary.includes(" · By email: “This month at the business” — Hi Dani, Everything at the business"));
  assert.ok(p.summary.includes(` · ${GOES} · `), p.summary);
  for (const line of C.consentGuardWords(["whatsapp", "email"], "marketing", "ours"))
    assert.ok(p.summary.includes(line), `who an offer reaches: ${line}`);
  assert.ok(p.summary.includes("yes to offers"), "an offer reaches only those who said yes to offers");
  assert.doesNotMatch(p.summary, /Meta/, "a person reads WhatsApp's review, never Meta's");
  assert.equal(p.undo, "Delete its email version");
  assert.match(JSON.parse(r.result).note, /Nothing has happened yet/);
  wroteNothing(r);
});

test("a message about their appointment in Spanish, on all three channels: each quoted in its own words in the page's channel order, the text with its STOP line, and the email and text go at once", async () => {
  const r = await propose(THANKS);
  assert.equal(r.isError, false, r.result);
  const p = r.proposal;
  assert.deepEqual(
    p.payload.said.map((s) => [s.channel, s.label]),
    [
      ["whatsapp", "On WhatsApp"],
      ["sms", "By text"],
      ["email", "By email"],
    ],
  );
  const text = p.payload.said.find((s) => s.channel === "sms").words;
  assert.ok(text.startsWith("Hola Dani, gracias por tu cita en the business."), text);
  assert.ok(text.endsWith(C.smsStopLine("es")), "a text as it goes, with the STOP line the sender adds");
  assert.ok(
    p.summary.includes(
      " · Goes by email and by text now; its WhatsApp version waits on WhatsApp's review (usually minutes, sometimes a day) · ",
    ),
    p.summary,
  );
  for (const line of C.consentGuardWords(["whatsapp", "sms", "email"], "conversational", "theirs"))
    assert.ok(p.summary.includes(line), line);
  // The versions an undo deletes, in the order the door files them: the email, then the text.
  assert.equal(p.undo, "Delete its email and text versions");
});

test("a message with no WhatsApp version goes at once, and one with WhatsApp alone waits on its review", async () => {
  const email = await propose(without(OFFER, "whatsapp"));
  assert.ok(email.proposal.summary.includes(" · Goes by email now · "), email.proposal.summary);
  assert.doesNotMatch(email.proposal.summary, /review/);
  const wa = await propose(without(OFFER, "email"));
  assert.ok(
    wa.proposal.summary.includes(
      " · Its WhatsApp version waits on WhatsApp's review (usually minutes, sometimes a day) · ",
    ),
    wa.proposal.summary,
  );
  assert.equal(wa.proposal.undo, null, "nothing an undo can delete: WhatsApp holds its version");
});

test("a viewer is not offered the action; every role is still offered at most twenty tools, and an operator and above the message", async () => {
  for (const role of ["viewer", "operator", "partner", "owner"]) {
    const tools = toApiTools(role, true);
    assert.ok(tools.length <= 20, `${role}: ${tools.length} tools`);
    const campaign = tools.find((t) => t.name === "propose_campaign");
    assert.equal(campaign?.input_schema.properties.action.enum.includes("message") ?? false, role !== "viewer", role);
  }
  const r = await propose(OFFER, {}, "viewer");
  assert.equal(r.isError, true);
  assert.equal(r.proposal, null);
});

/* ------------------------------------------------------------------ the spec */

const card = (payload) => ({
  id: "p-1",
  kind: "message",
  needs: "operator",
  title: "t",
  summary: "s",
  payload,
  undo: null,
});
/** What POST templates/message answers (WriteMessageAnswer): every version filed, WhatsApp's in review. */
const FILED = {
  name: "thanks_for_coming",
  language: "es",
  versions: [
    { channel: "email", id: V(1), state: "approved" },
    { channel: "sms", id: V(2), state: "approved" },
    { channel: "whatsapp", id: V(3), state: "pending" },
  ],
};

test("the spec: an operator's, gated by approve; the commit is POST templates/message with the door's body, and a card that names no message commits nothing", async () => {
  const spec = C.PROPOSAL_SPECS.message;
  assert.ok(spec, "a spec for the kind");
  assert.deepEqual([spec.needs, spec.gate, C.PROPOSAL_GATE.message], ["operator", "approve", "approve"]);
  const p = (await propose(THANKS)).proposal;
  assert.deepEqual(spec.commit(p, { settings: null }), {
    route: "POST templates/message",
    body: {
      name: "thanks_for_coming",
      language: "es",
      category: "utility",
      versions: THANKS.versions,
      slots: SLOTS.map((s, i) => ({ ...s, example: ["Dani", "the business"][i] })),
    },
  });
  for (const broken of [
    { ...p.payload, name: "" },
    { ...p.payload, versions: {} },
    { ...p.payload, versions: null },
  ])
    assert.deepEqual(spec.commit(card(broken), { settings: null }), { refused: C.PROPOSAL_WORDS.cannotApprove });
  assert.equal(spec.open(card(p.payload), null), "messages", "the Library");
  assert.equal(C.cardOpenRoute({ kind: "message", payload: p.payload }), "messages");
});

test("the receipt says what the door filed and what it refused, from its answer", () => {
  const spec = C.PROPOSAL_SPECS.message;
  const p = card({ name: "thanks_for_coming", versions: THANKS.versions });
  assert.equal(
    spec.receipt(p, FILED),
    "“thanks_for_coming” is in the Library — its email version is ready; its text version is ready; its WhatsApp version is with WhatsApp for review",
  );
  const refused = {
    ...FILED,
    versions: FILED.versions.slice(0, 2),
    refused: { channel: "whatsapp", words: C.LIBRARY_WORDS.writeNeedsNumber },
  };
  assert.equal(
    spec.receipt(p, refused),
    `“thanks_for_coming” is in the Library — its email version is ready; its text version is ready · its WhatsApp version was not filed: ${C.LIBRARY_WORDS.writeNeedsNumber}`,
  );
  assert.equal(
    spec.receipt(p, { name: "thanks_for_coming", versions: [], refused: { channel: "email", words: "No." } }),
    "“thanks_for_coming” was not filed: No.",
  );
  const approved = { ...FILED, versions: [{ channel: "whatsapp", id: V(3), state: "approved" }] };
  assert.equal(spec.receipt(p, approved), "“thanks_for_coming” is in the Library — its WhatsApp version is approved");
});

test("the undo keeps the email and text versions the door filed, deletes each through its own door within ten minutes, and leaves the WhatsApp version, saying so", () => {
  const spec = C.PROPOSAL_SPECS.message;
  const p = card({ name: "thanks_for_coming", versions: THANKS.versions });
  assert.equal(spec.undo.window, "ten_minutes");
  const kept = spec.undo.record(p, FILED, { settings: null });
  assert.deepEqual(kept, {
    versions: [
      { channel: "email", id: V(1) },
      { channel: "sms", id: V(2) },
    ],
    whatsapp: "pending",
  });
  assert.deepEqual(spec.undo.call(kept, { settings: null }), [
    { route: "DELETE templates/versions/[id]", params: { id: V(1) } },
    { route: "DELETE templates/versions/[id]", params: { id: V(2) } },
  ]);
  assert.equal(
    spec.undo.receipt({ deleted: true }, kept),
    `Its email and text versions are deleted. Its WhatsApp version stays: WhatsApp holds it, and it is deleted from ${C.CAMPAIGN_ROOMS.home} › ${C.CAMPAIGN_ROOMS.library}`,
  );
  const emailOnly = spec.undo.record(p, { ...FILED, versions: FILED.versions.slice(0, 1) }, { settings: null });
  assert.deepEqual(emailOnly, { versions: [{ channel: "email", id: V(1) }], whatsapp: null });
  assert.equal(spec.undo.receipt({ deleted: true }, emailOnly), "Its email version is deleted");
  // WhatsApp's alone, or nothing filed: nothing the undo may delete, so none is kept.
  assert.equal(spec.undo.record(p, { ...FILED, versions: FILED.versions.slice(2) }, { settings: null }), null);
  assert.equal(spec.undo.record(p, { name: "x", versions: [] }, { settings: null }), null);
  assert.deepEqual(spec.undo.call({ versions: [] }, { settings: null }), { refused: C.PROPOSAL_WORDS.noUndo });
  // Open for ten minutes from the commit, as every kind's undo without a window of its own.
  const T = Date.UTC(2026, 9, 10, 12);
  assert.equal(C.askUndoOpen("message", kept, T - 60_000, T, null), true);
  assert.equal(C.askUndoOpen("message", kept, T - C.ASK_UNDO_MS - 1, T, null), false);
});

/* ------------------------------------------------------------------ the walk */

test("Approve sends the card's body to POST templates/message, marked as a card's; Undo sends one DELETE per version kept, in order, each under its own key", async () => {
  const sent = [];
  const answers = {
    "POST /api/v1/templates/message": FILED,
    [`DELETE /api/v1/templates/versions/${V(1)}`]: { deleted: true, id: V(1), channel: "email" },
    [`DELETE /api/v1/templates/versions/${V(2)}`]: { deleted: true, id: V(2), channel: "sms" },
  };
  const client = createApi({
    fetch: async (url, init) => {
      const key = `${init.method} ${String(url).replace(/\?.*$/, "")}`;
      sent.push({
        key,
        body: init.body ? JSON.parse(init.body) : undefined,
        via: init.headers["x-via"],
        idem: init.headers["idempotency-key"],
      });
      const data = answers[key];
      if (!data)
        return new Response(JSON.stringify({ ok: false, error: { code: "not_found", message: key } }), { status: 404 });
      return new Response(JSON.stringify({ ok: true, data }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    workspace: () => A,
    onSignedOut: () => {},
    onChooseWorkspace: () => {},
    refresh: async () => {},
    now: () => 1_000,
  });
  const win = {
    __SETTINGS: null,
    location: { hash: "", pathname: "/w/harbor" },
    history: { pushState() {}, replaceState() {} },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    setTimeout: (fn) => {
      fn();
      return 1;
    },
  };
  const p = (await propose(THANKS)).proposal;
  const r = await commitProposal(win, p, client, Date.parse(p.made_at));
  assert.equal(r.ok, true, r.message);
  assert.equal(r.receipt, C.PROPOSAL_SPECS.message.receipt(p, FILED));
  assert.deepEqual(r.undo, {
    versions: [
      { channel: "email", id: V(1) },
      { channel: "sms", id: V(2) },
    ],
    whatsapp: "pending",
  });
  const u = await undoProposal(win, p, { state: "done", receipt: r.receipt, atMs: 1, undo: r.undo }, client);
  assert.equal(u.ok, true, u.message);
  assert.equal(u.receipt, C.PROPOSAL_SPECS.message.undo.receipt(null, r.undo));
  assert.deepEqual(
    sent.map((s) => [s.key, s.via, s.idem]),
    [
      ["POST /api/v1/templates/message", "ask", p.id],
      [`DELETE /api/v1/templates/versions/${V(1)}`, "ask", `${p.id}:undo`],
      [`DELETE /api/v1/templates/versions/${V(2)}`, "ask", `${p.id}:undo:2`],
    ],
  );
  assert.deepEqual(sent[0].body, C.PROPOSAL_SPECS.message.commit(p, { settings: null }).body);
  // A delete the door refuses stops the walk there, in the door's words; the versions deleted before it stay deleted.
  sent.length = 0;
  delete answers[`DELETE /api/v1/templates/versions/${V(2)}`];
  const half = await undoProposal(win, p, { state: "done", receipt: r.receipt, atMs: 1, undo: r.undo }, client);
  assert.equal(half.ok, false);
  assert.equal(sent.length, 2);
});

/* ------------------------------------------------------------------ through the door */

test("an approved card's body is what the door files: an offer by email alone, begun through the member's door and ready at once", async () => {
  setRateStore(memoryStore());
  const r = await propose(without(OFFER, "whatsapp"));
  assert.equal(r.isError, false, r.result);
  const call = C.PROPOSAL_SPECS.message.commit(r.proposal, { settings: null });
  const tables = world();
  let next = 900;
  // The service role's door a first version is begun through (create_message_version, 00343), modelled over the table.
  setServiceClient(
    fakeDb(
      tables,
      {},
      {
        create_message_version(a) {
          const row = tpl(next++, {
            channel: a.p_channel,
            name: a.p_name,
            language: a.p_language,
            body_preview: a.p_body,
            category: a.p_category,
            variables: a.p_variables,
          });
          tables.templates.push(row);
          return { id: row.id, channel: row.channel, name: row.name, language: row.language };
        },
      },
    ),
  );
  try {
    const ctx = { supabase: fakeDb(tables, {}, {}), userId: USER, email: "ada@example.com", params: {} };
    const answer = await messageRoute.POST.run(
      new Request(`http://localhost/api/v1/templates/message?workspace=${A}`, {
        method: "POST",
        body: JSON.stringify(call.body),
      }),
      ctx,
    );
    const row = tables.templates.find((t) => t.name === "autumn_offer");
    assert.deepEqual(
      [row.channel, row.language, row.category, row.meta_status],
      ["email", "en_US", "marketing", "approved"],
    );
    assert.deepEqual(answer, {
      name: "autumn_offer",
      language: "en_US",
      versions: [{ channel: "email", id: row.id, state: "approved" }],
    });
    // What the undo would delete is the row the door filed.
    const kept = C.PROPOSAL_SPECS.message.undo.record(r.proposal, answer, { settings: null });
    assert.deepEqual(C.PROPOSAL_SPECS.message.undo.call(kept, { settings: null }), [
      { route: "DELETE templates/versions/[id]", params: { id: row.id } },
    ]);
  } finally {
    setServiceClient(null);
  }
});
