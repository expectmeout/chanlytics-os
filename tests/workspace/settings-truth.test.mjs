/**
 * Settings, honestly.
 *
 * Review findings F4, F32, F33, F35, F36, F37 and F50: a second save in a row
 * was refused as someone else's edit because the pane never re-read its
 * version; a config the parser refused rendered as "no receptionist yet" with
 * a form whose save would have replaced the broken row; the prompt card said
 * "every message" of a prompt the phone line does not read; "stays paused for
 * N hours" was true on the edge and a hard-coded day on the dashboard; two
 * alerts that go to Chanlytics were listed as going to the owner's addresses;
 * "switching a number off … emails you every message" described nothing that
 * exists; and the business form opened on a gate the server's door refuses.
 *
 * Each is run, here or in the test named beside it: the pins on the modules' text are gone (25 Nov 2026).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_PERMS,
  parseTenantConfigResult,
  ALERT_TOPICS,
  ALERT_PANE_WORDS,
  BELL_LINE_KINDS,
  toChannelVM,
} from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";
import { bridgeHolds } from "../shell/_bridge-holds.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

// The bridge's own client, over a wire that keeps what each request carried: the tab a verb is pressed in.
globalThis.window ??= globalThis;
globalThis.location ??= { pathname: "/w/studio", hash: "#/admin" };
globalThis.document ??= { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
globalThis.window.addEventListener ??= () => {};
globalThis.window.removeEventListener ??= () => {};
globalThis.window.dispatchEvent ??= () => true;
bridgeHolds({
  who: {
    workspaces: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
    activeWorkspaceId: "t1",
  },
});
/** Every request the tab made: `METHOD route` and the body it carried. */
const wire = [];
globalThis.window.fetch = async (url, init = {}) => {
  const route = `${init.method ?? "GET"} ${new URL(String(url), "https://app.chanlytics.com").pathname.replace("/api/v1/", "")}`;
  wire.push({ route, body: init.body ? JSON.parse(init.body) : null });
  return new Response(JSON.stringify({ ok: true, data: { policy: { class: "reply", mode: "auto" } } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

const { setPolicy } = await importSrc("apps/dashboard/src/bridge/inbox-verbs.ts");
const { AFTER } = await importSrc("apps/dashboard/src/bridge/refresh-map.ts");
const { SET_TABS } = await importSrc("apps/dashboard/src/surfaces/settings/frame/tabs.ts");
const workspaces = await importSrc("apps/dashboard/app/api/v1/workspaces/route.ts");

test("F4: a save re-reads the settings surface, so the next save carries the new version", () => {
  // The save itself -- its body carrying the config and the version, the caller told the moment it lands, and the
  // surface re-read on a conflict -- runs through the real client in settings-save.test.mjs.
  assert.deepEqual(
    AFTER["PUT settings"]().map((o) => o.key),
    // The postal address saved here is one of the channels' readiness, which People's reach reads too, and the composers, each where
    // a page draws them: no page is on screen here, so neither is read (refresh-map.ts peopleIfDrawn; this said People before it
    // was read only where drawn). And the workspace's own list, last: a save of the business's name renames it (X4-5).
    ["settings", "calendar", "setup", "workspace"],
    "REGRESSION: the second save in a row was a 409 — settings first, for the version",
  );
});

test("F32: a config the parser refuses is its own state, and no form can save over it", () => {
  // Run, not read: the settings read lands a refused config as `broken` with its issues and no facts
  // (receptionist/prompt/the-settings-read-lands-the-facts.test.mjs, "a config that would not parse lands no facts"), and
  // the pane draws the broken card in place of any form (receptionist/business-tab/settings-editor.test.mjs, "the pane
  // is the record, the card that sets one up, or the broken one -- and never a form"). Every notifications write closes
  // on it too: workspace/settings-owner-panes/ ("F32: a config the parser refuses closes every notifications write").
  // The parser really does tell the two apart.
  assert.equal(parseTenantConfigResult({}).ok, true, "an empty config is not broken");
  const bad = parseTenantConfigResult({ brain: { business_name: 42 } });
  assert.equal(bad.ok, false);
  assert.ok(
    bad.issues.some((i) => i.startsWith("brain.business_name")),
    "the issue names its field",
  );
});

// F33, the prompt card says which channel reads it: the card is the Business tab's prompt sheet since Phase 5, and the
// phrase per channel is contracts' PROMPT_READERS (business-tab-vm.test.mjs pins both spellings). Drawn, not read: the
// sheet's head says the channel shown, and the told section at rest the channel last chosen, in
// business-tab-prompt.test.mjs ("the head says what it is and who reads it, and counts nothing", and "what the
// receptionist is told says who reads it at rest, with one door, and counts nothing").

// F35, every pause reads the workspace's own pause_hours, not a hard-coded day. Each is run:
// - a take-over or a reply from the dashboard pauses for what the reply row says, through the one rule
//   (conversations/state/pause-length.test.mjs);
// - the WhatsApp-app echo pauses for the workspace's own hours, and for the default day when none is set (whatsapp/door/);
// - an unreadable message acknowledged pauses for the workspace's hours and the owner's email says that number, and one
//   whose acknowledgement did not send pauses nothing and promises nothing
//   (inbound/phases/the-reply-gates-hold-what-may-not-be-answered.test.mjs);
// - the escalating reply pauses and says so, and a branch that paused nothing promises no pause
//   (inbound/phases/every-way-out-says-what-the-message-became.test.mjs, "promises a pause only where one happened");
// - the handler's own email states the hours only beside a pause (conversations/escalations/
//   a-hold-is-told-in-the-owner-s-words.test.mjs).

test("F36/F37: no alert the workspace is offered is Chanlytics' own; switching a number off is described as it is", () => {
  // The topics are contracts' (notification-kinds.ts, decision 0040). The platform's alerts (a switched-off number's
  // messages, the sweeps' health) reach no workspace's addresses and keep no workspace's row, so they are no topic:
  // the page listed them beside "goes to each of these addresses" and had to say they did not. A workspace's own rows
  // of that kind (a line's trouble) are the bell's line.
  assert.ok(!ALERT_TOPICS.some((t) => t.kinds.includes("alert")), "no topic is the platform's");
  assert.ok(BELL_LINE_KINDS.includes("alert"));
  assert.ok(ALERT_PANE_WORDS.bellLine([]).includes("a problem with a line"));
  // A campaign's run, to the person choosing what reaches them, never a playbook's (decision 19).
  const runs = ALERT_TOPICS.find((t) => t.kinds.includes("playbook"));
  assert.equal(runs.title, "A campaign waits for your approval");
  assert.match(runs.what, /or a campaign couldn't run today/);
  for (const t of ALERT_TOPICS) assert.doesNotMatch(`${t.title} ${t.what}`, /playbook/i, t.title);
  // The pane's own words are drawn, and promise no email nothing sends: workspace/settings-owner-panes/
  // ("Notifications: what the workspace is told ...").
  const off = toChannelVM(
    {
      id: "c1",
      kind: "sms",
      number_e164: null,
      status: "disabled",
      created_at: "2026-09-01T00:00:00Z",
      last_inbound_at: null,
    },
    new Date("2026-09-12T12:00:00Z"),
  );
  assert.ok(
    off.healthLabel.includes("neither answered nor recorded · Chanlytics is told they are arriving, you are not"),
    "the row's own sentence says what the code does (channels-vm.test.mjs and the caller-gets test run it)",
  );
});

test("F50: gates match doors — the business form is owner-only like PUT /settings; a delay edit sends no mode; an invite has no role menu", async () => {
  assert.equal(ROLE_PERMS.owner.settings, true);
  assert.equal(
    ROLE_PERMS.operator.settings,
    false,
    "PUT /settings is owner-only; an operator's form opened on the autonomy gate and was refused at Save",
  );
  assert.equal(ROLE_PERMS.viewer.settings, false);
  // Every act of the Business page is a PUT an operator is refused, so every card gates on "settings" and names what
  // it acts on, and none opens on a gate this door refuses. Drawn, not read: receptionist/business-tab/page/, "every act
  // of the record is a PUT the settings door refuses, and none asks a different door", draws the whole page and the
  // card a workspace with no receptionist sees for an operator who may do autonomy and not settings, and then for one
  // who may do settings and nothing else -- so a card asking the WRONG door shows up either as a live button this
  // role cannot save with, or as a refused one where every act should be offered. (Refusing every permission at once,
  // as the viewer test below does, cannot tell those apart.) receptionist/business-tab/open/ reads the sentence on each act.
  // The autonomy matrix keeps its own gate (PUT /policies is operator-or-owner), and a delay edit sends no mode: drawn
  // in workspace/settings-owner-panes/ ("F50: every dot and dial asks the autonomy gate").
  // On the wire, a dial goes alone: the mode it was drawn beside stays home, so a stale tab never flips the row back.
  wire.length = 0;
  await setPolicy("reply", undefined, { pauseHours: 6 });
  await setPolicy("reply", "veto");
  assert.deepEqual(
    wire.map((w) => [w.route, w.body]),
    [
      ["PUT policies", { class: "reply", pause_hours: 6 }],
      ["PUT policies", { class: "reply", mode: "veto" }],
    ],
  );
  // And the door keeps the row's mode when a dial comes alone, even one a teammate changed since the tab read it:
  // campaigns/a-dial-keeps-the-other-dials.test.mjs ("a dial saved while a teammate turns the replies off leaves them off").
  // Invites.
  // An open invitation has no membership row to change the role on: drawn in workspace/settings-owner-panes/ ("an open
  // invitation's menu offers no role"), the Team card being TSX.
});

test("Settings is ordered you, then the business, then the people", () => {
  // It was one "Workspace" tab holding three audiences: the business your
  // CUSTOMERS hear about, the workspace record, and YOU -- with your own name
  // buried in the Team card underneath a roster of other people. The account
  // menu's "Your name" item navigated there, so the one link that promised you
  // delivered the business.
  const tab = (id) => SET_TABS.find((t) => t.id === id);
  assert.deepEqual(SET_TABS[0], { id: "profile", label: "Profile", icon: "user", group: "You" }, "you come first");
  assert.deepEqual(
    tab("workspace"),
    { id: "workspace", label: "Details", icon: "home", group: "Business" },
    "and the business is called what it is, its details first",
  );
  assert.ok(
    SET_TABS.findIndex((t) => t.group === "Business") > SET_TABS.findIndex((t) => t.group === "You"),
    "you, then the business",
  );
  assert.equal(tab("team").label, "Team", "with the people on their own tab");
  // The route id stays `workspace`: the label is what a person reads, and renaming the id would break bookmarks, an Ask
  // answer and four e2e specs. The old routes land on the business, and Memory is a pane of its own: drawn in
  // workspace/settings-owner-panes/ ("every address of the business lands on its pane").
  // Your name left the Team card entirely and is a row on Profile: drawn in workspace/settings-owner-panes/ ("your name
  // is a row on Profile, never in the Team card"); and the account menu's name opens Profile, pressed in
  // shell/surfaces/keys-in-the-sheet.test.mjs ("the name opens the profile").
  // Memory is in the rail since it became content (decision 0070): what Ask remembers, beside the workspace's other
  // records.
  assert.deepEqual(tab("memory"), { id: "memory", label: "Memory", icon: "sparkle", group: "Workspace" });
});

test("the workspace timezone is visible and an owner can change it", async () => {
  // tenants.timezone decided what "today" meant in metrics (00009), which
  // closures were upcoming and the hours the receptionist quoted -- with no
  // write path anywhere, so every workspace sat on 00001's America/New_York
  // default without being asked.
  // The row is When you're open's (surfaces/settings/business/open.tsx BtoZone, drawn as rec-row-timezone), beside the hours it
  // qualifies; it saves through the workspace's own door and not the settings save, and the card a workspace with
  // no receptionist sees draws the same row. All three are drawn: receptionist/business-tab/open/, "the timezone row
  // says the zone and the time there, and saves through the workspace's own door", and business-tab-create.test.mjs.
  // The floor is the column grant behind the row policy: a column UPDATE grant is a fence with no table-wide UPDATE
  // beside it (database/privileges.db.test.mjs). Who may ask is the route's declaration, held by route-policy.json: the
  // owner's, or the partner's who set it up (0012).
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const membership = [
    { user_id: "u1", tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ];
  const tenant = { id: A, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" };
  const ctx = (tenants) => ({
    supabase: fakeDb({ memberships: membership, tenants }),
    userId: "u1",
    email: "ada@example.com",
    params: {},
  });
  const patch = (body) =>
    new Request(`http://localhost/api/v1/workspaces?workspace=${A}`, { method: "PATCH", body: JSON.stringify(body) });
  const refused = async (run) => {
    try {
      await run;
    } catch (e) {
      return [e.code, e.status];
    }
    return "answered";
  };
  const saved = await workspaces.PATCH.run(patch({ timezone: "America/Chicago" }), ctx([{ ...tenant }]));
  assert.equal(saved.workspace.timezone, "America/Chicago", "a zone Intl knows is saved and answered");
  assert.deepEqual(
    await refused(workspaces.PATCH.run(patch({ timezone: "Mars/Olympus_Mons" }), ctx([{ ...tenant }]))),
    ["validation", 400],
    "and the zone is validated against Intl, not a list that goes stale",
  );
  // A forbidden UPDATE answers success with zero rows, so the count IS the check: no row the session may change.
  assert.deepEqual(
    await refused(workspaces.PATCH.run(patch({ timezone: "America/Chicago" }), ctx([]))),
    ["forbidden", 403],
    "REGRESSION: an owner whose grant went missing was told the zone was saved",
  );
});
