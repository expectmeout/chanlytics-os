/**
 * Connect your WhatsApp number: Embedded Signup, end to end.
 *
 * Tech Provider approval makes it possible for a business to connect its
 * own number and have the receptionist answer on it; nothing in the product
 * did that. Now: a Vault write function the service role alone may call,
 * an edge endpoint that turns the sign-up code into the business's token
 * and registers the number, a dashboard route that proves the owner and
 * keeps the ledger, a browser flow around Meta's SDK, the account's own
 * webhooks routed by WABA onto the alert path, and a Settings row that says
 * exactly why it cannot start when it cannot.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DECISION_SUBJECTS, DECISION_VERBS, connectionRows, toChannelVM } from "@chanlytics/contracts";
import { readCode, readRaw } from "../_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("the migration: one definer door writes a credential, service role only, named by the channel; the ledger learns the verb", () => {
  const m = readRaw("supabase/migrations/00042_channel_connect.sql");
  assert.ok(m.includes("create or replace function public.put_channel_credentials(p_channel_id uuid, p_secret jsonb)"));
  assert.ok(m.includes("security definer"));
  assert.ok(
    m.includes("v_name text := 'wa-creds-' || p_channel_id::text;"),
    "the secret is named by the channel, never by the tenant or the number",
  );
  assert.ok(
    m.includes("perform vault.update_secret(v_id, p_secret::text);"),
    "a second connection updates, never duplicates",
  );
  assert.ok(
    m.includes(
      "revoke execute on function public.put_channel_credentials(uuid, jsonb) from public, anon, authenticated;",
    ),
    "the session client cannot write a credential",
  );
  assert.ok(m.includes("'connect_channel'") && m.includes("'channel'"));
  assert.ok(
    DECISION_VERBS.includes("connect_channel") && DECISION_SUBJECTS.includes("channel"),
    "the contract carries the same vocabulary",
  );
});

test("the graph module: one version, the app secret spent on the edge and nowhere else, one default app id, the configuration's name documented", () => {
  // The two edge doors themselves -- the knock, the four Graph calls in order
  // as the app this deployment speaks for, the write scoped to the workspace,
  // the token into Vault, a failed credential write disabling the row, the
  // answer naming what is missing -- are run in whatsapp-connect-door.test.mjs;
  // /api/diag introspecting tokens as the same app is run in diag-door.test.mjs.
  const g = readCode("apps/edge/lib/whatsapp/meta-graph.ts");
  assert.ok(g.includes('export const GRAPH_VERSION = "v25.0";'));
  assert.ok(
    g.includes("client_secret: appSecret") &&
      !readCode("apps/dashboard/src/server/connections/whatsapp.ts").includes("META_APP_SECRET"),
    "the app secret is spent on the edge and nowhere else",
  );
  // One place knows which Meta app this deployment speaks for: the sign-up
  // and the token introspection can never disagree about it.
  assert.ok(g.includes('export const DEFAULT_META_APP_ID = "1823820738182125";'));
  assert.ok(readRaw("apps/edge/.env.example").includes("META_ES_CONFIG_ID="), "the new name is documented");
});

test("the graph helpers: E.164 out of Meta's display form, a six-digit PIN, the already-registered answer", async () => {
  const mod = await import(pathToFileURL(path.join(here, "../../../../apps/edge/lib/whatsapp/meta-graph.ts")).href);
  assert.equal(mod.toE164("+1 555-123-4567"), "+15551234567");
  assert.equal(mod.toE164("+44 20 7946 0958"), "+442079460958");
  assert.equal(mod.toE164(undefined), null);
  assert.equal(mod.toE164("12"), null);
  assert.match(mod.newPin(), /^\d{6}$/);
  assert.equal(
    mod.alreadyRegistered({ ok: false, error: "This phone number is already registered.", code: 133010, status: 400 }),
    true,
  );
  assert.equal(
    mod.alreadyRegistered({ ok: false, error: "Invalid OAuth access token", code: 190, status: 401 }),
    false,
  );
  assert.equal(mod.alreadyRegistered({ ok: true, data: {} }), false);
  assert.equal(
    mod.pinMismatch({ ok: false, error: "Two step verification PIN Mismatch", code: 133005, status: 400 }),
    true,
  );
  assert.equal(mod.pinMismatch({ ok: false, error: "(#100) Invalid parameter", code: 100, status: 400 }), false);
  assert.equal(mod.pinMismatch({ ok: true, data: { success: true } }), false);
});

test("the dashboard route: owner only, the settings rate bucket, the sign-up ids validated, the ledger keeps the connection in the owner's words", () => {
  const r = readCode("apps/dashboard/app/api/v1/channels/whatsapp/connect/route.ts");
  assert.ok(r.includes('role: "partner",'), "the owner's, or the partner's who set it up (0012)");
  assert.ok(r.includes('rate: "settings",'));
  assert.ok(
    r.includes("if ((phoneNumberId && !ID.test(phoneNumberId)) || (wabaId && !ID.test(wabaId)))"),
    "an id is validated only when the window gave one: the edge reads a missing one from the token's grant",
  );
  assert.ok(r.includes('recordDecision(ctx, member.tenantId, "channel", r.channelId, "connect_channel", {'));
  assert.ok(r.includes('"upstream_meta"'), "Meta is the upstream that failed, not the model");
  assert.ok(r.includes('number_taken: "That number is already connected to another workspace."'));
  assert.ok(r.includes("pin_required:"), "the PIN wall has its own words");
  const svc = readCode("apps/dashboard/src/server/connections/whatsapp.ts");
  assert.ok(
    svc.includes('if (!deployment.providersLive) return { ok: false, reason: "preview" };'),
    "a preview never connects a real number",
  );
  assert.ok(
    svc.includes('"/api/admin/whatsapp/connect"') && svc.includes('callEdge("/api/admin/whatsapp/signup-config"'),
  );
  const sr = readCode("apps/dashboard/app/api/v1/channels/whatsapp/signup/route.ts");
  assert.ok(sr.includes("canConnect: !!ROLE_PERMS[member.role]?.disconnect && cfg.ready"));
});

test("the browser flow: Meta's SDK loaded once, the ids read only from facebook.com, a cancel is a cancel, the code goes to the app's own route", async () => {
  // Moved from legacy-bridge/whatsapp-connect.ts with Settings › Connections (decision 0015 step 11).
  const mod = await import(
    pathToFileURL(path.join(here, "../../../../apps/dashboard/src/surfaces/settings/connections/whatsapp.ts")).href
  );
  assert.deepEqual(
    mod.parseSignupMessage(
      "https://www.facebook.com",
      JSON.stringify({
        type: "WA_EMBEDDED_SIGNUP",
        event: "FINISH",
        data: { phone_number_id: "123456789", waba_id: "987654321" },
      }),
    ),
    { phone_number_id: "123456789", waba_id: "987654321" },
  );
  assert.deepEqual(
    mod.parseSignupMessage("https://web.facebook.com", {
      type: "WA_EMBEDDED_SIGNUP",
      event: "CANCEL",
      data: { current_step: "BUSINESS_INFO" },
    }),
    { cancelled: true },
  );
  // What Meta's window says as it finishes is heard from any of Meta's hosts (Meta's own sample: an origin ending in
  // facebook.com), held to https and to the domain itself. Two hosts named outright heard nothing from a third (8 October).
  const finish = JSON.stringify({
    type: "WA_EMBEDDED_SIGNUP",
    event: "FINISH",
    data: { phone_number_id: "1234567", waba_id: "7654321" },
  });
  for (const origin of [
    "https://www.facebook.com",
    "https://web.facebook.com",
    "https://business.facebook.com",
    "https://facebook.com",
  ])
    assert.deepEqual(
      mod.parseSignupMessage(origin, finish),
      { phone_number_id: "1234567", waba_id: "7654321" },
      origin,
    );
  for (const origin of [
    "https://evil.example",
    "https://notfacebook.com",
    "https://facebook.com.evil.example",
    "http://www.facebook.com",
    "null",
    "",
  ])
    assert.equal(mod.parseSignupMessage(origin, finish), null, `${origin || "(empty)"}: not Meta's own page`);
  // The account alone (its number is added later), and whichever id a finish names: the edge reads the rest from the token.
  const said = (event, data) =>
    mod.parseSignupMessage("https://www.facebook.com", JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event, data }));
  assert.deepEqual(said("FINISH_ONLY_WABA", { waba_id: "7654321", business_id: "1" }), {
    phone_number_id: null,
    waba_id: "7654321",
  });
  assert.deepEqual(said("FINISH", { waba_ids: ["7654321"] }), { phone_number_id: null, waba_id: "7654321" });
  assert.deepEqual(said("FINISH", { phone_number_id: "1234567" }), { phone_number_id: "1234567", waba_id: null });
  assert.equal(said("FINISH", {}), null, "a finish that names nothing is nothing heard");
  assert.equal(mod.parseSignupMessage("https://www.facebook.com", "not json"), null);
  assert.equal(mod.parseSignupMessage("https://www.facebook.com", { type: "OTHER" }), null);
  const src = readCode("apps/dashboard/src/surfaces/settings/connections/whatsapp.ts");
  assert.ok(src.includes('const SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";'));
  assert.ok(
    /response_type: "code",\s*override_default_response_type: true/.test(src),
    "a code, never a user token, reaches this page",
  );
  assert.ok(src.includes('api()("POST channels/whatsapp/connect"'));
  assert.ok(!src.includes("access_token"), "no credential passes through the browser");
  // The pane imports the flow's object (`waConnect`); nothing publishes it on the window, so the app installs nothing. Meta's
  // door as the tab last read it (`held`) is what the row draws in its first frame (settings/frame/pane-reads.ts).
  assert.deepEqual(Object.keys(mod.waConnect).sort(), ["config", "held", "prepare", "start"]);
  assert.ok(!src.includes("installWhatsAppConnect"));
  assert.ok(!readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx").includes("installWhatsAppConnect"));
});

test("the account's own news: routed by WABA, kept as an event, alerted when it changes what the business can do", async () => {
  const mod = await import(pathToFileURL(path.join(here, "../../../../apps/edge/lib/whatsapp/waba-events.ts")).href);
  assert.ok(
    mod.WABA_FIELDS.has("phone_number_quality_update") &&
      mod.WABA_FIELDS.has("message_template_status_update") &&
      mod.WABA_FIELDS.has("account_update"),
  );
  const flagged = mod.describeWabaChange(
    { field: "phone_number_quality_update", value: { event: "FLAGGED", current_limit: "TIER_1K" } },
    "+15551234567",
  );
  assert.equal(flagged.alert, true);
  assert.ok(flagged.subject.includes("flagged") && flagged.body.includes("+15551234567"));
  const up = mod.describeWabaChange(
    { field: "phone_number_quality_update", value: { event: "UPGRADE", current_limit: "TIER_10K" } },
    null,
  );
  assert.equal(up.alert, false, "good news is kept, not alerted");
  assert.ok(up.body.includes("tier 10K"));
  const rejected = mod.describeWabaChange(
    {
      field: "message_template_status_update",
      value: { event: "REJECTED", message_template_name: "appointment_reminder", reason: "INVALID_FORMAT" },
    },
    "+15551234567",
  );
  assert.equal(rejected.alert, true);
  assert.ok(rejected.subject.includes("appointment_reminder") && rejected.body.includes("invalid format"));
  assert.equal(
    mod.describeWabaChange({ field: "account_update", value: { event: "PARTNER_REMOVED" } }, null).alert,
    true,
  );
  assert.equal(
    mod.describeWabaChange({ field: "phone_number_quality_update", value: { event: "SOMETHING_ELSE" } }, null),
    null,
  );

  // A template's news is not the number's news. Every alertable change used to
  // be sent as kind "number" -- a shield, warn amber, a door to Connections --
  // so "Template X approved" reached the bell as a warning about the phone
  // line. The change says which kind it is, because it is the only thing that
  // knows; the look follows in contracts, never from the title's spelling.
  const kindOf = (field, value) => {
    const d = mod.describeWabaChange({ field, value }, null);
    return d && `${d.kind}@${d.route}`;
  };
  assert.equal(
    kindOf("message_template_status_update", { event: "APPROVED", message_template_name: "save_our_number" }),
    "template_ready@campaigns/messages/save_our_number",
    "a template's news opens the message, in its own drawer",
  );
  assert.equal(
    kindOf("message_template_status_update", { event: "REJECTED", message_template_name: "x" }),
    "template_blocked@campaigns/messages/x",
  );
  assert.equal(
    kindOf("message_template_status_update", { event: "PAUSED", message_template_name: "x" }),
    "template_blocked@campaigns/messages/x",
  );
  assert.equal(
    kindOf("template_category_update", { message_template_name: "x", new_category: "MARKETING" }),
    "template_blocked@campaigns/messages/x",
    "it can still be sent, but only to a recorded yes",
  );
  assert.equal(
    kindOf("template_category_update", { message_template_name: "x", new_category: "UTILITY" }),
    "template_ready@campaigns/messages/x",
  );
  for (const [field, value] of [
    ["phone_number_quality_update", { event: "FLAGGED" }],
    ["phone_number_quality_update", { event: "DOWNGRADE" }],
    ["account_update", { event: "PARTNER_REMOVED" }],
    ["account_review_update", { decision: "REJECTED" }],
  ])
    assert.equal(
      kindOf(field, value),
      "number@admin/integrations",
      `${field} ${JSON.stringify(value)} is the NUMBER's own health`,
    );
  // A template moved to another category: to marketing it is a restriction, to anything else news kept quietly, and a notice
  // that names nothing still says something. Held by value: these words are a function of their own (categoryWords).
  const category = (value) => mod.describeWabaChange({ field: "template_category_update", value }, null);
  assert.deepEqual(category({ message_template_name: "save_our_number", new_category: "MARKETING" }), {
    kind: "template_blocked",
    route: "campaigns/messages/save_our_number",
    about: { type: "template", id: "save_our_number" },
    subject: "Template “save_our_number” is now marketing",
    body: "Meta moved the template “save_our_number” to marketing. Sends that use it now need the customer's recorded yes.",
    alert: true,
  });
  assert.deepEqual(category({ message_template_name: "save_our_number", new_category: "UTILITY" }), {
    kind: "template_ready",
    route: "campaigns/messages/save_our_number",
    about: { type: "template", id: "save_our_number" },
    subject: "Template “save_our_number” is now utility",
    body: "Meta moved the template “save_our_number” to utility.",
    alert: false,
  });
  assert.deepEqual(category({}), {
    kind: "template_ready",
    route: "campaigns/messages",
    subject: "Template “a template” is now another category",
    body: "Meta moved the template “a template” to another category.",
    alert: false,
  });

  // A refused version is "refused" on the bell as it is on the Library's pill (D1-template-marks), and the notice is about
  // that message: it opens it in its own drawer (campaigns/messages/<name>) and says what it is about.
  const status = (event, extra = {}) =>
    mod.describeWabaChange(
      { field: "message_template_status_update", value: { event, message_template_name: "winback_offer", ...extra } },
      null,
    );
  assert.deepEqual(status("REJECTED", { reason: "TAG_CONTENT_MISMATCH" }), {
    kind: "template_blocked",
    route: "campaigns/messages/winback_offer",
    about: { type: "template", id: "winback_offer" },
    subject: "Template “winback_offer” refused",
    body: "WhatsApp refused the template “winback_offer” (tag content mismatch). It cannot be sent until it is revised and approved.",
    alert: true,
  });
  assert.equal(status("PAUSED").subject, "Template “winback_offer” paused");
  assert.equal(status("DISABLED").subject, "Template “winback_offer” disabled");
  assert.equal(status("APPROVED").subject, "Template “winback_offer” approved");
  assert.ok(!/reject/i.test(status("REJECTED").subject + status("REJECTED").body), "no one spells a refusal Rejected");
  // An event that names no template keeps the Library's own door, and names nothing it is about.
  const nameless = mod.describeWabaChange(
    { field: "message_template_status_update", value: { event: "REJECTED" } },
    null,
  );
  assert.deepEqual([nameless.route, nameless.about], ["campaigns/messages", undefined]);

  // Meta's decision on the display name (phone_number_name_update; entry.id is the WABA): approved is kept quietly, a decline is the
  // owner's to read with the way on and Meta's reason, in the words Connections' row uses; one in progress has no notice of its own.
  assert.ok(mod.WABA_FIELDS.has("phone_number_name_update"));
  const named = (value) => mod.describeWabaChange({ field: "phone_number_name_update", value }, "+15551234567");
  assert.deepEqual(
    named({
      display_phone_number: "15551234567",
      decision: "APPROVED",
      requested_verified_name: "Harbor Moving",
      rejection_reason: null,
    }),
    {
      kind: "number",
      route: "admin/integrations",
      subject: "WhatsApp display name approved",
      body: "Meta approved the display name “Harbor Moving”.",
      alert: false,
    },
  );
  assert.deepEqual(
    named({
      decision: "REJECTED",
      requested_verified_name: "Harbor Moving",
      rejection_reason: "NAME_FORMAT_UNACCEPTABLE",
    }),
    {
      kind: "number",
      route: "admin/integrations",
      subject: "WhatsApp display name declined",
      body: "Meta declined the display name “Harbor Moving” — change it in WhatsApp Manager. Meta's reason: name format unacceptable.",
      alert: true,
    },
  );
  for (const decision of ["PENDING", "DEFERRED", "SOMETHING_ELSE", undefined])
    assert.equal(named({ decision, requested_verified_name: "Harbor Moving" }), null, String(decision));
  // The webhook handling the account's fields by entry.id, before and instead
  // of routing by number, is run in whatsapp-door.test.mjs.
});

test("the Integrations pane offers the connection to an owner or says exactly why it cannot start", () => {
  // The pane is TSX now (moved from integrations-real.jsx): the row's test ids and the pane's verbs.
  const s = ["pane", "row"].map((f) => readCode(`apps/dashboard/src/surfaces/settings/connections/${f}.tsx`)).join(" ");
  assert.ok(
    s.includes('"verb:whatsapp-connect": "connect-whatsapp-btn"') &&
      s.includes('case "verb:whatsapp-connect":') &&
      // Keeping the WhatsApp Business app (decision 0073, R12): the same press, Meta's own flow for business app users.
      s.includes('case "verb:whatsapp-connect-keep": {'),
  );
  // The row itself runs (contracts' connectionRows) rather than being read.
  const NOW = Date.parse("2026-09-07T15:00:00Z");
  const channel = (status) =>
    toChannelVM(
      {
        id: "ch-wa",
        kind: "whatsapp",
        number_e164: "+13055550188",
        status,
        created_at: "2026-08-01T00:00:00Z",
        last_inbound_at: null,
      },
      new Date(NOW),
    );
  const whatsapp = (over) =>
    connectionRows(
      {
        channels: [],
        whatsapp: { ready: true, reason: null },
        lines: { rows: [], ready: false },
        lineRequestedAt: null,
        google: null,
        calendar: null,
        ...over,
      },
      NOW,
    ).find((r) => r.kind === "whatsapp");
  assert.equal(whatsapp({}).verb.to, "verb:whatsapp-connect", "offered where the workspace has no WhatsApp channel");
  for (const status of ["active", "disabled"])
    assert.equal(
      whatsapp({ channels: [channel(status)] }).verb.to,
      "campaigns/messages",
      `never over one it has (${status})`,
    );
  assert.deepEqual(
    [whatsapp({ whatsapp: undefined }).sentence, whatsapp({ whatsapp: undefined }).verb],
    ["Checking whether Chanlytics can connect a number…", null],
    "honest while asking",
  );
  assert.deepEqual(
    [whatsapp({ whatsapp: null }).sentence, whatsapp({ whatsapp: null }).verb],
    ["Chanlytics isn't set up to connect numbers yet.", null],
    "and an answer of nothing is not still asking",
  );
  assert.ok(
    whatsapp({ whatsapp: { ready: false, reason: "no_config_id" } }).sentence.includes(
      "the Embedded Signup configuration is missing on the Chanlytics side",
    ),
    "the missing piece is named, not hidden",
  );
  assert.ok(
    !s.includes("A WhatsApp number or a phone line is connected by Chanlytics when your workspace is set up."),
    "the old by-hand line is gone",
  );
  // The diag showing the gates that decide who is answered is run in diag-door.test.mjs.
});

test("a sign-up leaves a mark in the tab's sessionStorage while Meta's window is open and takes it away however it ends; a page that finds one left by a page that is gone can say so, and the page that is running the sign-up never does", async () => {
  const mod = await import(
    pathToFileURL(path.join(here, "../../../../apps/dashboard/src/surfaces/settings/connections/whatsapp.ts")).href
  );
  const MARK = "chanlytics.whatsapp.signup";
  const held = new Map();
  const ops = [];
  const storage = {
    getItem: (k) => held.get(k) ?? null,
    setItem: (k, v) => {
      ops.push(["set", k]);
      held.set(k, String(v));
    },
    removeItem: (k) => {
      ops.push(["remove", k]);
      held.delete(k);
    },
  };
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const whileRunning = [];
  const win = {
    sessionStorage: storage,
    location: { pathname: "/w/harbor", search: "", hash: "" },
    // Meta's door: asked first by every sign-up. While it is out the window has not opened, but the sign-up has begun.
    fetch: async () => {
      whileRunning.push([held.has(MARK), mod.signupLeftOpenAt(win)]);
      await gate;
      return new Response(
        JSON.stringify({
          ok: true,
          data: { app_id: null, config_id: null, graph_version: "v25.0", ready: false, reason: "no_config_id" },
        }),
        { status: 200 },
      );
    },
  };
  const realWindow = globalThis.window;
  globalThis.window = win;
  try {
    // A page that is gone left a mark: this one says when the sign-up began.
    const left = new Date(Date.now() - 5 * 60_000).toISOString();
    held.set(MARK, left);
    assert.equal(mod.signupLeftOpenAt(win), left);
    const running = mod.waConnect.start();
    await new Promise((resolve) => setImmediate(resolve));
    release();
    const result = await running;
    assert.deepEqual(
      [result.ok, result.reason],
      [false, "not_ready"],
      "Meta's door says it cannot start: the sign-up ends at once",
    );
    assert.deepEqual(
      whileRunning,
      [[true, null]],
      "while it ran there was a mark, and this page, which was running it, did not call it left behind",
    );
    assert.deepEqual(
      ops.map(([op]) => op),
      ["set", "remove"],
      "written when the sign-up began, taken away when it ended, whatever it came to",
    );
    assert.equal(held.has(MARK), false);
    assert.equal(mod.signupLeftOpenAt(win), null, "and nothing is left behind once it has ended");

    // Storage that is blocked: no mark is made, nothing throws, and no page claims a sign-up it cannot know of.
    const blocked = () => {
      throw new Error("storage is blocked");
    };
    win.sessionStorage = { getItem: blocked, setItem: blocked, removeItem: blocked };
    assert.equal(mod.signupLeftOpenAt(win), null);
    assert.equal((await mod.waConnect.start()).reason, "not_ready");
  } finally {
    if (realWindow === undefined) delete globalThis.window;
    else globalThis.window = realWindow;
  }
});

/** Meta's door as a deployment answers it where a number can be connected (made-up ids). */
const DOOR = {
  app_id: "100000000000001",
  config_id: "200000000000002",
  graph_version: "v25.0",
  ready: true,
  reason: null,
  canConnect: true,
};
const SIGNUP_MARK = "chanlytics.whatsapp.signup";
const turn = () => new Promise((resolve) => setImmediate(resolve));
/** What a sign-up came to, or "still waiting" where it has not answered in half a second: one that hangs is a failure, not a test that never ends. */
const within = (running) =>
  Promise.race([running, new Promise((resolve) => setTimeout(() => resolve("still waiting"), 500))]);

/**
 * A browser as the sign-up meets it: Meta's door answered over fetch, Meta's SDK arriving a turn after its script tag is added (or
 * refused: `sdk` false), and the window the SDK asks the browser for when a sign-up begins, which the browser gives or refuses
 * (`opens`). `standalone` is an iPhone's word for a page opened from the home screen.
 */
function browser({ opens = true, sdk = true, standalone = false } = {}) {
  const b = {
    opens,
    sdk,
    fetched: [],
    sent: [],
    scripts: [],
    asked: [],
    inits: [],
    logins: [],
    listeners: new Set(),
    held: new Map(),
  };
  const fb = {
    init: (o) => b.inits.push(o),
    login: (cb, opts) => {
      b.logins.push({ cb, opts });
      b.win.open("https://www.facebook.com/dialog/oauth", "_blank");
    },
  };
  b.win = {
    navigator: { standalone },
    location: { pathname: "/w/harbor", search: "", hash: "" },
    sessionStorage: {
      getItem: (k) => b.held.get(k) ?? null,
      setItem: (k, v) => void b.held.set(k, String(v)),
      removeItem: (k) => void b.held.delete(k),
    },
    fetch: async (url, init) => {
      b.fetched.push(String(url));
      // The app's own route: what the page sent is kept, and the number is connected.
      if (String(url).includes("channels/whatsapp/connect")) {
        b.sent.push(init && typeof init.body === "string" ? JSON.parse(init.body) : null);
        return new Response(
          JSON.stringify({
            ok: true,
            data: { number_e164: "+15551230000", verified_name: "Harbor Moving", quality_rating: null },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true, data: DOOR }), { status: 200 });
    },
    document: {
      createElement: () => ({}),
      head: {
        appendChild: (script) => {
          b.scripts.push(script);
          setImmediate(() => {
            if (!b.sdk) return script.onerror();
            b.win.FB = fb;
            b.win.fbAsyncInit();
          });
        },
      },
    },
    open: (...args) => {
      b.asked.push(args);
      return b.opens ? { closed: false } : null;
    },
    addEventListener: (_type, fn) => b.listeners.add(fn),
    removeEventListener: (_type, fn) => b.listeners.delete(fn),
    setTimeout: (fn) => setTimeout(fn, 0),
  };
  return b;
}

/** The flow, with `b` as the tab it runs in. */
async function inBrowser(b, run) {
  const mod = await import(
    pathToFileURL(path.join(here, "../../../../apps/dashboard/src/surfaces/settings/connections/whatsapp.ts")).href
  );
  const realWindow = globalThis.window;
  globalThis.window = b.win;
  try {
    await run(mod);
  } finally {
    if (realWindow === undefined) delete globalThis.window;
    else globalThis.window = realWindow;
  }
}

/** Meta's window closing with nothing done: the SDK's callback, with no code. */
const closeUnfinished = (b) => b.logins[b.logins.length - 1].cb({ authResponse: null });

test("Connections fetches Meta's SDK ahead, so a press asks for Meta's window inside the press, where a phone allows one; a press that comes first fetches what it needs and still asks", async () => {
  // 7 October: on a phone, Connect WhatsApp did nothing. The press asked Meta's door, then fetched Meta's SDK, and only then asked
  // the browser for Meta's window: two waits after the press, and a phone's browser gives a page a window only inside one.
  const ahead = browser();
  await inBrowser(ahead, async (mod) => {
    mod.waConnect.prepare(DOOR);
    await turn();
    await turn();
    assert.equal(ahead.scripts.length, 1, "Meta's SDK is fetched as Connections opens on a door that is ready");
    assert.deepEqual(ahead.inits, [{ appId: DOOR.app_id, version: "v25.0", xfbml: false, cookie: false }]);
    assert.deepEqual(ahead.logins, [], "and nothing is asked of Meta until the press");
    assert.deepEqual(ahead.fetched, [], "the door's answer is the one Connections already holds");

    const running = mod.waConnect.start();
    // Nothing is awaited between the press and these lines: what they see happened inside the press.
    assert.equal(ahead.logins.length, 1, "the sign-up is asked for inside the press");
    assert.equal(ahead.asked.length, 1, "and so is Meta's window");
    assert.deepEqual(ahead.fetched, [], "with nothing fetched on the way");
    assert.equal(ahead.logins[0].opts.config_id, DOOR.config_id);
    assert.equal(ahead.held.has(SIGNUP_MARK), true, "the mark is made as before");
    closeUnfinished(ahead);
    assert.equal((await within(running)).reason, "cancelled");
    assert.equal(ahead.listeners.size, 0);
    assert.equal(ahead.held.has(SIGNUP_MARK), false);
  });

  const first = browser();
  await inBrowser(first, async (mod) => {
    const running = mod.waConnect.start();
    assert.deepEqual(first.logins, [], "nothing in hand: the door and the SDK are fetched first");
    for (let i = 0; i < 6 && !first.logins.length; i++) await turn();
    assert.equal(first.fetched.length, 1);
    assert.equal(first.scripts.length, 1);
    assert.equal(first.logins.length, 1, "and the window is asked for once they are in");
    closeUnfinished(first);
    assert.equal((await within(running)).reason, "cancelled");
  });
});

test("a window the browser refuses is said at once and the sign-up ends, so the row is not left waiting on a window that never opened; the next press has everything in hand", async () => {
  // Meta's SDK says nothing when the browser refuses its window: the sign-up used to wait for an answer that could not come, the
  // button stayed dimmed, and the page said nothing until it was loaded again.
  const b = browser({ opens: false });
  await inBrowser(b, async (mod) => {
    const refused = await within(mod.waConnect.start());
    assert.notEqual(refused, "still waiting", "a refused window ends the sign-up");
    assert.deepEqual([refused.ok, refused.reason], [false, "blocked"]);
    assert.equal(
      refused.message,
      "Meta's window was blocked. Press Connect WhatsApp again; if it still does not open, allow pop-ups for Chanlytics.",
    );
    assert.equal(b.asked.length, 1);
    assert.equal(b.listeners.size, 0, "nobody is left listening for Meta's window");
    assert.equal(b.held.has(SIGNUP_MARK), false, "and no mark says a sign-up is open");

    // The first press fetched the door and the SDK: the second asks for the window inside the press, where the browser gives it.
    b.opens = true;
    const running = mod.waConnect.start();
    assert.equal(b.logins.length, 2, "asked inside the second press");
    assert.equal(b.fetched.length, 1, "with nothing fetched again");
    closeUnfinished(b);
    assert.equal((await within(running)).reason, "cancelled");
  });
});

test("an app on an iPhone's home screen is sent to the browser: the window it would open could never answer this page, so nothing is asked of Meta there", async () => {
  // A page opened from the home screen opens another site in a sheet of its own that cannot reach the page behind it: Meta would
  // finish the sign-up there and the number would never arrive (a sign-up that does not come back, as on 6 October).
  const b = browser({ standalone: true });
  await inBrowser(b, async (mod) => {
    mod.waConnect.prepare(DOOR);
    await turn();
    assert.deepEqual(b.scripts, [], "Meta's SDK is not fetched where its window cannot be used");
    const said = await within(mod.waConnect.start());
    assert.deepEqual([said.ok, said.reason], [false, "home_screen"]);
    assert.equal(
      said.message,
      "Open Chanlytics in Safari to connect WhatsApp. Meta's sign-up needs a browser tab, and an app on the home screen has none.",
    );
    assert.deepEqual([b.logins, b.asked, b.fetched, b.scripts], [[], [], [], []], "nothing was asked of anyone");
    assert.equal(b.held.has(SIGNUP_MARK), false);
  });
});

test("a code that arrives without the ids is sent all the same, with whatever the window did say: the edge reads the rest from the token itself; a window the owner closed sends nothing", async () => {
  // Meta's window posts the ids as a courtesy a browser can miss (8 October 2026: three sign-ups finished on Meta's side,
  // the page heard none, and each code was thrown away with "finished without a number"). The code is what is needed.
  const b = browser();
  await inBrowser(b, async (mod) => {
    mod.waConnect.prepare(DOOR);
    await turn();
    await turn();
    const heard = (origin, event, data) => {
      for (const fn of b.listeners) fn({ origin, data: JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event, data }) });
    };
    // Nothing heard: the code alone.
    let running = mod.waConnect.start();
    b.logins[0].cb({ authResponse: { code: "AQBx-code-1" } });
    let result = await within(running);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.number, "+15551230000");
    assert.deepEqual(b.sent, [{ code: "AQBx-code-1" }]);
    // The window named the account and not the number, from a Meta host the page used to be deaf to.
    running = mod.waConnect.start();
    heard("https://business.facebook.com", "FINISH_ONLY_WABA", { waba_id: "987654321098", business_id: "1" });
    b.logins[1].cb({ authResponse: { code: "AQBx-code-2" } });
    result = await within(running);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(b.sent[1], { code: "AQBx-code-2", waba_id: "987654321098" });
    // Both named: both sent, as before.
    running = mod.waConnect.start();
    heard("https://www.facebook.com", "FINISH", { phone_number_id: "123456789012", waba_id: "987654321098" });
    b.logins[2].cb({ authResponse: { code: "AQBx-code-3" } });
    result = await within(running);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(b.sent[2], { code: "AQBx-code-3", phone_number_id: "123456789012", waba_id: "987654321098" });
    // A cancel is still a cancel, and no code goes anywhere.
    running = mod.waConnect.start();
    heard("https://www.facebook.com", "CANCEL", { current_step: "BUSINESS_INFO" });
    b.logins[3].cb({ authResponse: { code: "AQBx-code-4" } });
    result = await within(running);
    assert.equal(result.reason, "cancelled");
    assert.equal(b.sent.length, 3);
  });
});

test("Meta's SDK that could not be fetched is said, and fetched again by the next press", async () => {
  const b = browser({ sdk: false });
  await inBrowser(b, async (mod) => {
    mod.waConnect.prepare(DOOR);
    await turn();
    await turn();
    assert.equal(b.scripts.length, 1);
    const failed = await within(mod.waConnect.start());
    assert.deepEqual([failed.ok, failed.reason], [false, "sdk"]);
    assert.equal(b.scripts.length, 2, "the press fetched it again rather than repeat the old failure");
    b.sdk = true;
    const running = mod.waConnect.start();
    for (let i = 0; i < 6 && !b.logins.length; i++) await turn();
    assert.equal(b.scripts.length, 3);
    assert.equal(b.logins.length, 1, "once Meta's SDK arrives the sign-up goes on");
    closeUnfinished(b);
    assert.equal((await within(running)).reason, "cancelled");
  });
});
