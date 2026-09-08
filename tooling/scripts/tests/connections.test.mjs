/**
 * Connections: one row shape for everything a workspace can be joined to.
 * The truth table over every kind and state, the groups, the "since"
 * words, the audience sentence for Google, and the wiring: the page draws
 * rows from the same facts Setup reads, and the edge says which audience
 * the Google app has.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { connectionRows, googleAudienceWords, smsStateRow, CONNECTION_KINDS, CONNECTION_GROUP_WORDS, toChannelVM } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const NOW = Date.parse("2026-09-07T15:00:00Z");
const ago = (ms) => new Date(NOW - ms).toISOString();
const H = 3_600_000;

const channel = (kind, over = {}) => toChannelVM({ id: `ch-${kind}`, kind, number_e164: kind === "voice" ? "+13083368109" : "+19177724072", status: "active", created_at: ago(30 * 24 * H), last_inbound_at: ago(2 * H), ...over }, new Date(NOW));
const line = (over = {}) => ({ id: "l1", e164: "+16465550100", kind: "chanlytics", provider: "twilio", area_code: 646, voice_state: "answering", sms_state: "none", whatsapp_state: "none", port_state: "none", forwarding_state: "none", step: null, last_error: null, state_since: ago(3 * 24 * H), created_at: ago(3 * 24 * H), ...over });
const listing = (over = {}) => ({ place_id: "p1", name: "Melany's Beauty Salon", address: "2581 Pitkin Ave, Brooklyn", maps_uri: "https://maps.google.com/?cid=1", business_status: "OPERATIONAL", rating: 4.6, review_count: 71, linked_at: ago(10 * 24 * H), checked_at: ago(6 * H), check_error: null, ...over });
const connection = (over = {}) => ({ google_email: "owner@example.com", account_title: "Melany's", location_name: "locations/1", location_title: "Melany's Beauty Salon", connected_at: ago(5 * 24 * H), last_synced_at: ago(H), sync_error: null, ...over });
const base = () => ({ channels: [], whatsapp: null, lines: { rows: [], ready: false }, lineRequestedAt: null, google: null, calendar: null });
const by = (rows) => Object.fromEntries(rows.map((r) => [r.kind, r]));

test("every kind is a row, exactly once, in a fixed order, and each row carries a group that matches its state", () => {
  const rows = connectionRows(base(), NOW);
  assert.deepEqual(rows.map((r) => r.kind), CONNECTION_KINDS);
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
  assert.ok(r.whatsapp.sentence.includes("the Embedded Signup configuration is missing on the Chanlytics side") && r.whatsapp.verb === null, "the missing piece is named, not hidden");
  assert.deepEqual(r.phone.verb, { label: "Ask for a line", to: "admin/setup", who: "owner" });
  assert.equal(r.sms.group, "later");
  assert.equal(r.google_profile.group, "later");
  assert.equal(r.google_listing.group, "later");
  assert.deepEqual(r.calendar.verb, { label: "Paste the feed", to: "admin/workspace", who: "owner" });
  for (const k of ["instagram", "email", "deposits"]) assert.equal(r[k].group, "later", k);
  assert.equal(by(connectionRows({ ...base(), whatsapp: undefined }, NOW)).whatsapp.sentence, "Checking whether Chanlytics can connect a number…");
  assert.equal(by(connectionRows({ ...base(), whatsapp: { ready: true, reason: null } }, NOW)).whatsapp.verb.to, "verb:whatsapp-connect");
});

test("the live salon: both numbers on, the listing watched, the profile connected, the feed readable", () => {
  const r = by(connectionRows({
    channels: [channel("whatsapp"), channel("voice", { last_inbound_at: ago(23 * H) })],
    whatsapp: { ready: true, reason: null },
    lines: { rows: [], ready: false },
    lineRequestedAt: null,
    google: { ready: { places: true, profile: true }, listing: listing(), connection: connection() },
    calendar: { state: "ok" },
  }, NOW));
  assert.equal(r.whatsapp.state, "connected");
  assert.equal(r.whatsapp.detail, "+1 (917) 772-4072");
  assert.ok(r.whatsapp.sentence.startsWith("Receiving · last message"));
  assert.deepEqual(r.whatsapp.verb, { label: "Messages", to: "messages", who: "operator" });
  assert.equal(r.phone.state, "connected");
  assert.equal(r.phone.verb, null);
  assert.equal(r.google_profile.state, "connected");
  assert.equal(r.google_profile.detail, "Melany's Beauty Salon");
  assert.ok(r.google_profile.sentence.startsWith("Connected as owner@example.com · synced"));
  assert.equal(r.google_profile.verb.to, "verb:google-disconnect");
  assert.equal(r.google_listing.state, "connected");
  assert.equal(r.google_listing.stateWords, "Watched");
  assert.ok(r.google_listing.sentence.startsWith("Melany's Beauty Salon · 4.6 ★ · 71 reviews on Google · Checked"));
  assert.equal(r.google_listing.verb.label, "Sync now", "with the profile connected, a read is a sync");
  assert.equal(r.calendar.state, "connected");
  const rows = connectionRows({ ...base(), channels: [channel("whatsapp"), channel("voice")], google: { ready: { places: true, profile: true }, listing: listing(), connection: connection() }, calendar: { state: "ok" } }, NOW);
  assert.equal(CONNECTION_GROUP_WORDS.connected.sub(rows.filter((x) => x.group === "connected")), "5 connected");
});

test("attention is joined but not working: a number off, a listing unreadable, a sync failing, a feed unreadable", () => {
  const r = by(connectionRows({
    ...base(),
    channels: [channel("whatsapp", { status: "disabled" })],
    google: { ready: { places: true, profile: true }, listing: listing({ check_error: "boom" }), connection: connection({ sync_error: "boom" }) },
    calendar: { state: "unavailable" },
  }, NOW));
  assert.equal(r.whatsapp.state, "off");
  assert.equal(r.whatsapp.stateWords, "Off");
  assert.equal(r.google_listing.state, "attention");
  assert.equal(r.google_listing.stateWords, "Could not be read");
  assert.equal(r.google_profile.stateWords, "Could not sync");
  assert.equal(r.calendar.stateWords, "Could not be read");
  const list = connectionRows({ ...base(), channels: [channel("whatsapp", { status: "disabled" })] }, NOW).filter((x) => x.group === "connected");
  assert.equal(CONNECTION_GROUP_WORDS.connected.sub(list), "1 connected · 1 needs attention");
});

test("Google's doors: Connect where open with the audience said, choose where several locations, Find it where only the listing can be read", () => {
  const open = by(connectionRows({ ...base(), google: { ready: { places: true, profile: true }, listing: null, connection: null } }, NOW));
  assert.equal(open.google_profile.verb.to, "verb:google-connect");
  assert.ok(!open.google_profile.sentence.includes("Google is reviewing"), "nothing to say when the audience is not set");
  assert.deepEqual(open.google_listing.verb, { label: "Find it on Setup", to: "admin/setup", who: "owner" });
  const testing = by(connectionRows({ ...base(), google: { ready: { places: true, profile: true, audience: "testing" }, listing: null, connection: null } }, NOW));
  assert.ok(testing.google_profile.sentence.endsWith("Google is reviewing Chanlytics; until then Connect works for invited Google accounts only."));
  assert.ok(googleAudienceWords("unverified").includes("choose Advanced, then Go to Chanlytics"));
  assert.equal(googleAudienceWords("verified"), null);
  const choose = by(connectionRows({ ...base(), google: { ready: { places: true, profile: true }, listing: null, connection: connection({ location_name: null, location_title: null }) } }, NOW));
  assert.equal(choose.google_profile.state, "waiting_you");
  assert.equal(choose.google_profile.body, "google_choose");
  assert.equal(choose.google_profile.verb, null, "the choice is the verb");
});

test("the phone line's road: requested, being set up with the step and since, stopped, or on offer", () => {
  const req = by(connectionRows({ ...base(), lineRequestedAt: ago(3 * 24 * H) }, NOW));
  assert.equal(req.phone.state, "waiting_them");
  assert.ok(req.phone.sentence.startsWith("Requested 3d ago"));
  const prov = by(connectionRows({ ...base(), lines: { rows: [line({ voice_state: "provisioning", step: "number", state_since: ago(60_000) })], ready: true } }, NOW));
  assert.ok(prov.phone.sentence.startsWith("Setting up — buying the number, since 1m ago"));
  assert.equal(prov.phone.detail, "+1 (646) 555-0100");
  const failed = by(connectionRows({ ...base(), lines: { rows: [line({ voice_state: "failed", step: "trunk" })], ready: true } }, NOW));
  assert.equal(failed.phone.stateWords, "Waiting on us");
  assert.equal(failed.phone.verb.to, "admin/setup");
  const offer = by(connectionRows({ ...base(), lines: { rows: [], ready: true } }, NOW));
  assert.deepEqual(offer.phone.verb, { label: "Get a line", to: "admin/setup", who: "owner" });
  const fwd = by(connectionRows({ ...base(), lines: { rows: [line({ provider: "carrier", voice_state: "none" })], ready: true } }, NOW));
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
  assert.equal(smsStateRow(line({ sms_state: "none", voice_state: "provisioning" }), NOW).state, "later", "a line that cannot answer a call yet cannot text either");
  assert.equal(words("needs_record").state, "waiting_you");
  assert.equal(words("needs_record").body, "business_record", "and the form is right there");
  assert.equal(words("otp_waiting").sentence, "Type the code the carriers sent to your mobile.");
  const reg = words("registering", { state_since: ago(2 * 24 * H) });
  assert.equal(reg.state, "waiting_them");
  assert.equal(reg.stateWords, "Waiting on carriers");
  assert.ok(reg.sentence.includes("since 2d ago"));
  assert.equal(words("rejected", { last_error: "the website could not be reached" }).sentence, "The carriers sent the registration back: the website could not be reached.");
  assert.equal(words("active").state, "connected");
  assert.equal(smsStateRow(null, NOW).state, "later", "no line at all: nothing to offer");
  assert.equal(words("rejected", { last_error: "x" }).verb.to, "verb:business-record", "a rejection points at the thing to fix");
  assert.equal(words("failed", { last_error: "Texting for a business without a tax id needs a different registration." }).sentence, "Texting for a business without a tax id needs a different registration.", "and a refusal says what it actually was");
  for (const s of ["none", "needs_record", "otp_waiting", "registering", "rejected", "failed", "active", "approved"]) {
    const t = `${words(s).sentence} ${words(s).stateWords}`;
    assert.ok(!/10DLC|A2P|campaign|brand|TCR|Twilio/i.test(t), `${s}: no trade words`);
  }
});

test("the wiring: the page draws rows from the same facts Setup reads, the old cards are gone, the edge says the audience", () => {
  const page = readCode("apps/dashboard/src/legacy/pages/settings.jsx");
  assert.ok(page.includes("window.__connections.rows({") && page.includes("lineRequestedAt: S ? S.dto.requests.line : null,") && page.includes("google: G ? { ready: G.dto.ready, listing: G.dto.listing, connection: G.dto.connection } : null,") && page.includes("calendar: S ? S.dto.calendar : null,"));
  assert.ok(!page.includes("INT_NOT_AVAILABLE") && !page.includes("<GoogleCard />") && !page.includes("<ConnectWhatsAppRow />"), "one row model, no hand-built cards");
  assert.ok(page.includes('data-testid={`connections-${g}`}') && page.includes('data-testid={`connection-${r.kind}`}'));
  assert.ok(page.includes('for (const ev of ["surface:settings", "surface:setup", "surface:google"]) window.addEventListener(ev, bump);'), "repaints on every surface it reads");
  assert.ok(page.includes('verb.who === "owner" ? window.canDo("team") : window.canDo("approve")'), "who may press is the row's to say, the page only checks");
  const bridge = readCode("apps/dashboard/src/legacy-bridge/connections.ts");
  assert.ok(bridge.includes("win.__connections = { rows: connectionRows, groupWords: CONNECTION_GROUP_WORDS };"));
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx").includes("installConnections();"));
  const edge = readCode("apps/edge/lib/google.ts");
  assert.ok(edge.includes("export function googleAudience(): GoogleAudience | null {") && edge.includes('return a === "testing" || a === "unverified" || a === "verified" ? a : null;'), "an unknown value says nothing rather than something wrong");
  assert.ok(edge.includes("audience: googleAudience()"));
  const server = readCode("apps/dashboard/src/server/google.ts");
  assert.ok(server.includes("audience: ready.audience === \"testing\" || ready.audience === \"unverified\" || ready.audience === \"verified\" ? ready.audience : null,"));
  const route = readCode("apps/dashboard/app/api/v1/google/route.ts");
  assert.ok(route.includes("ready: { places: ready.places, profile: ready.profile, audience: ready.audience }"));
  const env = readRaw("apps/edge/.env.example");
  assert.ok(env.includes("GOOGLE_OAUTH_AUDIENCE="), "the manifest names the switch");
});
