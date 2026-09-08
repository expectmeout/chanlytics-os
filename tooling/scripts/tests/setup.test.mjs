/**
 * Setup: one page a new owner lands on until the receptionist is answering.
 * Every row is a fact the workspace holds; the truth table below is the
 * contract, and the wiring pins keep the page, the routes, the bridge and
 * the migration saying the same thing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupSteps, setupRoute, shouldLandOnSetup, SETUP_STATE_WORDS, formatPhoneDisplay, agoWords, EVENT_KINDS, serverNotificationRows, verbForRoute, LINE_STEP_WORDS } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const NOW = Date.parse("2026-09-07T15:00:00Z");
const VOICE = "+13055550124";
const WA = "+13055550123";
const HANDOFF = "+13055550100";

const empty = (over = {}) => ({
  business: { name: null, hours: false, services: 0, bookingLink: false, address: false, handoff: null, broken: false },
  channels: {
    whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
    voice: { present: false, active: false, number: null, lastInboundAt: null },
  },
  templates: { approved: 0, pending: 0, startersApproved: 0 },
  calendar: { state: "none" },
  team: { members: 1, invitesOpen: 0, alertEmails: 0 },
  consent: { yes: 0 },
  requests: { line: null },
  later: [],
  ...over,
});
const facts = { name: "Northside Movers", hours: true, services: 4, bookingLink: true, address: true, handoff: HANDOFF, broken: false };
const live = (over = {}) => empty({
  business: facts,
  channels: {
    whatsapp: { present: true, active: true, number: WA, quality: "GREEN", lastInboundAt: "2026-09-07T14:30:00Z" },
    voice: { present: true, active: true, number: VOICE, lastInboundAt: "2026-09-06T14:30:00Z" },
  },
  templates: { approved: 6, pending: 0, startersApproved: 5 },
  calendar: { state: "ok" },
  team: { members: 2, invitesOpen: 0, alertEmails: 1 },
  consent: { yes: 3 },
  ...over,
});
const row = (vm, id) => vm.rows.find((r) => r.id === id);


test("a receptionist answering with nothing to answer with says so, and points at the one thing that fixes it", () => {
  // A number is bought in a minute; the facts take longer. The page used to
  // say "Answering", which reads as ready, while every caller got the
  // fallback that refuses to state hours, prices or an address.
  const withLine = empty({
    channels: {
      whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
      voice: { present: true, active: true, number: VOICE, lastInboundAt: null },
    },
  });
  const bare = row(setupSteps(withLine, NOW), "receptionist");
  assert.equal(bare.state, "waiting_you");
  assert.ok(bare.sentence.includes("no facts to answer with yet"));
  assert.equal(bare.verb.to, "admin/workspace");
  const filled = row(setupSteps({ ...withLine, business: facts }, NOW), "receptionist");
  assert.equal(filled.state, "ready");
  assert.ok(filled.sentence.startsWith("Answering on"));
});

test("an empty workspace: nothing answers, every row reads its true state, the first verb is the business facts", () => {
  const vm = setupSteps(empty(), NOW);
  assert.equal(vm.readiness.answering, false);
  assert.equal(vm.readiness.sentence, "Your receptionist is not answering yet.");
  assert.deepEqual(vm.rows.map((r) => r.id), ["facts", "handoff", "line", "receptionist", "keep", "whatsapp", "calendar", "team", "yes"]);
  assert.deepEqual(vm.rows.map((r) => r.state), ["not_started", "waiting_you", "waiting_you", "waiting_them", "not_started", "waiting_you", "not_started", "not_started", "not_started"], "the ask is the owner's move; the receptionist is ours");
  assert.equal(row(vm, "line").sentence, "We set up your phone line with you.");
  assert.deepEqual(row(vm, "line").details, ["A number, the receptionist answering it, and forwarding from the number you have"]);
  assert.deepEqual(vm.rows.map((r) => r.required), [true, false, true, true, false, true, false, false, false], "the channel rows count until something answers");
  assert.deepEqual(row(vm, "line").verb, { label: "Ask for a line", to: "verb:request-line" }, "until lines provision themselves, the line is asked for");
  assert.equal(row(vm, "receptionist").verb, null, "the receptionist arrives with the line — nothing to press");
  assert.deepEqual(row(vm, "whatsapp").verb, { label: "Connect", to: "admin/integrations" });
  assert.equal(vm.done, 0);
  assert.equal(vm.total, 9);
  assert.deepEqual(vm.next, { label: "Start in Workspace", to: "admin/workspace", row: "facts", title: "Business facts" });
  assert.equal(vm.line, "Setup · 0 of 9 · Business facts: start in workspace");
  assert.equal(vm.tryIt, null);
  for (const r of vm.rows) assert.equal(r.stateWords, SETUP_STATE_WORDS[r.state]);
});

test("a workspace that answers everywhere: eight of nine — the kept number is the one thing left to offer — both numbers to try", () => {
  const vm = setupSteps(live(), NOW);
  assert.equal(vm.readiness.answering, true);
  assert.equal(vm.readiness.sentence, `Your receptionist answers calls on ${formatPhoneDisplay(VOICE)} and WhatsApp on ${formatPhoneDisplay(WA)}. Texting is not available yet.`);
  assert.equal(vm.done, 8);
  assert.deepEqual(vm.next, { label: "Set up forwarding", to: "verb:forwarding", row: "keep", title: "The number you already have" });
  assert.equal(vm.line, "Setup · 8 of 9 · The number you already have: set up forwarding");
  const kept = setupSteps({ ...live(), later: ["keep"] }, NOW);
  assert.equal(kept.next, null, "put off for later: nothing is left to press");
  assert.equal(kept.line, null);
  assert.deepEqual(vm.tryIt, { voice: VOICE, voiceLabel: formatPhoneDisplay(VOICE), whatsapp: WA, whatsappLabel: formatPhoneDisplay(WA) });
  assert.equal(row(vm, "facts").sentence, "Northside Movers · hours set · 4 services on record");
  assert.equal(row(vm, "handoff").sentence, `Callers who insist on a person are transferred to ${formatPhoneDisplay(HANDOFF)}.`);
  assert.deepEqual(row(vm, "receptionist").verb, { label: "Call it", to: `tel:${VOICE}` });
  assert.ok(row(vm, "receptionist").details.includes(`Last call ${agoWords(Date.parse("2026-09-06T14:30:00Z"), NOW)}`));
  assert.ok(row(vm, "whatsapp").details.includes("Quality green"));
  assert.ok(row(vm, "whatsapp").details.includes("6 approved messages"));
  assert.equal(row(vm, "team").sentence, "2 people · alerts go to 1 address.");
  assert.equal(row(vm, "yes").sentence, "3 people said yes to offers.");
  assert.equal(vm.rows.every((r) => !r.later), true);
});

test("calls only: the sentence says what is missing, and WhatsApp can now wait for later", () => {
  const dto = live({ channels: { ...live().channels, whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null } }, later: ["keep"] });
  const vm = setupSteps(dto, NOW);
  assert.equal(vm.readiness.sentence, `Your receptionist answers calls on ${formatPhoneDisplay(VOICE)}. WhatsApp is not connected. Texting is not available yet.`);
  assert.equal(row(vm, "whatsapp").required, false, "once something answers, a channel is optional");
  assert.deepEqual(vm.next, { label: "Connect", to: "admin/integrations", row: "whatsapp", title: "WhatsApp" });
  const later = setupSteps({ ...dto, later: ["whatsapp", "keep"] }, NOW);
  assert.equal(row(later, "whatsapp").later, true);
  assert.equal(later.next, null, "rows put off for later leave nothing to press");
  assert.equal(later.line, null);
  assert.equal(later.done, 7);
});

test("WhatsApp only: no phone line yet, and the line row still asks", () => {
  const vm = setupSteps(live({ channels: { ...live().channels, voice: { present: false, active: false, number: null, lastInboundAt: null } } }), NOW);
  assert.equal(vm.readiness.sentence, `Your receptionist answers WhatsApp on ${formatPhoneDisplay(WA)}. No phone line yet.`);
  assert.equal(row(vm, "line").required, false);
  assert.equal(row(vm, "line").state, "waiting_you", "not asked for yet");
  assert.deepEqual(vm.tryIt, { voice: null, voiceLabel: null, whatsapp: WA, whatsappLabel: formatPhoneDisplay(WA) });
});

test("later is a preference for optional rows only; a required row ignores it", () => {
  const vm = setupSteps(empty({ business: facts, later: ["whatsapp", "handoff", "calendar", "team", "yes"] }), NOW);
  assert.equal(row(vm, "whatsapp").later, false, "required until something answers");
  assert.equal(row(vm, "calendar").later, true);
  assert.deepEqual(vm.next, { label: "Ask for a line", to: "verb:request-line", row: "line", title: "A line for calls and texts" });
  assert.equal(vm.line, "Setup · 2 of 9 · A line for calls and texts: ask for a line");
});

test("a line that was asked for waits on us and says when; one that exists but is not active says so", () => {
  const asked = setupSteps(empty({ requests: { line: "2026-09-07T13:00:00Z" } }), NOW);
  assert.equal(row(asked, "line").state, "waiting_them", "asked: now it is ours");
  assert.equal(row(asked, "line").verb, null, "asked once — no second ask");
  assert.equal(row(asked, "line").sentence, `Requested ${agoWords(Date.parse("2026-09-07T13:00:00Z"), NOW)} — a person at Chanlytics will set up your line with you and reach you by email.`);
  const inactive = setupSteps(empty({ channels: { ...empty().channels, voice: { present: true, active: false, number: VOICE, lastInboundAt: null } } }), NOW);
  assert.equal(row(inactive, "line").sentence, `Your line ${formatPhoneDisplay(VOICE)} is switched off — the receptionist is not answering it.`);
  assert.equal(row(inactive, "line").state, "waiting_you");
  assert.equal(row(inactive, "receptionist").state, "waiting_you");
  assert.equal(row(inactive, "receptionist").sentence, "Switched off with the line.");
});

test("WhatsApp waits on Meta while the first messages are with them, or while the number is not active", () => {
  const meta = setupSteps(live({ templates: { approved: 0, pending: 3, startersApproved: 0 } }), NOW);
  assert.equal(row(meta, "whatsapp").state, "waiting_them");
  assert.equal(row(meta, "whatsapp").stateWords, "Waiting on Meta");
  assert.equal(row(meta, "whatsapp").sentence, `Connected on ${formatPhoneDisplay(WA)} — your first messages are with Meta for approval.`);
  assert.ok(row(meta, "whatsapp").details.includes("3 messages with Meta for approval"));
  assert.equal(meta.readiness.answering, true, "the number answers even while a template waits");
  const inactive = setupSteps(empty({ channels: { ...empty().channels, whatsapp: { present: true, active: false, number: WA, quality: null, lastInboundAt: null } } }), NOW);
  assert.equal(row(inactive, "whatsapp").stateWords, "Waiting on you");
  assert.equal(row(inactive, "whatsapp").sentence, `${formatPhoneDisplay(WA)} is connected but switched off.`);
  assert.deepEqual(row(inactive, "whatsapp").verb, { label: "Open Integrations", to: "admin/integrations" });
  const few = setupSteps(live({ templates: { approved: 2, pending: 0, startersApproved: 2 } }), NOW);
  assert.deepEqual(row(few, "whatsapp").verb, { label: "Add the starters", to: "outbound" });
  assert.ok(row(few, "whatsapp").details.includes("Add the starter messages: welcome, win-back, the month's offer"));
});

test("business facts: partly there says what is missing; a broken config is its own state", () => {
  const part = setupSteps(empty({ business: { ...facts, hours: false, services: 0 } }), NOW);
  assert.equal(row(part, "facts").state, "waiting_you");
  assert.equal(row(part, "facts").sentence, "Still missing: hours and services.");
  assert.deepEqual(row(part, "facts").verb, { label: "Finish in Workspace", to: "admin/workspace" });
  const broken = setupSteps(empty({ business: { ...empty().business, broken: true } }), NOW);
  assert.equal(row(broken, "facts").state, "waiting_you");
  assert.match(row(broken, "facts").sentence, /could not be read/);
  const noLink = setupSteps(empty({ business: { ...facts, bookingLink: false } }), NOW);
  assert.ok(row(noLink, "facts").details.includes("No booking link — the receptionist answers, but cannot send one"));
});

test("team and alerts: the verb goes to whichever half is missing; calendar: unreadable is waiting on you", () => {
  const noAlerts = setupSteps(empty({ team: { members: 2, invitesOpen: 0, alertEmails: 0 } }), NOW);
  assert.equal(row(noAlerts, "team").state, "waiting_you");
  assert.deepEqual(row(noAlerts, "team").verb, { label: "Set alerts", to: "admin/notifications" });
  const alone = setupSteps(empty({ team: { members: 1, invitesOpen: 0, alertEmails: 1 } }), NOW);
  assert.equal(row(alone, "team").sentence, "Only you so far · alerts go to 1 address.");
  assert.deepEqual(row(alone, "team").verb, { label: "Invite", to: "admin/workspace" });
  const invited = setupSteps(empty({ team: { members: 1, invitesOpen: 1, alertEmails: 2 } }), NOW);
  assert.equal(row(invited, "team").state, "ready");
  assert.equal(row(invited, "team").sentence, "1 person · 1 invite open · alerts go to 2 addresses.");
  const feed = setupSteps(empty({ calendar: { state: "unavailable" } }), NOW);
  assert.equal(row(feed, "calendar").state, "waiting_you");
  assert.deepEqual(row(feed, "calendar").verb, { label: "Check the feed", to: "admin/workspace" });
});

test("a channel row without a number never reads a null aloud", () => {
  const vm = setupSteps(live({ channels: { whatsapp: { present: true, active: true, number: null, quality: null, lastInboundAt: null }, voice: { present: true, active: true, number: null, lastInboundAt: null } } }), NOW);
  assert.equal(vm.readiness.sentence, "Your receptionist answers calls on your line and WhatsApp on your number. Texting is not available yet.");
  assert.equal(row(vm, "whatsapp").sentence, "Connected on your number.");
  assert.equal(row(vm, "receptionist").sentence, "Answering on your line.");
  assert.equal(row(vm, "receptionist").verb, null, "nothing to dial");
  assert.ok(!JSON.stringify(vm).includes("null."), "no null read aloud");
});

test("the bell's verb follows the row's route: a setup row opens Setup, an unrouted alert still opens Today", () => {
  const rows = serverNotificationRows({
    seen_at: null,
    notifications: [
      { id: "1", kind: "alert", title: "We got your request for a phone line", body: "A person at Chanlytics…", route: "admin/setup", subject_type: "setup", subject_id: null, created_at: "2026-09-07T12:00:00Z", read: false, dismissed: false },
      { id: "2", kind: "alert", title: "Plain", body: "x", route: null, subject_type: null, subject_id: null, created_at: "2026-09-07T12:00:00Z", read: false, dismissed: false },
      { id: "3", kind: "number", title: "Your phone line is ready", body: "x", route: "admin/setup", subject_type: "setup", subject_id: "c1", created_at: "2026-09-07T12:00:00Z", read: false, dismissed: false },
    ],
  });
  assert.deepEqual(rows.map((r) => [r.to, r.action]), [["admin/setup", "Open Setup"], ["today", "Open Today"], ["admin/setup", "Open Setup"]]);
  assert.equal(verbForRoute("inbox/th-1"), "Open the Inbox");
  assert.equal(verbForRoute("somewhere/new"), null);
});

test("a first ask reaches the platform mailbox through the edge; a repeat does not; a failure is never the owner's problem", () => {
  const route = readCode("apps/dashboard/app/api/v1/setup/request/route.ts");
  assert.ok(route.includes("const told = already ? false : await tellPlatformOfSetupRequest(member.tenantId, what, ctx.email ?? null);"));
  assert.ok(route.includes("return { request: data, told };"));
  const service = readCode("apps/dashboard/src/server/service.ts");
  assert.ok(service.includes('if (process.env.VERCEL_ENV !== "production" || !process.env.DIAG_KEY) return false;'), "production only");
  assert.ok(service.includes("${EDGE_BASE}/api/admin/setup-request"));
  assert.ok(service.includes('console.error("setup_request_tell_failed"'), "logged, not thrown");
  const edge = readCode("apps/edge/api/admin/setup-request.ts");
  assert.ok(edge.includes('request.headers.get("x-diag-key") !== process.env.DIAG_KEY'));
  assert.ok(edge.includes("{ tenantId: null, notifications: null, isEnvDefault: true }"), "addressed to the platform's own mailbox");
  assert.ok(edge.includes("voice-provision"), "the email says how to set the line up");
  assert.ok(!/contacts|messages|conversations/.test(edge), "no customer content anywhere near this");
});

test("the primary verb belongs to the next row alone; mobile tabs keep their labels", () => {
  const page = readCode("apps/dashboard/src/legacy/pages/setup.jsx");
  assert.ok(page.includes('kind: vm.next && vm.next.row === r.id ? "primary" : "ghost"'));
  const mobile = readRaw("apps/dashboard/src/legacy/styles/mobile.css");
  assert.ok(mobile.includes(".set-nav-row { grid-template-columns: auto auto; white-space: nowrap; flex: 0 0 auto; }"));
  assert.ok(mobile.includes(".set-pane > * { flex: 0 0 auto; }"), "a Settings card never shrinks to fit the pane on a phone");
  assert.ok(mobile.includes(".setup-rows .cl-attn-sentence { white-space: normal; }"), "a row's sentence wraps on a phone");
});

const lineRow = (over = {}) => ({ id: "0f3c2a1e-1111-4222-8333-444455556666", e164: "+13055550100", kind: "chanlytics", provider: "twilio", area_code: 305, voice_state: "provisioning", sms_state: "none", whatsapp_state: "none", port_state: "none", forwarding_state: "none", step: "trunk", last_error: null, state_since: "2026-09-07T14:58:00Z", created_at: "2026-09-07T14:57:00Z", ...over });
const withLines = (rows, ready = true) => ({ rows, ready, provider: ready ? "twilio" : null, costs: { local_number_month_usd: 1.15 } });

test("the line row over the product's own line: get one when this deployment can, watch it being set up, retry when it stopped", () => {
  const can = setupSteps(empty({ lines: withLines([]) }), NOW);
  assert.equal(row(can, "line").state, "waiting_you");
  assert.equal(row(can, "line").sentence, "Get a number for calls, or keep the one you have.");
  assert.deepEqual(row(can, "line").details, ["A local number is about $1.15 a month · your receptionist answers it · texting arrives when the carriers register it"]);
  assert.deepEqual(row(can, "line").verb, { label: "Get a line", to: "verb:choose-line" });
  const cannot = setupSteps(empty({ lines: withLines([], false) }), NOW);
  assert.deepEqual(row(cannot, "line").verb, { label: "Ask for a line", to: "verb:request-line" }, "no provider here: a person at Chanlytics");
  const busy = setupSteps(empty({ lines: withLines([lineRow()]) }), NOW);
  assert.equal(row(busy, "line").state, "waiting_them");
  assert.equal(row(busy, "line").sentence, `Setting up ${formatPhoneDisplay("+13055550100")} — ${LINE_STEP_WORDS.trunk}, since ${agoWords(Date.parse("2026-09-07T14:58:00Z"), NOW)}.`);
  assert.equal(row(busy, "line").verb, null);
  assert.equal(row(busy, "receptionist").sentence, "Being created with your line — it answers the moment the line does.");
  const failed = setupSteps(empty({ lines: withLines([lineRow({ voice_state: "failed", step: "import", last_error: "Retell import: HTTP 422" })]) }), NOW);
  assert.equal(row(failed, "line").state, "waiting_them");
  assert.equal(row(failed, "line").sentence, `Setting up ${formatPhoneDisplay("+13055550100")} stopped while ${LINE_STEP_WORDS.import}. A person at Chanlytics has it.`);
  assert.deepEqual(row(failed, "line").verb, { label: "Retry", to: "verb:retry-line:0f3c2a1e-1111-4222-8333-444455556666" });
  assert.ok(!JSON.stringify(failed).includes("HTTP 422"), "the provider's words stay off the page");
  const own = setupSteps(live({ lines: withLines([lineRow({ voice_state: "answering", step: null })]) }), NOW);
  assert.equal(row(own, "line").state, "ready");
  assert.ok(row(own, "line").details.includes("Your own number through Chanlytics"));
  assert.equal(setupSteps(empty({ lines: withLines([lineRow({ voice_state: "failed" })], false) }), NOW).next.row, "facts", "a stopped line is ours to fix, not the next thing to press");
});

test("the wiring for lines: routes owner-only and rate-limited, the setup route carries them, the bridge repaints on a step, the page has the chooser", () => {
  for (const [file, bucket] of [["search", "lines_search"], ["buy", "lines_buy"], ["retry", "lines_retry"]]) {
    const src = readCode(`apps/dashboard/app/api/v1/lines/${file}/route.ts`);
    assert.ok(src.includes('requireRole(member, "owner")'), `${file}: owners only`);
    assert.ok(src.includes(`takeRate(ctx.userId, "${bucket}")`), `${file}: ${bucket}`);
    assert.ok(src.includes('op: "' + file + '"'), `${file}: the edge op`);
  }
  assert.ok(readCode("apps/dashboard/app/api/v1/lines/route.ts").includes("linesFor(ctx.supabase, member.tenantId), linesStatus()"));
  const server = readCode("apps/dashboard/src/server/lines.ts");
  assert.ok(server.includes('"x-diag-key": process.env.DIAG_KEY') && server.includes("${EDGE_BASE}/api/admin/lines"));
  assert.ok(!/_sid/.test(server.slice(server.indexOf("LINE_COLUMNS"), server.indexOf("export async function linesFor"))), "no provider id is selected for the page");
  assert.ok(readCode("apps/dashboard/app/api/v1/setup/route.ts").includes("lines: { rows: lineRows, ready: lineStatus.ready, provider: lineStatus.provider, costs: { local_number_month_usd: lineStatus.costs.local_number_month_usd } },"));
  const bridge = readCode("apps/dashboard/src/legacy-bridge/setup.ts");
  assert.ok(bridge.includes('refreshOnTables: ["lines", "notifications"]'));
  for (const pin of ['"/api/v1/lines/search"', '"/api/v1/lines/buy"', '"/api/v1/lines/retry"']) assert.ok(bridge.includes(pin), pin);
  const page = readCode("apps/dashboard/src/legacy/pages/setup.jsx");
  for (const pin of ['verb.to === "verb:choose-line"', 'verb.to.startsWith("verb:retry-line:")', 'data-testid="setup-chooser"', 'data-testid="setup-buy"', "Get this number", 'window.canDo("team")']) assert.ok(page.includes(pin), pin);
  assert.ok(readCode("apps/edge/lib/lines.ts").includes('export { LINE_STEP_WORDS } from "./workspace/contracts.js";'), "one list of step words");
});

test("the landing rule: an owner whose receptionist answers nowhere lands on Setup once, from Today or nothing", () => {
  assert.equal(setupRoute(""), "today");
  assert.equal(setupRoute("#/admin/setup"), "admin/setup");
  assert.equal(setupRoute("#today"), "today");
  assert.equal(shouldLandOnSetup("owner", false, "today", false), true);
  assert.equal(shouldLandOnSetup("owner", false, "", false), true);
  assert.equal(shouldLandOnSetup("owner", false, "inbox", false), false, "a deep link is respected");
  assert.equal(shouldLandOnSetup("owner", false, "today", true), false, "once per session");
  assert.equal(shouldLandOnSetup("owner", true, "today", false), false, "answering — Today is the page");
  assert.equal(shouldLandOnSetup("operator", false, "today", false), false, "only the owner is sent to Setup");
  assert.equal(shouldLandOnSetup(null, false, "today", false), false);
});

test("the words: four states, no jargon, no trade", () => {
  assert.deepEqual(SETUP_STATE_WORDS, { not_started: "Not started", waiting_you: "Waiting on you", waiting_them: "Waiting on us", ready: "Ready" });
  // Only what the owner can read: the string literals, not our identifiers.
  const src = readCode("packages/contracts/src/setup.ts") + readCode("apps/dashboard/src/legacy/pages/setup.jsx");
  const words = [...src.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((m) => m[2]).join("\n");
  assert.doesNotMatch(words, /\b(tenant|onboard|provision|SIP|E\.?164|webhook|toggle)\b/i, "the owner's words, not ours");
  assert.doesNotMatch(words, /\$\d/, "no invented prices");
});

test("wiring: Settings tab, manifest, bridge, routes, registry, rate bucket, event kind, migration, Today line", () => {
  const settings = readCode("apps/dashboard/src/legacy/pages/settings.jsx");
  assert.ok(settings.includes('const SET_TABS = [\n  { id: "setup",         label: "Setup",         icon: "flag" },'), "Setup is the first Settings tab");
  assert.ok(settings.includes('{active.id === "setup" && window.PaneSetup && <window.PaneSetup />}'), "the pane is the page's component");
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/manifest.ts").includes('import "@/legacy/pages/setup.jsx";'));
  const app = readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx");
  assert.ok(app.includes("installSetup();") && app.includes("notificationsOverride, setupOverride, googleOverride, billingOverride];"), "the surface boots with the rest");
  const reg = readCode("apps/dashboard/src/legacy-bridge/surface-registry.ts");
  assert.ok(reg.includes('"admin/setup": "real",') && reg.includes('"admin/setup": "setup",'), "the route waits for its surface");
  assert.ok(readCode("apps/dashboard/src/server/rate-limit.ts").includes('setup_request: { limit: 5, windowMs: 3_600_000, noun: "setup requests" },'));
  assert.ok(EVENT_KINDS.includes("setup.requested"));
  const bridge = readCode("apps/dashboard/src/legacy-bridge/setup.ts");
  assert.ok(bridge.includes('key: "setup"') && bridge.includes('globals: ["__SETUP"]') && bridge.includes('events: ["surface:setup"]'));
  assert.ok(bridge.includes("chanlytics.setup.later.") && bridge.includes("chanlytics.setup.landed"), "later is a preference on this device; landing is once per session");
  assert.ok(bridge.includes("shouldLandOnSetup(s.role, s.vm.readiness.answering, setupRoute(win.location.hash), landed)"), "the landing rule is the contracts' rule");
  const get = readCode("apps/dashboard/app/api/v1/setup/route.ts");
  for (const pin of ["parseTenantConfigResult(cfgRow.config)", "starterByName(t.name)", "calendarWeek(ctx, tenantId, { from: null, days: 7 }", "teamRoster(supabase, tenantId, member.role)", '.eq("consent", "opted_in")', '.eq("subject_type", "setup")']) assert.ok(get.includes(pin), pin);
  const post = readCode("apps/dashboard/app/api/v1/setup/request/route.ts");
  for (const pin of ['requireRole(member, "operator")', 'takeRate(ctx.userId, "setup_request")', 'rpc("setup_request", { p_tenant_id: member.tenantId, p_what: what })']) assert.ok(post.includes(pin), pin);
  const mig = readRaw("supabase/migrations/00065_setup_request.sql");
  for (const pin of ["create or replace function public.setup_request(p_tenant_id uuid, p_what text)", "security definer", "public.is_acting_member(p_tenant_id)", "kind = 'setup.requested'", "interval '1 day'", "'admin/setup', 'setup'", "grant execute on function public.setup_request(uuid, text) to authenticated"]) assert.ok(mig.includes(pin), pin);
  const page = readCode("apps/dashboard/src/legacy/pages/setup.jsx");
  for (const pin of ["<window.AttnRow", "status={[r.stateWords, ...r.details]}", 'testid={`setup-row-${r.id}`}', 'ctaTestid="setup-verb"', "testid: `setup-later-${r.id}`", 'data-testid="setup-next"', 'window.canDo("approve")', "window.PaneSetup = PaneSetup;"]) assert.ok(page.includes(pin), pin);
  const brief = readCode("apps/dashboard/src/legacy/pages/dashboard-a-brief.jsx");
  assert.ok(brief.includes('data-testid="brief-setup"') && brief.includes("<SetupLine nav={nav} />"), "Today carries the one line");
  assert.ok(readCode("packages/contracts/src/index.ts").includes('export * from "./setup";'));
});
