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
import { installRoleStore } from "../_legacy-react.mjs";
import {
  CARRIER_CONSENT_SOURCE,
  CONSENT_RESET_SOURCE,
  CONSENT_SOURCES,
  DECISION_VERBS,
  PEOPLE_LISTS,
  consentSourceLabel,
  OFFERS_YES_SOURCES,
  offersYesRefusal,
  verbalOptInScript,
} from "@chanlytics/contracts";
import { readCode, readRaw } from "../_source.mjs";
import { personRow } from "../_person-row.mjs";

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
  const page = readCode("apps/dashboard/src/legacy/pages/people.jsx");
  // The rail's tip is the list's own (contracts BUILTIN_LISTS, decision 0009): it says which yes.
  assert.match(offers.tip, /^Said yes to OFFERS, separately/, "the rail explains which yes");
  // And the column titled Offers reads the offers answer.
  assert.ok(page.includes("const offers = PL_OFFERS[p.consent.marketing] || PL_OFFERS.unknown;"));
  assert.ok(page.includes("title={p.consent.marketingSub}"), "and its tooltip is that answer's own history");
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

test("the page: TWO asks, each asking how before it writes, a STOP is not undone by the desk", () => {
  const b = readCode("apps/dashboard/src/legacy-bridge/people-detail.ts");
  assert.ok(
    b.includes("window.__setPersonConsent = setPersonConsent;") &&
      b.includes("window.__consentSources = CONSENT_SOURCES;") &&
      b.includes("window.__verbalOptInScript = verbalOptInScript;"),
  );
  assert.ok(b.includes("window.__setPersonMarketingConsent = setPersonMarketingConsent;"));
  // One transport, the path chosen by purpose, so neither answer can be posted to
  // the other's door by a typo in a page.
  assert.ok(
    b.includes('conversational: "PUT contacts/[id]/consent",') &&
      b.includes('marketing: "PUT contacts/[id]/marketing-consent",'),
  );
  assert.ok(b.includes("api()(CONSENT_ROUTE[purpose]"));

  const p = readCode("apps/dashboard/src/legacy/pages/client-profile.jsx");
  // The same pair the public /yes page renders, so a reader can see that one may be
  // given without the other -- which is what error 30913 asked us to show.
  assert.ok(p.includes('testid="consent-control"') && p.includes('label="Messages about their visit"'));
  assert.ok(p.includes('testid="consent-marketing"') && p.includes('label="Offers and news"'));
  assert.ok(
    p.includes("value={p.consent.state}") && p.includes("value={p.consent.marketing}"),
    "each ask reads its OWN column",
  );
  // Each records through its own purpose, and its fold closes once the door takes it.
  assert.ok(
    p.includes('onRecord={recordAndClose("conversational", visitFold)}') &&
      p.includes('onRecord={recordAndClose("marketing", offersFold)}'),
  );
  assert.ok(p.includes("data-testid={`${testid}-how`}"), "a yes is not written until the page knows how it was given");
  assert.ok(
    p.includes('if (value !== "unknown") record("unknown", null);'),
    "the reset writes nothing when there is nothing to reset",
  );
  assert.ok(p.includes("Record a yes only if they have asked again themselves."), "a STOP is not undone by the desk");
  // A STOP stops offers too, so the offers ask has nothing to record while it stands.
  assert.ok(p.includes('canRecord={canRecord && p.consent.state !== "opted_out"}'));
  assert.ok(p.includes("They asked us to stop, which stops offers too."));
  assert.ok(!/Offers by WhatsApp/.test(p), "REGRESSION: one control labelled for offers, writing the other column");
});

/* -------------------------------------------------------------------------- *
 * The two asks, RENDERED — no browser, no jsdom, no React.
 *
 * The two hooks below are the two this component uses, so its body runs for
 * real: real branching, real clicks, real calls into whatever recorder it was
 * handed. registration-path.test.mjs names the same tradeoff — a source scan
 * answers "does this control write the column it is labelled for" badly, and
 * that is precisely the property that was broken. So it is executed instead.
 *
 * What was broken: ONE control labelled "Offers by WhatsApp" calling the
 * conversational door. Every string in the file agreed it was about offers; the
 * one line that mattered wrote `contacts.consent`. Only running it and watching
 * where the write goes catches that.
 * -------------------------------------------------------------------------- */
// The hooks are installed BEFORE the import and never replaced, because this file
// aliases them at module scope (`const { useState: useStateP } = React`). A harness
// that assigns them inside mount() -- as registration-path.test.mjs does, correctly
// for a page that calls `React.useState` at its use site -- hands this one
// `undefined`. So the globals are stable indirections and only what they DELEGATE to
// is swapped per mount.
let HOOKS = null;
// A5: the ask's refusal is drawn by the shared FieldError (data-bits.jsx, run for real in
// refusals-on-the-page.test.mjs). This harness never runs a component's function, so it draws
// that one hook-free component the way the component draws: the sentence as text, announced,
// under its testid -- and nothing without a sentence.
const FieldError = ({ message, testid }) =>
  message
    ? {
        type: "span",
        props: { className: "field-error", role: "alert", "data-testid": testid ?? undefined, children: [message] },
      }
    : null;
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) =>
    type === FieldError
      ? FieldError({ ...(p || {}) })
      : { type, props: { ...(p || {}), children: kids.flat(Infinity) } },
  useState: (init) => HOOKS.useState(init),
  useEffect: (fn) => HOOKS.useEffect(fn),
  useMemo: (fn) => HOOKS.useMemo(fn),
};
globalThis.window = { __ME: { role: "operator" }, FieldError };
// Who is acting, as data-bits asks it (mayAtLeast) of the role store the bridge completes.
installRoleStore(globalThis.window);
globalThis.mayAtLeast = (rung) => globalThis.window.ST_STORE.mayAtLeast(rung);
await import("../../../../apps/dashboard/src/legacy/pages/client-profile.jsx");
const Ask = globalThis.window.ConsentAsk;
assert.equal(typeof Ask, "function", "the ask is published, or nothing below tests anything");

const SOURCES = [
  { id: "in_person", label: "In person" },
  { id: "form", label: "Sign-up form" },
];

function mount(props) {
  const cells = [];
  let seq = 0;
  const hooks = {
    useState: (init) => {
      const k = seq++;
      if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init;
      return [
        cells[k],
        (v) => {
          cells[k] = typeof v === "function" ? v(cells[k]) : v;
        },
      ];
    },
    useEffect: () => {},
    useMemo: (fn) => {
      const k = seq++;
      if (!(k in cells)) cells[k] = fn();
      return cells[k];
    },
  };
  const draw = () => {
    HOOKS = hooks;
    seq = 0;
    return Ask(props);
  };
  let tree = draw();
  return {
    get tree() {
      return tree;
    },
    async click(node) {
      await node.props.onClick();
      tree = draw();
      await new Promise((r) => setImmediate(r));
      tree = draw();
    },
    type(node, value) {
      node.props.onChange({ target: { value } });
      tree = draw();
    },
  };
}

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  fn(n);
  for (const k of n.props?.children ?? []) walk(k, fn);
};
const buttons = (root) => {
  const out = [];
  walk(root, (n) => {
    if (n.type === "button") out.push(n);
  });
  return out;
};
const byLabel = (root, text) => buttons(root).find((b) => textOf(b) === text) ?? null;
const byId = (root, id) => {
  let hit = null;
  walk(root, (n) => {
    if (!hit && n.props?.["data-testid"] === id) hit = n;
  });
  return hit;
};
const textOf = (n) => {
  const out = [];
  const rec = (x) => {
    if (x == null || x === false || x === true) return;
    if (typeof x === "string" || typeof x === "number") {
      out.push(String(x));
      return;
    }
    if (Array.isArray(x)) {
      x.forEach(rec);
      return;
    }
    if (typeof x === "object") rec(x.props?.children);
  };
  rec(n);
  return out.join(" ").trim();
};

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
  // wired to `__setPersonConsent` did not do.
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

/**
 * The real profile, rendered the way a person opens it: the shell's globals, a
 * person's view model from the real mapper, the load effect run, then drawn again.
 * The harness above renders one control; nothing rendered the page that holds it.
 */
async function renderLoadedProfile(extra = {}) {
  const { toPersonVM, CONSENT_SOURCES } = await import("@chanlytics/contracts");
  const row = {
    id: "p-maria",
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
  const vm = toPersonVM(
    {
      row,
      identities: [],
      conversations: [],
      calls: [],
      escalations: [],
      decisions: [],
      receptionist_mode: null,
      workspace_reply_mode: "auto",
      ...extra,
    },
    ZONE,
    new Date("2026-09-10T12:00:00.000Z"),
  );
  // What the shell provides around a page: the real-workspace flag, who is signed in,
  // the sources, the loader, the toast, and the few components other files define.
  Object.assign(globalThis.window, {
    __PEOPLE: {},
    __ME: { role: "operator" },
    __consentSources: CONSENT_SOURCES,
    __personDetail: async () => vm,
    addEventListener: () => {},
    removeEventListener: () => {},
    usePPToast: () => [null, () => {}],
    // The shell's workspace list and the bridge's script, so the visit ask can
    // show the desk what to say -- the sentence the campaign files as method (3).
    __WORKSPACES: [
      { id: "t-1", slug: "marisas", name: "Marisa's Beauty Salon", status: "active", timezone: "America/New_York" },
    ],
    __ACTIVE_WORKSPACE: "t-1",
    __verbalOptInScript: verbalOptInScript,
  });
  for (const g of [
    "Icon",
    "ChannelGlyph",
    "ClientTag",
    "StatePill",
    "Confirm",
    "StatCell",
    "StatStrip",
    "MoreMenu",
    "TempBar",
  ])
    globalThis[g] ??= g;
  globalThis.React.useCallback ??= (fn) => fn;
  const Profile = globalThis.window.ClientProfile({ id: "p-maria" }).type;
  assert.equal(typeof Profile, "function", "a real workspace renders the real profile");

  const cells = [];
  let seq = 0;
  let effects = [];
  const hooks = {
    useState: (init) => {
      const k = seq++;
      if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init;
      return [
        cells[k],
        (v) => {
          cells[k] = typeof v === "function" ? v(cells[k]) : v;
        },
      ];
    },
    useEffect: (fn) => {
      effects.push(fn);
    },
    useMemo: (fn) => {
      const k = seq++;
      if (!(k in cells)) cells[k] = fn();
      return cells[k];
    },
  };
  const draw = () => {
    HOOKS = hooks;
    seq = 0;
    effects = [];
    return Profile({ id: "p-maria" });
  };
  draw();
  for (const e of effects) e();
  await new Promise((r) => setImmediate(r));
  return draw();
}

test("a real profile renders once its person loads", async () => {
  // THE CRASH. #313 declared `who` from `first` thirty-four lines above the line
  // that declares `first`, so every real profile threw the moment its person
  // loaded -- a const read before its line runs. Lint does not see it and the
  // build does not run it, so it is rendered here, loaded, with a real view model.
  const tree = await renderLoadedProfile();
  const asks = [];
  walk(tree, (n) => {
    if (n.type === Ask) asks.push(n.props.testid);
  });
  assert.deepEqual(
    asks,
    ["consent-control", "consent-marketing"],
    "it reached the consent rail, which it used to throw before drawing",
  );
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
  const asks = [];
  walk(tree, (n) => {
    if (n.type === Ask) asks.push(n.props);
  });
  assert.deepEqual(
    asks.map((a) => a.testid),
    ["consent-control", "consent-marketing"],
  );
  const [talk, offers] = asks;
  const all = CONSENT_SOURCES.map((s) => s.id);
  assert.deepEqual(
    talk.sources.map((s) => s.id),
    all,
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
    all,
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
      .map(textOf)
      .filter((t) => t !== "Cancel"),
    ["Sign-up form", "Their own message"],
  );
  assert.match(textOf(how), /A spoken yes is not enough for offers/);
  const no = mount({ ...offers, onRecord: async () => ({ ok: true }) });
  await no.click(byLabel(no.tree, "No"));
  assert.deepEqual(
    buttons(byId(no.tree, "consent-marketing-how"))
      .map(textOf)
      .filter((t) => t !== "Cancel"),
    ["In person", "On the phone", "Sign-up form", "Their own message"],
  );
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
        contact_id: "p-maria",
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
        contact_id: "p-maria",
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
  // The timeline is its own component (PersonTimeline), so it is expanded here
  // the way the page would expand it, and read from there.
  const found = [];
  walk(tree, (n) => {
    if (typeof n.type === "function" && n.type.name === "PersonTimeline") found.push(n);
  });
  assert.equal(found.length, 1, "the timeline is drawn once");
  const texts = [];
  walk(found[0].type(found[0].props), (n) => {
    for (const k of n.props?.children ?? []) if (typeof k === "string") texts.push(k);
  });
  const all = texts.join(" | ");
  assert.ok(all.includes("Said yes to messages about their visit"), all.slice(0, 400));
  assert.ok(all.includes("In their own words by text: “START”"), "the evidence, quoted");
  assert.ok(all.includes("Said yes to offers and news"));
  assert.ok(all.includes("Sign-up form, recorded by staff · signed at the desk"), "the way, and the recorder's note");
});
