/**
 * Consent as a recorded fact.
 *
 * A marketing message on WhatsApp needs the customer's yes, and the only yes
 * the product could record was a customer texting START. Now the person who
 * heard it at the desk or on the phone can record it: one definer door, a
 * ledger verb, a source that says how, the "Can receive offers" list, and a
 * profile control that will not write a yes until it knows how it was given.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  again,
  all,
  byTestId,
  fresh,
  installLegacyReact,
  installRoleStore,
  settle,
  textOf,
  unmount,
  walk,
} from "../_legacy-react.mjs";
import {
  CARRIER_CONSENT_SOURCE,
  CONSENT_RESET_SOURCE,
  CONSENT_SOURCES,
  DECISION_VERBS,
  PEOPLE_LISTS,
  consentSourceLabel,
  OFFERS_YES_SOURCES,
  offersYesRefusal,
  stateOf,
  verbalOptInScript,
} from "@chanlytics/contracts";
import { importSrc, readCode, readRaw } from "../_source.mjs";
import { personRow } from "./_person-row.mjs";

// People's table, from the code the page draws it with (surfaces/people/cells/columns.tsx), not a scan of it.
const { PL_COLUMNS } = await importSrc("apps/dashboard/src/surfaces/people/cells/columns.tsx");

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

test("the door: owner or operator, the three columns together, the ingest's own event, nothing for anon", () => {
  const m = readRaw("supabase/migrations/00043_consent_door.sql");
  assert.ok(m.includes("create or replace function public.set_contact_consent("));
  assert.ok(m.includes("security definer"));
  assert.ok(m.includes("v_user   uuid := auth.uid();"), "the caller is auth.uid(), never a parameter");
  assert.ok(
    m.includes("if v_tenant is null or not public.is_acting_member(v_tenant) then"),
    "viewers and strangers read as not found",
  );
  assert.ok(
    m.includes("set consent = p_consent, dnc = v_dnc,"),
    "consent and dnc move together, as the ingest moves them",
  );
  assert.ok(m.includes("'contact.consent_changed'"), "the same event the ingest writes");
  assert.ok(
    m.includes("revoke execute on function public.set_contact_consent(uuid, text, text, text) from public, anon;"),
  );
  assert.ok(
    m.includes("grant execute on function public.set_contact_consent(uuid, text, text, text) to authenticated;"),
  );
  assert.ok(
    m.includes("'consent_change'") && DECISION_VERBS.includes("consent_change"),
    "the ledger knows the verb on both sides",
  );
});

test("sources: four a person can pick, one reset that is never offered, words for each", () => {
  assert.deepEqual(
    CONSENT_SOURCES.map((s) => s.id),
    ["in_person", "phone", "form", "customer_message"],
  );
  assert.equal(CONSENT_RESET_SOURCE, "operator");
  assert.equal(consentSourceLabel("in_person"), "In person");
  assert.equal(consentSourceLabel("customer_message"), "Their own message");
  assert.equal(consentSourceLabel("operator"), null, "the reset is not a way of hearing an answer");
  assert.equal(consentSourceLabel(null), null);
  assert.equal(consentSourceLabel("import"), "import", "an unknown source is shown as itself, never hidden");
  // The carrier's report of a STOP (Twilio 21610) is not a way a MEMBER hears an answer, so it is not offered as
  // one; it is a source the ledger holds, and it has its own words wherever a source is said.
  assert.equal(CARRIER_CONSENT_SOURCE, "carrier");
  assert.ok(!CONSENT_SOURCES.some((s) => s.id === CARRIER_CONSENT_SOURCE), "never offered to a member");
  assert.equal(consentSourceLabel(CARRIER_CONSENT_SOURCE), "Reported by the carrier");
});

test("TWO lists, because there are two answers: one for messages, one for offers", () => {
  // THE DEFECT. One list was labelled "Can receive offers" and tested the
  // CONVERSATIONAL column -- which after 00095 is the one answer that says nothing
  // about offers. A person opening it to find their promotional audience was shown
  // everybody who had ever texted START, and the composer then refused all of them.
  // The id is unchanged: a saved broadcast's audience refers to it by id.
  const talk = PEOPLE_LISTS.find((l) => l.id === "opted_in");
  assert.equal(talk.label, "Said yes to messages");
  // A row as People reads it (_person-row.mjs): the list's rule reads the yes its builder works out (saidYesTo).
  const said = (consent, marketing, phone = "+13055550100") =>
    personRow({ consent, marketing_consent: marketing, phone_e164: phone });
  assert.equal(talk.test(said("opted_in", "unknown")), true);
  assert.equal(talk.test(said("unknown", "opted_in")), false, "not asked is not a yes");

  const offers = PEOPLE_LISTS.find((l) => l.id === "offers_ok");
  assert.equal(offers.label, "Can receive offers");
  assert.equal(offers.test(said("opted_in", "opted_in")), true);
  assert.equal(offers.test(said("opted_in", "unknown")), false, "a yes to messages is not a yes to offers");
  assert.equal(offers.test(said("opted_in", "opted_out")), false);
  // consentOf folds a STOP or a do-not-contact into BOTH answers, so this list can
  // never hold somebody who asked us to stop.
  assert.equal(offers.test(said("opted_out", "opted_out")), false);
  // CAN receive: the broadcast's own rule, number included. This list tested the
  // bare answer, so it showed people the route would then leave out of the very
  // broadcast the list's own button opens.
  assert.equal(
    offers.test(said("opted_in", "opted_in", null)),
    false,
    "a yes to offers with no number to send to is not somebody a broadcast can reach",
  );

  const at = (id) => PEOPLE_LISTS.findIndex((l) => l.id === id);
  assert.ok(at("opted_in") < at("offers_ok") && at("offers_ok") < at("opted_out"), "the two yeses, then the no");
  // The rail's tip is the list's own (contracts BUILTIN_LISTS, decision 0009): it says which yes.
  assert.match(offers.tip, /^Said yes to OFFERS, separately/, "the rail explains which yes");
  // And the column titled Offers reads the offers answer: drawn for a person who said yes to messages only, and for
  // one who said yes to offers only, it says what the OFFERS answer says, whichever way the other one went.
  const offersColumn = PL_COLUMNS.find((c) => c.key === "offers");
  assert.equal(offersColumn.label, "Offers");
  const drawn = (consent, marketing) => {
    const p = personRow({ consent, marketing_consent: marketing });
    const td = offersColumn.cell(p, {});
    const [span] = td.props.children;
    return { p, td, word: span.props.children[0], cls: span.props.className };
  };
  assert.equal(drawn("opted_in", "unknown").word, "Not asked", "a yes to messages is not a yes to offers");
  assert.equal(drawn("unknown", "opted_in").word, "Yes");
  assert.equal(drawn("opted_in", "opted_out").word, "No");
  assert.match(drawn("unknown", "opted_in").cls, /\bcl-row-offers yes\b/);
  const yes = drawn("unknown", "opted_in");
  assert.equal(yes.td.props["data-testid"], "row-offers");
  assert.equal(yes.td.props.title, yes.p.consent.marketingSub, "and its tooltip is that answer's own history");
});

test("the second door: an operator can record a signed marketing consent", () => {
  // 00095 designed `set_marketing_consent` for "ONE function, two callers ... a
  // text from the customer and a person at the desk recording a form the customer
  // signed". Only the first was ever built, so the second was impossible -- and
  // both controls that looked like they did it wrote the other column.
  const r = readCode("apps/dashboard/app/api/v1/contacts/[id]/marketing-consent/route.ts");
  assert.ok(r.includes('role: "operator",'), "the front desk records answers");
  assert.ok(r.includes('rate: "consent",'));
  assert.ok(
    r.includes('const source = consent === "unknown" ? CONSENT_RESET_SOURCE : body?.source;'),
    "the same four sources and the same reset as its sibling",
  );
  assert.ok(
    r.includes('ctx.supabase.rpc("set_marketing_consent", {'),
    "the session client, so is_acting_member inside the door sees the caller",
  );
  assert.ok(
    r.includes("p_tenant_id: contact.tenant_id,"),
    "the tenant is the one the contact was READ from under RLS, never from the body",
  );
  assert.ok(
    r.includes("scope: contactScope,"),
    "the contact is the row: read under RLS in verbs.ts, a 404 when the caller cannot see it or it is erased",
  );
  assert.ok(
    /purpose: "marketing",\s*consent,\s*source,\s*note,\s*previous: contact\.marketing_consent \?\? null,/.test(r),
    "the ledger names the purpose",
  );
  assert.ok(
    !/set_contact_consent|p_note: null/.test(r),
    "REGRESSION: the marketing door must never write the conversational column",
  );
});

test("the route: operator or owner, a yes or a no needs its source, the reset needs none, the ledger keeps who and how", () => {
  const r = readCode("apps/dashboard/app/api/v1/contacts/[id]/consent/route.ts");
  assert.ok(r.includes('role: "operator",'), "the front desk records answers");
  assert.ok(r.includes('rate: "consent",'));
  assert.ok(r.includes('const source = consent === "unknown" ? CONSENT_RESET_SOURCE : body?.source;'));
  assert.ok(
    r.includes('ctx.supabase.rpc("set_contact_consent", {'),
    "the session client, so auth.uid() inside the door is the caller",
  );
  assert.ok(r.includes('recordDecision(ctx, contact.tenant_id, "contact", id, "consent_change", {'));
  assert.ok(
    readCode("apps/dashboard/src/server/rate-limit.ts").includes(
      'consent: { limit: 60, windowMs: MIN_MS, noun: "consent changes" }',
    ),
  );
});

/* -------------------------------------------------------------------------- *
 * The two asks, RENDERED — no browser, no jsdom.
 *
 * The ask and the page that holds it are TSX (surfaces/people/person). They are drawn here on the stub React the page tests
 * share (_legacy-react.mjs), so their bodies run for real: real branching, real clicks, real calls into whatever recorder
 * the ask was handed. The page is drawn over a wire that answers as the routes do, so the courier it imports
 * (people-detail.ts) makes the request it would make in the browser and the test reads that request.
 * registration-path.test.mjs names the same tradeoff — a source scan answers "does this control write the column it is
 * labelled for" badly, and that is precisely the property that was broken. So it is executed instead.
 *
 * What was broken: ONE control labelled "Offers by WhatsApp" calling the
 * conversational door. Every string in the file agreed it was about offers; the
 * one line that mattered wrote `contacts.consent`. Only running it and watching
 * where the write goes catches that.
 * -------------------------------------------------------------------------- */
installLegacyReact({ __DEMO_MODE: false, __chrome: { state: stateOf } });
const W = globalThis;
const PEOPLE = "../../../../apps/dashboard/src/surfaces/people";
const BRIDGE = "../../../../apps/dashboard/src/legacy-bridge";
// What the shell still provides around a person's page: who is signed in, the workspace's name (the desk's script says
// it), the shell's toast, and the role store the gates ask (the frame's, completed by the bridge).
const toasts = [];
Object.assign(W, {
  __ME: { role: "operator", id: "u-me" },
  __WORKSPACES: [{ id: "t-1", slug: "marisas", name: "Marisa's Beauty Salon", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "t-1",
  CHANLY: { nav() {} },
  usePPToast: () => [null, (t) => toasts.push(t)],
});
installRoleStore(W);
W.mayAtLeast = (rung) => W.ST_STORE.mayAtLeast(rung);
const quietly = async (fn) => {
  const e = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = e;
  }
};
const { ConsentAsk } = await import(`${PEOPLE}/person/consent-ask.tsx`);
const { ClientProfile } = await import(`${PEOPLE}/person/person-real.tsx`);
const { PersonTimeline } = await import(`${PEOPLE}/person/timeline.tsx`);
const { setPersonConsent, setPersonMarketingConsent } = await import(`${PEOPLE}/people-detail.ts`);
const { recFolds } = await import("../../../../apps/dashboard/src/surfaces/kit/record/registry.ts");
const { clearReadCaches } = await import(`${BRIDGE}/read-cache.ts`);
// What a write reads again after it lands (loaded by the client on a first write): loaded now, so a write's answer is
// not waiting on a module's first load while the test waits on the write.
await quietly(() => import(`${BRIDGE}/refresh-map.ts`));

const ID = "p-maria";
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/**
 * The wire: the person's read and the two consent doors, answered as the test says (`refuse` is the sentence a door
 * refuses with), and every request kept.
 */
const wire = { calls: [], person: null, refuse: null };
W.fetch = async (url, init = {}) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  const method = init.method || "GET";
  wire.calls.push({ method, path: u.pathname, body: init.body ? JSON.parse(init.body) : null });
  await settle();
  if (method === "GET" && u.pathname === `/api/v1/contacts/${ID}`)
    return json(200, { ok: true, data: { person: wire.person } });
  if (method === "PUT" && u.pathname.startsWith(`/api/v1/contacts/${ID}/`))
    return wire.refuse
      ? json(422, { ok: false, error: { code: "invalid", message: wire.refuse } })
      : json(200, { ok: true, data: {} });
  return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
};
/** What the doors were asked, in order: the path and the body. */
const puts = () => wire.calls.filter((c) => c.method === "PUT").map((c) => [c.path, c.body]);
/** Let every write's answer, and what the page reads again after it, land. */
const quiet = async () => {
  for (let i = 0; i < 12; i += 1) await settle();
};

const asksOf = (tree) => all(tree, (n) => n.type === ConsentAsk).map((n) => n.props);
const buttons = (root) => all(root, (n) => n.type === "button");
const byLabel = (root, text) => buttons(root).find((b) => textOf(b).trim() === text) ?? null;
const byId = byTestId;

/**
 * One ask drawn on its own, as a person's page draws it, and the gestures on it. One ask at a time on the stub's
 * cells: a new mount is a new tree.
 */
function mount(props) {
  unmount();
  fresh();
  const draw = () => again(() => W.React.createElement(ConsentAsk, props));
  let tree = draw();
  return {
    get tree() {
      return tree;
    },
    async click(node) {
      await node.props.onClick();
      tree = draw();
      await settle();
      tree = draw();
    },
    type(node, value) {
      node.props.onChange({ target: { value } });
      tree = draw();
    },
  };
}

const SOURCES = [
  { id: "in_person", label: "In person" },
  { id: "form", label: "Sign-up form" },
];

test("an ask asks HOW before it writes anything, and a yes carries its source", async () => {
  const wrote = [];
  const m = mount({
    label: "Offers and news",
    value: "unknown",
    sources: SOURCES,
    canRecord: true,
    hint: "h",
    testid: "t",
    onRecord: async (consent, source) => {
      wrote.push({ consent, source });
      return { ok: true };
    },
  });

  // Arming is not writing. This is the property the control has always had and the
  // one a rewrite is most likely to lose.
  assert.equal(byId(m.tree, "t-how"), null, "not armed yet");
  await m.click(byLabel(m.tree, "Yes"));
  assert.deepEqual(wrote, [], "arming a yes writes nothing");
  assert.ok(byId(m.tree, "t-how"), "it asks how instead");

  await m.click(byLabel(m.tree, "Sign-up form"));
  assert.deepEqual(wrote, [], "a form waits for the note that says which (00137)");
  m.type(byId(m.tree, "t-note"), "Slip 12");
  await m.click(byId(m.tree, "t-note-save"));
  assert.deepEqual(wrote, [{ consent: "opted_in", source: "form" }], "and the source rides with it");
  assert.equal(byId(m.tree, "t-how"), null, "the ask closes after it lands");
});

test("the reset needs no source, and writes nothing when there is nothing to reset", async () => {
  const wrote = [];
  const rec = async (consent, source) => {
    wrote.push({ consent, source });
    return { ok: true };
  };

  const already = mount({
    label: "L",
    value: "unknown",
    sources: SOURCES,
    canRecord: true,
    hint: "h",
    testid: "t",
    onRecord: rec,
  });
  await already.click(byLabel(already.tree, "Not asked"));
  assert.deepEqual(wrote, [], "already 'not asked': nothing to do");

  const set = mount({
    label: "L",
    value: "opted_in",
    sources: SOURCES,
    canRecord: true,
    hint: "h",
    testid: "t",
    onRecord: rec,
  });
  await set.click(byLabel(set.tree, "Not asked"));
  assert.deepEqual(wrote, [{ consent: "unknown", source: null }], "a reset is immediate and carries no source");
});

test("a failed write leaves the answer alone and says so", async () => {
  const m = mount({
    label: "L",
    value: "unknown",
    sources: SOURCES,
    canRecord: true,
    hint: "h",
    testid: "t",
    onRecord: async () => ({ ok: false, message: "The carriers refused that." }),
  });
  await m.click(byLabel(m.tree, "Yes"));
  await m.click(byLabel(m.tree, "In person"));
  assert.match(textOf(m.tree), /The carriers refused that\./);
  // aria-pressed follows the SERVER's value, never the click, so a failed write
  // cannot leave the control claiming an answer nobody recorded.
  const yes = byLabel(m.tree, "Yes");
  assert.equal(yes.props["aria-pressed"], false);
});

test("a viewer cannot record, and the ask says who can", () => {
  const m = mount({
    label: "L",
    value: "unknown",
    sources: SOURCES,
    canRecord: false,
    hint: "Nothing recorded.",
    testid: "t",
    onRecord: async () => ({ ok: true }),
  });
  for (const b of ["Yes", "No", "Not asked"]) assert.equal(byLabel(m.tree, b).props.disabled, true, b);
  assert.match(textOf(m.tree), /Only an owner or operator can change this\./);
});

test("THE DEFECT: each ask writes the column it is labelled for", async () => {
  // The whole point. Two asks, two recorders, and the offers one must reach the
  // offers door -- which is what one control labelled "Offers by WhatsApp" and
  // wired to the conversational door did not do.
  const calls = [];
  const askFor = (label, purpose, value) =>
    mount({
      label,
      value,
      sources: SOURCES,
      canRecord: true,
      hint: "h",
      testid: purpose,
      onRecord: async (consent, source) => {
        calls.push({ purpose, consent, source });
        return { ok: true };
      },
    });

  const talk = askFor("Messages about their visit", "conversational", "unknown");
  await talk.click(byLabel(talk.tree, "Yes"));
  await talk.click(byLabel(talk.tree, "In person"));

  const offers = askFor("Offers and news", "marketing", "unknown");
  await offers.click(byLabel(offers.tree, "Yes"));
  await offers.click(byLabel(offers.tree, "Sign-up form"));
  offers.type(byId(offers.tree, "marketing-note"), "Slip 12");
  await offers.click(byId(offers.tree, "marketing-note-save"));

  assert.deepEqual(
    calls,
    [
      { purpose: "conversational", consent: "opted_in", source: "in_person" },
      { purpose: "marketing", consent: "opted_in", source: "form" },
    ],
    "each ask reached its own door, in the register it is labelled for",
  );
});

/** A person as the People read holds them: a number, a name, no answer on either question. */
const ROW = {
  id: ID,
  display_name: "Maria Lopez",
  wa_profile_name: null,
  phone_e164: "+13055550134",
  consent: "unknown",
  consent_source: null,
  consent_updated_at: null,
  marketing_consent: "unknown",
  marketing_consent_source: null,
  marketing_consent_updated_at: null,
  dnc: false,
  channels: ["whatsapp"],
  conversation_count: 0,
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: null,
  latest_state: null,
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: null,
  last_message_at: null,
  last_message_direction: null,
  last_message_sender: null,
  last_inbound_text: null,
  last_inbound_at: null,
  last_call_at: null,
  last_inbound_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: null,
  earliest_row_at: null,
  has_backfill: false,
  has_chat: false,
  queued_reply_at: null,
};

/**
 * The real profile, rendered the way a person opens it: the shell's globals, the courier's read over the wire (a person's
 * view model from the real mapper), drawn again once it has landed. The harness above renders one control; nothing
 * rendered the page that holds it.
 */
async function renderLoadedProfile(extra = {}) {
  wire.person = {
    row: ROW,
    identities: [],
    conversations: [],
    calls: [],
    escalations: [],
    decisions: [],
    receptionist_mode: null,
    workspace_reply_mode: "auto",
    ...extra,
  };
  wire.calls.length = 0;
  wire.refuse = null;
  // The last tree goes away as React unmounts it (its cleanups let go of the registry and the window) before a new one.
  unmount();
  recFolds.reset();
  clearReadCaches();
  fresh();
  const draw = () => W.React.createElement(ClientProfile, { id: ID });
  let tree = draw();
  // A person the tab does not hold is nothing of theirs until their whole page is in.
  for (let i = 0; i < 400 && asksOf(tree).length === 0; i += 1) {
    await settle();
    tree = again(draw);
  }
  return tree;
}

test("the page: TWO asks, each asking how before it writes, a STOP is not undone by the desk", async () => {
  // One transport, the path chosen by purpose, so neither answer can be posted to the other's door by a typo in a page:
  // the courier the page imports is run over the wire, and the two requests it makes are read.
  wire.calls.length = 0;
  wire.refuse = null;
  assert.equal((await setPersonConsent(ID, { consent: "opted_in", source: "in_person" })).ok, true);
  assert.equal(
    (await setPersonMarketingConsent(ID, { consent: "opted_in", source: "form", note: "Slip 12" })).ok,
    true,
  );
  assert.deepEqual(puts(), [
    [`/api/v1/contacts/${ID}/consent`, { consent: "opted_in", source: "in_person" }],
    [`/api/v1/contacts/${ID}/marketing-consent`, { consent: "opted_in", source: "form", note: "Slip 12" }],
  ]);
  await quiet();

  // The same pair the public /yes page renders, so a reader can see that one may be given without the other -- which is
  // what error 30913 asked us to show. Each ask reads its OWN column: here the answers differ.
  const tree = await renderLoadedProfile({
    row: {
      ...ROW,
      consent: "opted_in",
      consent_source: "in_person",
      marketing_consent: "opted_out",
      marketing_consent_source: "customer_message",
    },
  });
  const [talk, offers, ...more] = asksOf(tree);
  assert.deepEqual(more, [], "two asks, no third");
  assert.deepEqual([talk.testid, talk.label], ["consent-control", "Messages about their visit"]);
  assert.deepEqual([offers.testid, offers.label], ["consent-marketing", "Offers and news"]);
  assert.deepEqual([talk.value, offers.value], ["opted_in", "opted_out"], "each ask reads its OWN column");
  assert.deepEqual([talk.canRecord, offers.canRecord], [true, true], "an operator records both");

  // Each records through its own purpose, and its fold closes once the door takes it.
  wire.calls.length = 0;
  recFolds.request("person-visit");
  assert.equal(recFolds.open(), "person-visit");
  assert.equal((await talk.onRecord("opted_in", "in_person")).ok, true);
  assert.equal(recFolds.open(), null, "the visit ask's fold closed");
  recFolds.request("person-offers");
  assert.equal(recFolds.open(), "person-offers");
  assert.equal((await offers.onRecord("opted_in", "form", { note: "Slip 12" })).ok, true);
  assert.equal(recFolds.open(), null, "the offers ask's fold closed");
  assert.deepEqual(puts(), [
    [`/api/v1/contacts/${ID}/consent`, { consent: "opted_in", source: "in_person" }],
    [`/api/v1/contacts/${ID}/marketing-consent`, { consent: "opted_in", source: "form", note: "Slip 12" }],
  ]);
  await quiet();
  // A door that refuses leaves its fold open, with what it said.
  wire.refuse = "The carriers refused that.";
  recFolds.request("person-offers");
  const refused = await offers.onRecord("opted_in", "form", { note: "Slip 13" });
  assert.equal(refused.ok, false);
  assert.equal(recFolds.open(), "person-offers", "a refused answer is not a closed fold");
  wire.refuse = null;
  await quiet();

  // "Not asked" and the way a yes is asked are the ask's own (the mounts above): a yes is not written until the page
  // knows how it was given, and the reset writes nothing when there is nothing to reset.

  // A STOP is not undone by the desk, and it stops offers too, so the offers ask has nothing to record while it stands.
  const stopped = asksOf(
    await renderLoadedProfile({ row: { ...ROW, consent: "opted_out", consent_source: "customer_message" } }),
  );
  assert.equal(stopped.length, 2);
  assert.ok(stopped[0].hint.includes("Record a yes only if they have asked again themselves."), stopped[0].hint);
  assert.equal(stopped[0].canRecord, true, "the visit ask may still record an answer");
  assert.equal(stopped[1].canRecord, false, "the offers ask has nothing to record while a STOP stands");
  assert.ok(stopped[1].hint.includes("They asked us to stop, which stops offers too."), stopped[1].hint);
  await quiet();

  // REGRESSION: one control labelled for offers, writing the other column.
  const said = [textOf(tree)];
  walk(tree, (n) => {
    for (const v of Object.values(n.props ?? {})) if (typeof v === "string") said.push(v);
  });
  assert.ok(
    !/Offers by WhatsApp/.test(said.join(" | ")),
    "REGRESSION: one control labelled for offers, writing the other column",
  );
});

test("a real profile renders once its person loads", async () => {
  // THE CRASH. #313 declared `who` from `first` thirty-four lines above the line
  // that declares `first`, so every real profile threw the moment its person
  // loaded -- a const read before its line runs. Lint does not see it and the
  // build does not run it, so it is rendered here, loaded, with a real view model.
  const tree = await renderLoadedProfile();
  assert.deepEqual(
    asksOf(tree).map((a) => a.testid),
    ["consent-control", "consent-marketing"],
    "it reached the consent rail, which it used to throw before drawing",
  );
  await quiet();
});

test("a yes to offers is written or it is not recorded; a no is honoured however it is said", () => {
  // Twilio lists "the opt-in process relies on verbal consent instead of written
  // consent" among the causes of 30913, and CTIA requires express written consent
  // for marketing. 00095's own comment said both of its callers were written
  // consent; its check let a spoken yes through. The rule, the route, the menus and
  // the database (00100) now say one thing.
  assert.deepEqual([...OFFERS_YES_SOURCES], ["form", "customer_message"]);
  assert.equal(offersYesRefusal("form"), null, "a form they signed");
  assert.equal(offersYesRefusal("customer_message"), null, "their own message");
  for (const spoken of ["in_person", "phone"]) {
    assert.match(offersYesRefusal(spoken), /in writing/, `${spoken}: a spoken yes is not one to offers`);
    assert.match(
      offersYesRefusal(spoken),
      /covers messages about their visit/,
      "and it says what a spoken yes IS good for",
    );
  }
  for (const other of ["operator", "", null, undefined, "import"])
    assert.ok(offersYesRefusal(other), `${String(other)} is not a written yes`);
  // Every way a desk can say a yes was given is on one side of the line or the
  // other: a new source has to be put somewhere on purpose.
  for (const s of CONSENT_SOURCES) {
    assert.ok(
      OFFERS_YES_SOURCES.includes(s.id) || ["in_person", "phone"].includes(s.id),
      `${s.id} is neither written nor spoken`,
    );
  }
});

test("on the loaded profile, the offers ask offers only written ways to say yes; a no, any way", async () => {
  // Rendered on the page, because that is where the narrowed sources are chosen --
  // and where the first version of this line crashed every profile by being put in
  // the wrong component, which this helper exists to catch.
  const tree = await renderLoadedProfile();
  const asks = asksOf(tree);
  assert.deepEqual(
    asks.map((a) => a.testid),
    ["consent-control", "consent-marketing"],
  );
  const [talk, offers] = asks;
  const every = CONSENT_SOURCES.map((s) => s.id);
  assert.deepEqual(
    talk.sources.map((s) => s.id),
    every,
    "a yes to messages about a visit may be given any way",
  );
  assert.equal(talk.yesSources, undefined);
  // And when the yes is spoken, the desk is shown what to ask: the sentence the
  // campaign files as its spoken opt-in, in this workspace's name (30896).
  assert.ok(
    talk.yesHow.includes(verbalOptInScript("Marisa's Beauty Salon")),
    "the script, verbatim, with the workspace's name",
  );
  assert.match(talk.yesHow, /^How did they tell you\? In person or on the phone, ask in these words: /);
  const spoken = mount({ ...talk, onRecord: async () => ({ ok: true }) });
  await spoken.click(byLabel(spoken.tree, "Yes"));
  assert.match(
    textOf(byId(spoken.tree, "consent-control-how")),
    /Would you like Marisa's Beauty Salon to text you/,
    "on the rendered ask, not only in its props",
  );
  assert.deepEqual(
    offers.sources.map((s) => s.id),
    every,
    "a NO to offers may be given any way, and is honoured",
  );
  assert.deepEqual(
    offers.yesSources.map((s) => s.id),
    ["form", "customer_message"],
    "a YES to offers, only in writing",
  );

  // And the ask, given exactly those props, offers exactly that.
  const yes = mount({ ...offers, onRecord: async () => ({ ok: true }) });
  await yes.click(byLabel(yes.tree, "Yes"));
  const how = byId(yes.tree, "consent-marketing-how");
  assert.deepEqual(
    buttons(how)
      .map((b) => textOf(b).trim())
      .filter((t) => t !== "Cancel"),
    ["Sign-up form", "Their own message"],
  );
  assert.match(textOf(how), /A spoken yes is not enough for offers/);
  const no = mount({ ...offers, onRecord: async () => ({ ok: true }) });
  await no.click(byLabel(no.tree, "No"));
  assert.deepEqual(
    buttons(byId(no.tree, "consent-marketing-how"))
      .map((b) => textOf(b).trim())
      .filter((t) => t !== "Cancel"),
    ["In person", "On the phone", "Sign-up form", "Their own message"],
  );
  await quiet();
});

test("on the loaded profile, a consent change is on the timeline with how we know", async () => {
  // The ledger rows existed and the route never read them; the owner could not
  // see when a person said yes, to what, or how. Rendered, not read: the timeline
  // is drawn by the page, and a kind the page did not know would have fallen
  // through its marks.
  const tree = await renderLoadedProfile({
    consent_history: [
      {
        id: "ev-1",
        contact_id: ID,
        at: "2026-09-01T14:00:00Z",
        purpose: "conversational",
        consent: "opted_in",
        previous: "unknown",
        source: "customer_message",
        by: null,
        note: null,
        channel: "sms",
        message_external_id: "SM1",
        words: "START",
      },
      {
        id: "ev-2",
        contact_id: ID,
        at: "2026-09-02T14:00:00Z",
        purpose: "marketing",
        consent: "opted_in",
        previous: "unknown",
        source: "form",
        by: "u-1",
        note: "signed at the desk",
        channel: null,
        message_external_id: null,
        words: null,
      },
    ],
  });
  // The timeline is its own component (PersonTimeline), drawn by the page: what it drew is read from there.
  const found = all(tree, (n) => n.type === PersonTimeline);
  assert.equal(found.length, 1, "the timeline is drawn once");
  const texts = [];
  walk(found[0], (n) => {
    for (const k of n.props?.children ?? []) if (typeof k === "string") texts.push(k);
  });
  const drawn = texts.join(" | ");
  assert.ok(drawn.includes("Said yes to messages about their visit"), drawn.slice(0, 400));
  assert.ok(drawn.includes("In their own words by text: “START”"), "the evidence, quoted");
  assert.ok(drawn.includes("Said yes to offers and news"));
  assert.ok(drawn.includes("Sign-up form, recorded by staff · signed at the desk"), "the way, and the recorder's note");
  await quiet();
});
