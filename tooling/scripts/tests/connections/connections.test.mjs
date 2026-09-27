/**
 * Connections: one row shape for everything a workspace can be joined to.
 * The truth table over every kind and state, the groups, the "since"
 * words, the audience sentence for Google, and the wiring: the page draws
 * rows from the same facts Setup reads, and the edge says which audience
 * the Google app has.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  connectionRows,
  googleAudienceWords,
  smsStateRow,
  CONNECTION_KINDS,
  CONNECTION_GROUP_WORDS,
  toChannelVM,
} from "@chanlytics/contracts";
import { readCode, readRaw } from "../_source.mjs";

const NOW = Date.parse("2026-09-07T15:00:00Z");
const ago = (ms) => new Date(NOW - ms).toISOString();
const H = 3_600_000;

const channel = (kind, over = {}) =>
  toChannelVM(
    {
      id: `ch-${kind}`,
      kind,
      number_e164: kind === "voice" ? "+13055550123" : "+13055550188",
      status: "active",
      created_at: ago(30 * 24 * H),
      last_inbound_at: ago(2 * H),
      ...over,
    },
    new Date(NOW),
  );
const line = (over = {}) => ({
  id: "l1",
  e164: "+16465550100",
  kind: "chanlytics",
  provider: "twilio",
  area_code: 646,
  voice_state: "answering",
  sms_state: "none",
  whatsapp_state: "none",
  port_state: "none",
  forwarding_state: "none",
  step: null,
  last_error: null,
  state_since: ago(3 * 24 * H),
  created_at: ago(3 * 24 * H),
  ...over,
});
const listing = (over = {}) => ({
  place_id: "p1",
  name: "Marisa's Beauty Salon",
  address: "1200 Maple Ave, Brooklyn",
  maps_uri: "https://maps.google.com/?cid=1",
  business_status: "OPERATIONAL",
  rating: 4.6,
  review_count: 71,
  linked_at: ago(10 * 24 * H),
  checked_at: ago(6 * H),
  check_error: null,
  ...over,
});
const connection = (over = {}) => ({
  google_email: "owner@example.com",
  account_title: "Marisa's",
  location_name: "locations/1",
  location_title: "Marisa's Beauty Salon",
  connected_at: ago(5 * 24 * H),
  last_synced_at: ago(H),
  sync_error: null,
  ...over,
});
const base = () => ({
  channels: [],
  whatsapp: null,
  lines: { rows: [], ready: false },
  lineRequestedAt: null,
  google: null,
  calendar: null,
});
const by = (rows) => Object.fromEntries(rows.map((r) => [r.kind, r]));

test("every kind is a row, exactly once, in a fixed order, and each row carries a group that matches its state", () => {
  const rows = connectionRows(base(), NOW);
  assert.deepEqual(
    rows.map((r) => r.kind),
    CONNECTION_KINDS,
  );
  for (const r of rows) {
    assert.ok(r.sentence.length > 10 && r.stateWords, r.kind);
    if (r.state === "later") assert.equal(r.group, "later");
    if (r.state === "connected" || r.state === "attention" || r.state === "off") assert.equal(r.group, "connected");
    if (r.state === "none" || r.state.startsWith("waiting")) assert.equal(r.group, "available");
    if (r.group === "later") assert.equal(r.verb, null, "a later row offers nothing");
  }
});

test("a workspace with nothing: every door honest, nothing pretends", () => {
  const r = by(connectionRows({ ...base(), whatsapp: { ready: false, reason: "no_config_id" } }, NOW));
  assert.equal(r.whatsapp.state, "none");
  assert.ok(
    r.whatsapp.sentence.includes("the Embedded Signup configuration is missing on the Chanlytics side") &&
      r.whatsapp.verb === null,
    "the missing piece is named, not hidden",
  );
  assert.deepEqual(r.phone.verb, { label: "Ask for a line", to: "start/phone", who: "owner" });
  assert.equal(r.sms.group, "later");
  assert.equal(r.google_profile.group, "later");
  assert.equal(r.google_listing.group, "later");
  assert.deepEqual(r.calendar.verb, { label: "Paste the address", to: "admin/workspace", who: "owner" });
  for (const k of ["instagram", "email", "deposits"]) assert.equal(r[k].group, "later", k);
  assert.equal(
    by(connectionRows({ ...base(), whatsapp: undefined }, NOW)).whatsapp.sentence,
    "Checking whether Chanlytics can connect a number…",
  );
  assert.equal(
    by(connectionRows({ ...base(), whatsapp: { ready: true, reason: null } }, NOW)).whatsapp.verb.to,
    "verb:whatsapp-connect",
  );
});

test("the live salon: both numbers on, the listing watched, the profile connected, the feed readable", () => {
  const r = by(
    connectionRows(
      {
        channels: [channel("whatsapp"), channel("voice", { last_inbound_at: ago(23 * H) })],
        whatsapp: { ready: true, reason: null },
        lines: { rows: [], ready: false },
        lineRequestedAt: null,
        google: { ready: { places: true, profile: true }, listing: listing(), connection: connection() },
        calendar: { state: "ok" },
      },
      NOW,
    ),
  );
  assert.equal(r.whatsapp.state, "connected");
  assert.equal(r.whatsapp.detail, "+1 (305) 555-0188");
  assert.ok(r.whatsapp.sentence.startsWith("Receiving · last message"));
  assert.deepEqual(r.whatsapp.verb, { label: "Templates", to: "messages", who: "operator" });
  assert.equal(r.phone.state, "connected");
  assert.equal(r.phone.verb, null);
  assert.equal(r.google_profile.state, "connected");
  assert.equal(r.google_profile.detail, "Marisa's Beauty Salon");
  assert.ok(r.google_profile.sentence.startsWith("Connected as owner@example.com · synced"));
  assert.equal(r.google_profile.verb.to, "verb:google-disconnect");
  assert.equal(r.google_listing.state, "connected");
  assert.equal(r.google_listing.stateWords, "Watched");
  assert.ok(r.google_listing.sentence.startsWith("Marisa's Beauty Salon · 4.6 ★ · 71 reviews on Google · Checked"));
  assert.equal(r.google_listing.verb.label, "Sync now", "with the profile connected, a read is a sync");
  assert.equal(r.calendar.state, "connected");
  const rows = connectionRows(
    {
      ...base(),
      channels: [channel("whatsapp"), channel("voice")],
      google: { ready: { places: true, profile: true }, listing: listing(), connection: connection() },
      calendar: { state: "ok" },
    },
    NOW,
  );
  assert.equal(CONNECTION_GROUP_WORDS.connected.sub(rows.filter((x) => x.group === "connected")), "5 connected");
});

test("attention is joined but not working: a number off, a listing unreadable, a sync failing, a feed unreadable", () => {
  const r = by(
    connectionRows(
      {
        ...base(),
        channels: [channel("whatsapp", { status: "disabled" })],
        google: {
          ready: { places: true, profile: true },
          listing: listing({ check_error: "boom" }),
          connection: connection({ sync_error: "boom" }),
        },
        calendar: { state: "unavailable" },
      },
      NOW,
    ),
  );
  assert.equal(r.whatsapp.state, "off");
  assert.equal(r.whatsapp.stateWords, "Off");
  assert.equal(r.google_listing.state, "attention");
  assert.equal(r.google_listing.stateWords, "Could not be read");
  assert.equal(r.google_profile.stateWords, "Could not sync");
  assert.equal(r.calendar.stateWords, "Could not be read");
  assert.deepEqual(r.calendar.verb, { label: "Check the address", to: "admin/workspace", who: "owner" });
  const list = connectionRows({ ...base(), channels: [channel("whatsapp", { status: "disabled" })] }, NOW).filter(
    (x) => x.group === "connected",
  );
  assert.equal(CONNECTION_GROUP_WORDS.connected.sub(list), "1 connected · 1 needs attention");
});

test("Google's doors: Connect where open with the audience said, choose where several locations, Find it where only the listing can be read", () => {
  const open = by(
    connectionRows(
      { ...base(), google: { ready: { places: true, profile: true }, listing: null, connection: null } },
      NOW,
    ),
  );
  assert.equal(open.google_profile.verb.to, "verb:google-connect");
  assert.ok(
    !open.google_profile.sentence.includes("Google is reviewing"),
    "nothing to say when the audience is not set",
  );
  assert.deepEqual(open.google_listing.verb, { label: "Find it", to: "start/find", who: "owner" });
  const testing = by(
    connectionRows(
      {
        ...base(),
        google: { ready: { places: true, profile: true, audience: "testing" }, listing: null, connection: null },
      },
      NOW,
    ),
  );
  assert.ok(
    testing.google_profile.sentence.endsWith(
      "Google is reviewing Chanlytics; until then Connect works for invited Google accounts only.",
    ),
  );
  assert.ok(googleAudienceWords("unverified").includes("choose Advanced, then Go to Chanlytics"));
  assert.equal(googleAudienceWords("verified"), null);
  const choose = by(
    connectionRows(
      {
        ...base(),
        google: {
          ready: { places: true, profile: true },
          listing: null,
          connection: connection({ location_name: null, location_title: null }),
        },
      },
      NOW,
    ),
  );
  assert.equal(choose.google_profile.state, "waiting_you");
  assert.equal(choose.google_profile.body, "google_choose");
  assert.equal(choose.google_profile.verb, null, "the choice is the verb");
});

test("the phone line's road: requested, being set up with the step and since, stopped, or on offer", () => {
  const req = by(connectionRows({ ...base(), lineRequestedAt: ago(3 * 24 * H) }, NOW));
  assert.equal(req.phone.state, "waiting_them");
  assert.ok(req.phone.sentence.startsWith("Requested 3d ago"));
  const prov = by(
    connectionRows(
      {
        ...base(),
        lines: { rows: [line({ voice_state: "provisioning", step: "number", state_since: ago(60_000) })], ready: true },
      },
      NOW,
    ),
  );
  assert.ok(prov.phone.sentence.startsWith("Setting up — buying the number, since 1m ago"));
  assert.equal(prov.phone.detail, "+1 (646) 555-0100");
  const failed = by(
    connectionRows({ ...base(), lines: { rows: [line({ voice_state: "failed", step: "trunk" })], ready: true } }, NOW),
  );
  assert.equal(failed.phone.stateWords, "Waiting on us");
  assert.deepEqual(failed.phone.verb, { label: "Retry it", to: "start/phone", who: "owner" });
  assert.equal(failed.phone.sentence, "Setting up stopped. A person at Chanlytics has it, or you can retry it.");
  const offer = by(connectionRows({ ...base(), lines: { rows: [], ready: true } }, NOW));
  assert.deepEqual(offer.phone.verb, { label: "Get a line", to: "start/phone", who: "owner" });
  const fwd = by(
    connectionRows(
      { ...base(), lines: { rows: [line({ provider: "carrier", voice_state: "none" })], ready: true } },
      NOW,
    ),
  );
  assert.equal(fwd.phone.verb.label, "Get a line", "a forwarded number is not the workspace's own line");
});

test("texting's states, in the owner's words, with the carriers' vocabulary kept out", () => {
  const words = (s, over = {}) => smsStateRow(line({ sms_state: s, ...over }), NOW);
  // A line that ANSWERS CALLS already has everything a text needs except the
  // carriers' permission, so it offers the one thing an owner can do about
  // it. Filed under "later", that was invisible.
  const offered = words("none");
  assert.equal(offered.state, "waiting_you");
  assert.equal(offered.verb.to, "verb:business-record");
  assert.equal(offered.body, "business_record");
  assert.equal(
    smsStateRow(line({ sms_state: "none", voice_state: "provisioning" }), NOW).state,
    "later",
    "a line that cannot answer a call yet cannot text either",
  );
  assert.equal(words("needs_record").state, "waiting_you");
  assert.equal(words("needs_record").body, "business_record", "and the form is right there");
  // THE PRE-FLIGHT'S OWN SENTENCES, when the row has them. Gate 8's argument is
  // that a refusal must say what to fix; the edge duly writes "what is wrong AND
  // what to do" onto `last_error` -- and this row threw it away for a fixed
  // "two minutes, once", which for a workspace whose NAME does not match its
  // record is false twice over: the record is complete, and the form it points at
  // cannot rename a workspace.
  assert.equal(
    words("needs_record", {
      last_error:
        "The carriers will be told this business is called \u201cBilling probe\u201d. Make the workspace's name match.",
    }).sentence,
    "The carriers will be told this business is called \u201cBilling probe\u201d. Make the workspace's name match.",
  );
  assert.match(
    words("needs_record", { last_error: "x" }).verb.label,
    /record/i,
    "and the button opens the thing to change",
  );
  assert.match(
    words("needs_record").sentence,
    /two minutes, once/,
    "with no reason on file it keeps the invitation it always had",
  );
  // REPLY to the text, never type a code here. The carriers message the
  // owner's own handset and the reply must come from it; telling somebody to
  // type a code sends them hunting for a field that does not exist while a
  // 24-hour window runs out.
  assert.match(words("otp_waiting").sentence, /reply to that message from the handset itself/);
  assert.doesNotMatch(words("otp_waiting").sentence, /Type the code/);
  // And NO verb. This row used to offer "Send it again" against a verb no page
  // handled -- a button that did nothing, on the one row where a person is
  // against a 24-hour clock. Resending needs a call whose shape cannot be
  // confirmed without a real sole-proprietor brand, and a brand costs money and
  // cannot be withdrawn, so the row says who asks for a new code instead of
  // pretending the owner can.
  assert.equal(words("otp_waiting").verb, null, "no dead button");
  assert.match(words("otp_waiting").sentence, /Chanlytics asks the carriers for another/, "and it says who does it");
  const reg = words("registering", { state_since: ago(2 * 24 * H) });
  assert.equal(reg.state, "waiting_them");
  assert.equal(reg.stateWords, "Waiting on carriers");
  assert.ok(reg.sentence.includes("since 2d ago"));
  // A rejection says what they said, then WHO sends it again -- because that is
  // not the owner. Gate 6 put resubmitting behind `platform_admins` on purpose (a
  // rejection needs somebody who can read what the carriers said), so `refile:
  // true` is never sent by the owner's route. This row used to offer them "Fix and
  // resubmit", and the button behind it was guaranteed to answer "The carriers did
  // not answer" -- about a message the carriers had explicitly sent.
  const sentBack = words("rejected", { last_error: "the website could not be reached" });
  assert.match(sentBack.sentence, /^The carriers sent the registration back: the website could not be reached\./);
  assert.match(sentBack.sentence, /Chanlytics sends it again/, "and it says who does");
  assert.match(
    sentBack.sentence,
    /costs nothing/,
    "correcting a rejection is free, and an owner should not fear pressing it",
  );
  assert.doesNotMatch(sentBack.sentence, /resubmit it|you resubmit/i, "never told to do the thing they cannot");
  assert.equal(words("active").state, "connected");
  // A filing made against the carriers' TEST registry: it reports itself
  // approved and delivers nothing. This row read the state underneath it and
  // told the owner their texting was days from switching itself on.
  const mock = words("approved", { reg_mock: true });
  assert.equal(mock.state, "attention", "joined, not working");
  assert.equal(mock.stateWords, "Waiting on us");
  assert.match(mock.sentence, /nothing is delivered/);
  assert.match(mock.sentence, /a person at Chanlytics is filing it/);
  assert.ok(!/switches itself on/.test(mock.sentence), "a rehearsal never switches itself on");
  assert.ok(
    !/switches itself on/.test(words("registering", { reg_mock: true }).sentence),
    "whatever stage the rehearsal reached",
  );
  assert.equal(smsStateRow(null, NOW).state, "later", "no line at all: nothing to offer");
  assert.equal(
    words("rejected", { last_error: "x" }).verb.to,
    "verb:business-record",
    "a rejection points at the thing to fix",
  );
  assert.doesNotMatch(
    words("rejected", { last_error: "x" }).verb.label,
    /resubmit/i,
    "but the button does not claim to send it",
  );
  assert.equal(
    words("failed", { last_error: "Texting for a business without a tax id needs a different registration." }).sentence,
    "Texting for a business without a tax id needs a different registration.",
    "and a refusal says what it actually was",
  );
  for (const s of ["none", "needs_record", "otp_waiting", "registering", "rejected", "failed", "active", "approved"]) {
    const t = `${words(s).sentence} ${words(s).stateWords}`;
    assert.ok(!/10DLC|A2P|campaign|brand|TCR|Twilio/i.test(t), `${s}: no trade words`);
  }
});

test("the wiring: the page draws rows from the same facts Setup reads, the old cards are gone, the edge says the audience", () => {
  const page = readCode("apps/dashboard/src/legacy/pages/integrations-real.jsx");
  assert.ok(
    page.includes(
      'r.kind === "google_listing" && owner && !armed && (r.state === "connected" || r.state === "attention") && (',
    ),
    "Remove is offered only when there is a listing to remove",
  );
  assert.ok(
    !page.includes("It is an operator action for now"),
    "the off-channel sentence lives on the row (channels.ts), not in a note beneath it",
  );
  const shell = readCode("apps/dashboard/src/legacy/pages/settings.jsx");
  assert.ok(
    page.includes("window.__connections.rows({") &&
      page.includes("lineRequestedAt: S ? S.dto.requests.line : null,") &&
      page.includes(
        "google: G ? { ready: G.dto.ready, listing: G.dto.listing, connection: G.dto.connection } : null,",
      ) &&
      page.includes("calendar: S ? S.dto.calendar : null,"),
  );
  assert.ok(
    !page.includes("INT_NOT_AVAILABLE") && !page.includes("<GoogleCard />") && !page.includes("<ConnectWhatsAppRow />"),
    "one row model, no hand-built cards",
  );
  // The pane is its own file; the settings shell only chooses between the
  // mockup and it, the way it does for Billing.
  assert.ok(
    shell.includes("<window.PaneIntegrationsReal />") && !shell.includes("const PaneIntegrationsReal"),
    "the shell renders the pane, it does not contain it",
  );
  assert.ok(page.includes("window.PaneIntegrationsReal = PaneIntegrationsReal;"));
  // A file of its own may use React and the window, never a helper that
  // lives in the file it came from: `useSetState` is an alias declared at
  // the top of settings.jsx, so it left with the code and arrived undefined
  // — a break no source-reading test could see, and the browser found.
  // A file of its own may use React and the window, never a helper that
  // lives in the file it came from: `useSetState` is an alias declared at
  // the top of settings.jsx, so it left with the code and arrived undefined
  // — a break no source-reading test could see, and the browser found.
  const form = readCode("apps/dashboard/src/legacy/pages/business-record.jsx");
  for (const f of [page, form]) {
    assert.ok(
      !f.includes("useSetState") && !f.includes("useSetEffect"),
      "an alias from settings.jsx cannot be used here",
    );
    assert.ok(
      !f.includes("usePPToast()") || f.includes("window.usePPToast()"),
      "the toast is reached through the window, as it is everywhere else",
    );
  }
  // Both files are loaded, and the form is rendered through the window the
  // way the shell renders the billing pane: one file per concern.
  const manifest = readCode("apps/dashboard/src/legacy-bridge/manifest.ts");
  for (const f of ["integrations-real.jsx", "business-record.jsx"])
    assert.ok(manifest.includes(`@/legacy/pages/${f}`), f);
  assert.ok(page.includes("<window.BusinessRecordForm line={ownLine} flash={flash} />"));
  assert.ok(page.includes("data-testid={`connections-${g}`}") && page.includes("data-testid={`connection-${r.kind}`}"));
  assert.ok(
    page.includes(
      'for (const ev of ["surface:settings", "surface:setup", "surface:google"]) window.addEventListener(ev, bump);',
    ),
    "repaints on every surface it reads",
  );
  assert.ok(
    page.includes('verb.who === "owner" ? window.canDo("team") : window.canDo("approve")'),
    "who may press is the row's to say, the page only checks",
  );
  const bridge = readCode("apps/dashboard/src/legacy-bridge/connections.ts");
  assert.ok(bridge.includes("win.__connections = { rows: connectionRows, groupWords: CONNECTION_GROUP_WORDS };"));
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx").includes("installConnections();"));
  const edge = readCode("apps/edge/lib/google/google.ts");
  assert.ok(
    edge.includes("export function googleAudience(): GoogleAudience | null {") &&
      edge.includes('return a === "testing" || a === "unverified" || a === "verified" ? a : null;'),
    "an unknown value says nothing rather than something wrong",
  );
  assert.ok(edge.includes("audience: googleAudience()"));
  const server = readCode("apps/dashboard/src/server/connections/google.ts");
  assert.ok(
    /audience:\s*ready\.audience === "testing" \|\| ready\.audience === "unverified" \|\| ready\.audience === "verified"\s*\? ready\.audience\s*: null,/.test(
      server,
    ),
  );
  const route = readCode("apps/dashboard/app/api/v1/google/route.ts");
  assert.ok(route.includes("ready: { places: ready.places, profile: ready.profile, audience: ready.audience }"));
  const env = readRaw("apps/edge/.env.example");
  assert.ok(env.includes("GOOGLE_OAUTH_AUDIENCE="), "the manifest names the switch");
});

test("every verb a row can offer is a verb the page runs", () => {
  // A button that does nothing is worse than no button, and this is where one
  // shipped: the sole-proprietor OTP row offered "Send it again" pointing at
  // `verb:resend-otp`, which no page ever handled. The click did nothing at
  // all, on the one row in this product where a person is against a 24-hour
  // clock -- and nothing failed, because a verb is a string on one side and a
  // switch case on the other with no type between them.
  //
  // This is that missing type. Anything the contract can put on a row has to be
  // answered by the page that renders it, or by a route the shell knows.
  const rows = readRaw("packages/contracts/src/setup/connections.ts");
  const offered = [...rows.matchAll(/to:\s*"verb:([a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(offered.length >= 5, "the verbs were found at all");
  const page = readCode("apps/dashboard/src/legacy/pages/integrations-real.jsx");
  const handled = [...page.matchAll(/case\s*"verb:([a-z-]+)":/g)].map((m) => m[1]);
  for (const v of new Set(offered)) {
    assert.ok(handled.includes(v), `verb:${v} is offered by a row and handled by nobody`);
  }
  assert.ok(!offered.includes("resend-otp"), "REGRESSION: the OTP row promised a resend this product cannot yet make");
  // The row still tells the owner what to do -- reply from the handset -- and
  // says who asks for a new code, rather than offering a button for it.
  const otp = rows.slice(rows.indexOf('case "otp_waiting":'), rows.indexOf('case "registering":'));
  assert.match(otp, /reply to that message from the handset itself/);
  assert.match(otp, /nothing to type here/);
  assert.match(otp, /Chanlytics asks the carriers for another/);
  // That the row carries no verb at all is asserted on the RETURNED row above,
  // where it is a fact rather than an absence of a substring -- this comment
  // block itself names the retired verb, so a source scan here would match it.
});

test("a WhatsApp number Meta flagged needs attention on Connections, in the words Broadcasts uses; a good one stays On; nothing is said when Meta has said nothing", () => {
  const flagged = connectionRows(
    {
      ...base(),
      channels: [channel("whatsapp", { quality: "RED", quality_event: "FLAGGED", messaging_limit: "TIER_250" })],
    },
    NOW,
  ).find((r) => r.kind === "whatsapp");
  assert.deepEqual([flagged.state, flagged.stateWords], ["attention", "Needs attention"]);
  assert.match(flagged.sentence, /WhatsApp flagged this number's quality · up to 250 new conversations a day$/);
  const good = connectionRows(
    { ...base(), channels: [channel("whatsapp", { quality: "GREEN", messaging_limit: "TIER_1K" })] },
    NOW,
  ).find((r) => r.kind === "whatsapp");
  assert.deepEqual([good.state, good.stateWords], ["connected", "On"]);
  assert.match(good.sentence, / · Number quality: good · up to 1,000 new conversations a day$/);
  const quiet = connectionRows({ ...base(), channels: [channel("whatsapp")] }, NOW).find((r) => r.kind === "whatsapp");
  assert.ok(!/quality/i.test(quiet.sentence), "nothing invented when Meta has said nothing");
  const off = connectionRows(
    { ...base(), channels: [channel("whatsapp", { status: "disabled", quality: "RED" })] },
    NOW,
  ).find((r) => r.kind === "whatsapp");
  assert.deepEqual([off.state, off.stateWords], ["off", "Off"], "off is off, whatever Meta said before");
});

test("the Email row says a domain is held, so a hold is not a green 'On' above it", async () => {
  const { connectionRows } = await import("@chanlytics/contracts");
  const mailbox = {
    id: "mb1",
    address: "harbor@mail.chanlytics.com",
    from_name: "Harbor",
    last_received_at: null,
    last_error: null,
  };
  const held = { id: "d1", state: "held", held_why: "complaint" };
  const rows = connectionRows(
    {
      ...base(),
      email: {
        ready: true,
        domain: "mail.chanlytics.com",
        mailbox,
        sending: { ready: true, domains: [held, { id: "d2", state: "verified" }] },
      },
    },
    NOW,
  );
  const email = rows.find((r) => r.kind === "email");
  assert.deepEqual([email.state, email.stateWords], ["attention", "On · 1 domain held"]);
  const calm = connectionRows(
    {
      ...base(),
      email: {
        ready: true,
        domain: "mail.chanlytics.com",
        mailbox,
        sending: { ready: true, domains: [{ id: "d2", state: "verified" }] },
      },
    },
    NOW,
  ).find((r) => r.kind === "email");
  assert.deepEqual([calm.state, calm.stateWords], ["connected", "On"]);
});
