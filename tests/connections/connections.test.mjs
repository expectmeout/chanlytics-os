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
  googleAudienceWords,
  LINE_STEP_WORDS,
  LINE_CREDENTIALS_SENTENCE,
  PROVISIONING_DEADLINE_MS,
  TEXTING_CODE_SENTENCE,
  toChannelVM,
} from "@chanlytics/contracts";
import {
  connectionRows,
  smsStateRow,
  CONNECTION_KINDS,
  CONNECTION_GROUP_WORDS,
} from "../../apps/dashboard/src/surfaces/settings/connections/model/setup.ts";
import { importSrc } from "../_source.mjs";
import { bootRunsOneNamed } from "../shell/boot/_frame-boot.mjs";

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
    r.whatsapp.sentence.includes("WhatsApp sign-up isn't set up on Chanlytics' side") && r.whatsapp.verb === null,
    "the missing piece is named, not hidden",
  );
  assert.deepEqual(r.phone.verb, { label: "Ask for a line", to: "start/channels", who: "owner" });
  assert.equal(r.sms.group, "later");
  assert.equal(r.google_profile.group, "later");
  assert.equal(r.google_listing.group, "later");
  // The one answer's press (setup/calendar-source.test.mjs), which opens the Business row itself.
  assert.deepEqual(r.calendar.verb, { label: "Connect your calendar", to: "admin/workspace/calendar", who: "owner" });
  for (const k of ["instagram", "email", "mailbox", "deposits"]) assert.equal(r[k].group, "later", k);
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
  // Campaigns, where every message the number sends is, inside the campaign that sends it (Messages folded in, 17 Nov 2026).
  assert.deepEqual(r.whatsapp.verb, { label: "Campaigns", to: "campaigns/sequences", who: "operator" });
  assert.equal(r.phone.state, "connected");
  assert.equal(r.phone.verb, null);
  assert.equal(r.google_profile.state, "connected");
  assert.equal(r.google_profile.detail, "Marisa's Beauty Salon");
  assert.ok(r.google_profile.sentence.startsWith("Connected as owner@example.com · synced"));
  assert.equal(r.google_profile.verb.to, "verb:google-disconnect");
  assert.equal(r.google_listing.state, "connected");
  assert.equal(r.google_listing.stateWords, "Watched");
  assert.ok(r.google_listing.sentence.startsWith("Marisa's Beauty Salon · 4.6 ★ · 71 reviews on Google · Checked"));
  assert.equal(r.google_listing.verb.label, "Update now", "with the profile connected, a read is a sync");
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
  assert.equal(r.google_listing.stateWords, "Couldn't be read");
  assert.equal(r.google_profile.stateWords, "Couldn't update");
  assert.equal(r.calendar.stateWords, "Couldn't be read");
  assert.deepEqual(r.calendar.verb, { label: "Check the link", to: "admin/workspace/calendar", who: "owner" });
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
      "Google is reviewing Chanlytics · until then Connect works for invited Google accounts only.",
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
  assert.ok(prov.phone.sentence.startsWith("Setting up · buying the number, since 1m ago"));
  assert.equal(prov.phone.detail, "+1 (646) 555-0100");
  const failed = by(
    connectionRows({ ...base(), lines: { rows: [line({ voice_state: "failed", step: "trunk" })], ready: true } }, NOW),
  );
  assert.equal(failed.phone.stateWords, "Waiting on Chanlytics");
  // Retried in place, as Start's row does it (ownLineStandOf): the same sentence for the same state, and the verb is the line's own.
  assert.deepEqual(failed.phone.verb, { label: "Retry", to: "verb:retry-line:l1", who: "owner" });
  assert.equal(
    failed.phone.sentence,
    `Setting up stopped while ${LINE_STEP_WORDS.trunk}. A person at Chanlytics has it. Retry from here · Chanlytics has been told.`,
  );
  const offer = by(connectionRows({ ...base(), lines: { rows: [], ready: true } }, NOW));
  assert.deepEqual(offer.phone.verb, { label: "Get a line", to: "start/channels", who: "owner" });
  const fwd = by(
    connectionRows(
      { ...base(), lines: { rows: [line({ provider: "carrier", voice_state: "none" })], ready: true } },
      NOW,
    ),
  );
  assert.equal(fwd.phone.verb.label, "Get a line", "a forwarded number is not the workspace's own line");
});

test("the rows read one set of facts: the listing's verb reads the profile's connection, and the phone and texting rows speak for the same line, the workspace's own", () => {
  // A read is a sync only once the profile has its location: a connection still choosing one does not sync.
  const google = (c) => ({ ready: { places: true, profile: true }, listing: listing(), connection: c });
  const choosing = by(
    connectionRows({ ...base(), google: google(connection({ location_name: null, location_title: null })) }, NOW),
  );
  assert.equal(choosing.google_profile.body, "google_choose");
  assert.equal(choosing.google_listing.verb.label, "Check now", "a location still to choose is not a sync");
  assert.equal(by(connectionRows({ ...base(), google: google(null) }, NOW)).google_listing.verb.label, "Check now");
  assert.equal(
    by(connectionRows({ ...base(), google: google(connection()) }, NOW)).google_listing.verb.label,
    "Update now",
  );
  // The workspace's own line is the first that is not a forwarded number, whichever order the rows arrive in.
  const own = line({ voice_state: "provisioning", step: "number", sms_state: "registering" });
  const forwarded = line({
    id: "l0",
    provider: "carrier",
    e164: "+13055550111",
    voice_state: "none",
    sms_state: "active",
  });
  for (const rows of [
    [forwarded, own],
    [own, forwarded],
  ]) {
    const r = by(connectionRows({ ...base(), lines: { rows, ready: true } }, NOW));
    assert.equal(r.phone.detail, "+1 (646) 555-0100");
    assert.equal(r.sms.detail, "+1 (646) 555-0100", "texting speaks for the phone row's line");
    assert.equal(r.sms.state, "waiting_them", "in that line's state, not the forwarded number's");
  }
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
        "The phone networks will be told this business is called \u201cBilling probe\u201d. Make the workspace's name match.",
    }).sentence,
    "The phone networks will be told this business is called \u201cBilling probe\u201d. Make the workspace's name match.",
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
  assert.equal(words("otp_waiting").sentence, TEXTING_CODE_SENTENCE);
  assert.match(TEXTING_CODE_SENTENCE, /Reply to the phone networks' text on your mobile/);
  assert.doesNotMatch(words("otp_waiting").sentence, /Type the code/);
  // And NO verb. This row used to offer "Send it again" against a verb no page
  // handled -- a button that did nothing, on the one row where a person is
  // against a 24-hour clock. Resending needs a call whose shape cannot be
  // confirmed without a real sole-proprietor brand, and a brand costs money and
  // cannot be withdrawn, so the row says who asks for a new code instead of
  // pretending the owner can.
  assert.equal(words("otp_waiting").verb, null, "no dead button");
  assert.match(words("otp_waiting").sentence, /Chanlytics asks for a new code/, "and it says who does it");
  const reg = words("registering", { state_since: ago(2 * 24 * H) });
  assert.equal(reg.state, "waiting_them");
  assert.equal(reg.stateWords, "Texting is being approved");
  assert.ok(reg.sentence.includes("since 2d ago"));
  // A rejection says what they said, then WHO sends it again -- because that is
  // not the owner. Gate 6 put resubmitting behind `platform_admins` on purpose (a
  // rejection needs somebody who can read what the carriers said), so `refile:
  // true` is never sent by the owner's route. This row used to offer them "Fix and
  // resubmit", and the button behind it was guaranteed to answer "The carriers did
  // not answer" -- about a message the carriers had explicitly sent.
  const sentBack = words("rejected", { last_error: "the website couldn't be reached" });
  assert.match(sentBack.sentence, /^The phone networks asked for a change: the website couldn't be reached\./);
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
  assert.equal(mock.stateWords, "Waiting on Chanlytics");
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

test("the wiring: the page draws rows from the same facts Setup reads, the old cards are gone, the edge says the audience", async () => {
  // The pane (surfaces/settings/connections, TSX since decision 0015 step 11) is drawn and pressed in
  // workspace/settings-doors.test.mjs over the reads it hears (the channels', Setup's and Google's, through useSurface):
  // every connection says one word, Settings opens what it is attached to with Disconnect last and asked first, the form
  // of the business on record is the row's own body, a row's verb is gated by who may press it, and every group and row
  // carries the address e2e finds it by. Settings draws the pane for its tab (settings-owner-panes/). Nothing of
  // Connections is installed at boot: the pane imports its model's rows and words.
  assert.ok(!bootRunsOneNamed("installConnections"), "the frame's boot installs nothing of Connections'");

  // The audience Google's consent screen has for our app, as the edge states it: one of three words, or nothing rather
  // than something wrong (edge lib/shared/google/config.ts), and the dashboard keeps the same three (server/connections
  // google.ts getGoogleReadiness). GET google answers it under `ready` (google/google-routes.test.mjs).
  const { googleAudience, googleReadiness } = await importSrc("apps/edge/lib/shared/google/config.ts");
  const kept = Object.fromEntries(
    ["GOOGLE_OAUTH_AUDIENCE", "EDGE_URL", "EDGE_CALL_SECRET", "EDGE_PROVIDERS"].map((k) => [k, process.env[k]]),
  );
  const realFetch = globalThis.fetch;
  try {
    for (const [said, means] of [
      ["testing", "testing"],
      ["unverified", "unverified"],
      ["verified", "verified"],
      ["published", null],
      ["", null],
      [undefined, null],
    ]) {
      if (said === undefined) delete process.env.GOOGLE_OAUTH_AUDIENCE;
      else process.env.GOOGLE_OAUTH_AUDIENCE = said;
      assert.equal(googleAudience(), means, String(said));
      assert.equal(googleReadiness().audience, means, `${said}: and the readiness the edge answers says the same`);
    }
    Object.assign(process.env, {
      EDGE_URL: "https://edge.example.com",
      EDGE_CALL_SECRET: "edge-secret",
      EDGE_PROVIDERS: "live",
    });
    const { getGoogleReadiness } = await importSrc("apps/dashboard/src/server/connections/google.ts");
    let audience = null;
    globalThis.fetch = async () =>
      Response.json({
        ok: true,
        ready: { places: true, profile: true, audience },
        profile: { client_id: "cid", redirect_uri: "https://app.example.com/api/v1/google/callback" },
      });
    let at = Date.now();
    for (const [edge, kept] of [
      ["verified", "verified"],
      ["testing", "testing"],
      ["anything-else", null],
    ]) {
      audience = edge;
      at += 60 * 60_000;
      assert.equal((await getGoogleReadiness(at)).audience, kept, `the edge said ${edge}`);
    }
  } finally {
    globalThis.fetch = realFetch;
    for (const [k, v] of Object.entries(kept))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
  // The manifest names the switch: tests/repo/env-manifest.test.mjs holds .env.example to the edge's getters.
  // Pinned as the pane's, the row's, the form's, Settings', the manifest's, the edge's config, the server's and the
  // route's text until 26 Nov 2026.
});

// Every verb a row can offer is a verb the page runs: a verb is a string on one side and a switch case on the other with
// no type between them, so the rule that stands in for that type is the repository's:
// tests/repo/rules/a-connection-s-verb-is-one-its-page-runs.test.mjs. That the OTP row offers no resend is asserted on
// the returned row above, where it is a fact rather than an absence of a substring.

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

test("the mailboxes sequences write from are a row of their own: Later and greyed until a provider is offered, then Connect, then each one's state", async () => {
  const { connectionRows } = await import("../../apps/dashboard/src/surfaces/settings/connections/model/setup.ts");
  const mailbox = {
    id: "mb1",
    address: "harbor@mail.chanlytics.com",
    from_name: "Harbor",
    last_received_at: null,
    last_error: null,
  };
  const rowsWith = (sending) =>
    by(connectionRows({ ...base(), email: { ready: true, domain: "mail.chanlytics.com", mailbox, sending } }, NOW));

  // No provider offered and none connected (production until Google's and Microsoft's reviews): the row is there,
  // Later, with nothing to press, and says what is coming.
  const later = rowsWith({ providers: [], mailboxes: [] }).mailbox;
  assert.deepEqual([later.group, later.state, later.verb, later.body], ["later", "later", null, null]);
  assert.match(later.sentence, /your own mailbox/);
  assert.doesNotMatch(later.sentence, /handed to you/);
  assert.equal(rowsWith(null).mailbox.group, "later", "an unread list offers nothing either");

  // A provider offered: Available, its Connect buttons in the block under the row.
  const offered = rowsWith({ providers: ["google"], mailboxes: [] }).mailbox;
  assert.deepEqual(
    [offered.group, offered.state, offered.stateWords, offered.body],
    ["available", "none", "Not connected", "mailboxes"],
  );
  // Google's mailbox connect is the Business Profile app (R18): its unverified screen is warned of where Connect is,
  // and only when Google is offered.
  const unverified = {
    ready: { places: true, profile: true, audience: "unverified" },
    listing: null,
    connection: null,
  };
  const warned = by(
    connectionRows(
      {
        ...base(),
        google: unverified,
        email: {
          ready: true,
          domain: "mail.chanlytics.com",
          mailbox,
          sending: { providers: ["google"], mailboxes: [] },
        },
      },
      NOW,
    ),
  ).mailbox;
  assert.match(warned.sentence, /choose Advanced, then Go to Chanlytics\.$/);
  const microsoftOnly = by(
    connectionRows(
      {
        ...base(),
        google: unverified,
        email: {
          ready: true,
          domain: "mail.chanlytics.com",
          mailbox,
          sending: { providers: ["microsoft"], mailboxes: [] },
        },
      },
      NOW,
    ),
  ).mailbox;
  assert.doesNotMatch(microsoftOnly.sentence, /choose Advanced/, "Microsoft's connect has no Google screen");

  // Connected: the address, and a held or signed-out one is the row's attention, never a green On.
  const held = { id: "d1", address: "sam@getbestmovers.com", state: "held", held_why: "complaint" };
  const one = rowsWith({ providers: ["google"], mailboxes: [{ ...held, state: "connected" }] }).mailbox;
  assert.deepEqual(
    [one.group, one.state, one.stateWords, one.detail],
    ["connected", "connected", "On", "sam@getbestmovers.com"],
  );
  const attention = rowsWith({ providers: ["google"], mailboxes: [held, { id: "d2", state: "connected" }] }).mailbox;
  assert.deepEqual(
    [attention.state, attention.stateWords, attention.detail],
    ["attention", "1 to look at", "2 mailboxes"],
  );
  const two = rowsWith({ providers: [], mailboxes: [held, { id: "d3", state: "reconnect" }] }).mailbox;
  assert.equal(two.stateWords, "2 to look at", "a signed-out one is said too, offered or not");
  const calm = rowsWith({ providers: ["google"], mailboxes: [{ id: "d2", state: "paused" }] }).mailbox;
  assert.deepEqual([calm.state, calm.stateWords], ["connected", "On"]);

  // With a mailbox connected, the hosted address is its backup (said in the mailbox's sheet): its row folds into the
  // mailbox's, which is titled Email (the mailbox canvas, 27 Oct 2026), and a held mailbox is said once, there.
  const folded = rowsWith({ providers: ["google"], mailboxes: [held] });
  assert.equal(folded.email, undefined, "one row for email");
  assert.deepEqual([folded.mailbox.title, folded.mailbox.icon, folded.mailbox.state], ["Email", "mail", "attention"]);
  // Until one is connected, the hosted address keeps its own row, and the mailbox row its own name.
  const before = rowsWith({ providers: ["google"], mailboxes: [] });
  assert.deepEqual([before.email.title, before.mailbox.title], ["Email", "Mailbox"]);
  // A hosted address that could not take an email in keeps its row, to say so.
  const hurt = by(
    connectionRows(
      {
        ...base(),
        email: {
          ready: true,
          domain: "mail.chanlytics.com",
          mailbox: { ...mailbox, last_error: "An email couldn't be taken in." },
          sending: { providers: ["google"], mailboxes: [held] },
        },
      },
      NOW,
    ),
  );
  assert.equal(hurt.email.state, "attention");
});

test("D1-line-row-derivations: the phone row says what Start's row says in each state of the own line, and retries in place", () => {
  const phone = (over) =>
    by(connectionRows({ ...base(), lines: { rows: [line({ step: "trunk", ...over })], ready: true } }, NOW)).phone;
  // Setting up for hours: Start says the setup stopped and offers Retry; Connections said "Usually a minute or two", with no button.
  const stuck = phone({ voice_state: "provisioning", state_since: ago(PROVISIONING_DEADLINE_MS + 60_000) });
  assert.equal(stuck.stateWords, "Waiting on Chanlytics");
  assert.ok(
    stuck.sentence.startsWith(`Setting up stopped while ${LINE_STEP_WORDS.trunk}, 6m ago.`),
    "the same sentence Start's row opens with",
  );
  assert.deepEqual(stuck.verb, { label: "Retry", to: "verb:retry-line:l1", who: "owner" }, "retried where it stands");
  // Within its deadline it is still setting up, and has no button.
  const within = phone({ voice_state: "provisioning", state_since: ago(60_000) });
  assert.equal(within.verb, null);
  assert.ok(within.sentence.startsWith(`Setting up · ${LINE_STEP_WORDS.trunk}, since 1m ago.`));
  // Stopped at the vault, which is ours to mend: a retry cannot help, so none is offered (it offered "Retry it").
  const vault = phone({ voice_state: "failed", last_error: "keeping the line's credentials: permission denied" });
  assert.equal(vault.verb, null, "no Retry that cannot help");
  assert.ok(
    vault.sentence.startsWith(`Setting up stopped at ${LINE_CREDENTIALS_SENTENCE}. A person at Chanlytics has it.`),
  );
  // Stopped at a carrier: a retry is the owner's, in place, not a walk to the first-run phone step.
  const carrier = phone({ voice_state: "failed", last_error: "Twilio 21422: number not available" });
  assert.equal(carrier.verb.to, "verb:retry-line:l1");
  assert.ok(!JSON.stringify(carrier).includes("Twilio 21422"), "the provider's words stay off the page");
  // The row's number is its detail, so its sentence names none; Start names it in the sentence and the rest is the same.
  assert.equal(carrier.detail, "+1 (646) 555-0100");
  assert.ok(!carrier.sentence.includes("555-0100"));
});
