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
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLE_PERMS, parseTenantConfigResult } from "@chanlytics/contracts";
import { readCode, readRaw, importSrc } from "./_source.mjs";

const pane = readRaw("apps/dashboard/src/legacy/pages/settings.jsx");
const verbsBridge = readCode("apps/dashboard/src/legacy-bridge/inbox-verbs.ts");

test("F4: a save re-reads the settings surface, so the next save carries the new version", async () => {
  const start = verbsBridge.indexOf("export async function saveSettings");
  const end = verbsBridge.indexOf("\nexport ", start + 10);
  const fn = verbsBridge.slice(start, end === -1 ? undefined : end);
  assert.ok(
    fn.includes('(deps.client ?? api())("PUT settings", { body: { config, version }, onAccepted })'),
    "the save goes through the client, so the map re-reads after it",
  );
  const { AFTER } = await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts");
  assert.deepEqual(
    AFTER["PUT settings"]().map((o) => o.key),
    ["settings", "today", "calendar", "setup"],
    "REGRESSION: the second save in a row was a 409 — settings first, for the version",
  );
  assert.ok(!fn.includes("await refresh();"), "the generic refresh never re-read this pane");
});

test("F32: a config the parser refuses is its own state, and no form can save over it", () => {
  // The read's half is RUN: a config the parser refuses answers { config: null, configBroken: true, issues }, never
  // {} read as "no receptionist yet" -- through the route in settings-routes.test.mjs ("the settings read") and
  // through its reader in readers.test.mjs, so the three pins on the route's text are gone.
  const surface = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  assert.ok(surface.includes("broken: { issues: cfg.issues ?? [] }"));
  assert.ok(pane.includes("const broken = !!(settings && settings.broken);"));
  assert.ok(pane.includes("This workspace's settings can't be read"));
  assert.ok(pane.indexOf("if (broken) {") < pane.indexOf("if (real) {"), "the broken branch wins over the record");
  assert.equal(
    (pane.match(/disabled=\{broken \|\| busy/g) ?? []).length,
    3,
    "every notifications write is closed on a broken config",
  );
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

test("F35: every pause reads the workspace's own pause_hours, not a hard-coded day", () => {
  const verbs = readCode("apps/dashboard/src/server/verbs.ts");
  assert.ok(verbs.includes("export async function pauseMsFor(ctx: RouteContext, tenantId: string): Promise<number>"));
  assert.ok(verbs.includes('.eq("class", "reply")'));
  for (const rel of ["apps/dashboard/src/server/core-ports.ts"]) {
    const src = readCode(rel);
    assert.ok(src.includes("pauseMsFor(ctx,"), `${rel} reads the limit`);
    assert.ok(!src.includes("PAUSE_MS"), `${rel}: REGRESSION — Settings said N hours, the verb paused for 24`);
  }
  const inbound = readCode("packages/core/src/inbound/answer.ts");
  const alerts = readCode("apps/edge/lib/whatsapp/alerts.ts");
  // The WhatsApp-app echo pausing for the workspace's own pause_hours, and for
  // the default day when none is set, is run in whatsapp-door.test.mjs.
  assert.ok(
    alerts.includes("the receptionist is paused on this thread for ${ctx.pausedHours}h."),
    "and the handoff email states the same number",
  );
  // Stated only by a branch that actually paused the thread. The email used to
  // promise the pause unconditionally, so nine of the eleven handoffs told the
  // owner the receptionist was out of a thread it was still answering.
  assert.ok(alerts.includes("ctx.pausedHours\n        ? `Reply from the Inbox"), "and only when this branch paused it");
  assert.ok(
    inbound.includes('"non-text message", pausedUntil ? pauseHours : null)'),
    "the acknowledgement states it only when it actually acknowledged",
  );
  assert.equal(
    (inbound.match(/,\s*pauseHours,?\s*\),?\s*\)/g) ?? []).length,
    3,
    "and the escalating reply does, held, sent, or kept unsent because its hold could not be written",
  );
  assert.ok(
    inbound.includes(
      "const tell = (userText: string, botText: string, reason: string, pausedHours: number | null = null) =>",
    ),
    "and the rest default to promising nothing",
  );
});

test("F36/F37: alerts that go to Chanlytics say so; switching a number off is described as it is", () => {
  assert.ok(pane.includes("Goes to Chanlytics, not to the addresses above"));
  assert.equal((pane.match(/platform: true/g) ?? []).length, 2, "exactly the two platform alerts");
  assert.ok(pane.includes("except the two marked for Chanlytics"));
  assert.ok(!pane.includes("emails you every message instead"), "REGRESSION: promised an email nothing sends");
  // The channels sentence moved with the pane it belongs to; the alerts
  // above it are the notifications pane and stay in the settings shell.
  assert.ok(
    readCode("packages/contracts/src/channels.ts").includes(
      "neither answered nor recorded; Chanlytics is told they are arriving, you are not",
    ),
    "the row's own sentence says what the code does (channels-vm.test.mjs runs it)",
  );
});

test("F50: gates match doors — the business form is owner-only like PUT /settings; a delay edit sends no mode; an invite has no role menu", () => {
  assert.equal(ROLE_PERMS.owner.settings, true);
  assert.equal(
    ROLE_PERMS.operator.settings,
    false,
    "PUT /settings is owner-only; an operator's form opened on the autonomy gate and was refused at Save",
  );
  assert.equal(ROLE_PERMS.viewer.settings, false);
  // Every act of the Business page is a PUT an operator is refused, so every card gates on "settings" and names what
  // it acts on, and none opens on a gate this door refuses. Drawn, not read: business-tab-page.test.mjs, "every act
  // of the record is a PUT the settings door refuses, and none asks a different door", draws the whole page and the
  // card a workspace with no receptionist sees for an operator who may do autonomy and not settings, and then for one
  // who may do settings and nothing else -- so a card asking the WRONG door shows up either as a live button this
  // role cannot save with, or as a refused one where every act should be offered. (Refusing every permission at once,
  // as the viewer test below does, cannot tell those apart.) business-tab-open.test.mjs reads the sentence on each act.
  assert.ok(
    pane.includes('gate("autonomy")'),
    "the autonomy matrix keeps its own gate — PUT /policies is operator-or-owner",
  );
  // Delay edits.
  assert.ok(pane.includes("if (d && reply) put(reply, undefined, { replyDelayMs: d[1] });"));
  assert.ok(
    !pane.includes("reply.mode.toLowerCase()"),
    "REGRESSION: a stale page changing the hold window resent its remembered mode",
  );
  const policies = readCode("apps/dashboard/app/api/v1/policies/route.ts");
  assert.ok(policies.includes("mode = current.mode;"), "the row keeps the mode it has");
  assert.ok(
    verbsBridge.includes(
      "export async function setPolicy(cls: string, mode: string | undefined, limits: PolicyDials = {})",
    ),
  );
  assert.ok(verbsBridge.includes("...(mode !== undefined ? { mode } : {})"));
  // Invites.
  assert.ok(
    pane.includes("...(pending && realRoster ? [] : ["),
    "an open invitation has no membership row to change the role on",
  );
});

test("Settings is ordered you, then the business, then the people", () => {
  // It was one "Workspace" tab holding three audiences: the business your
  // CUSTOMERS hear about, the workspace record, and YOU -- with your own name
  // buried in the Team card underneath a roster of other people. The account
  // menu's "Your name" item navigated there, so the one link that promised you
  // delivered the business.
  assert.match(pane, /\{ id: "profile",\s+label: "Profile",\s+icon: "user",\s+group: "You" \}/, "you come first");
  assert.match(pane, /\{ id: "workspace",\s+label: "Business",/, "and the business is called what it is");
  assert.match(pane, /\{ id: "team",\s+label: "Team",/, "with the people on their own tab");
  // The route id stays `workspace`: the label is what a person reads, and
  // renaming the id would break bookmarks, an Ask answer and four e2e specs.
  assert.ok(
    pane.includes('{ active.id === "workspace" && <PaneWorkspace flash={flash} />}') ||
      pane.includes('{active.id === "workspace" && <PaneWorkspace flash={flash} />}'),
    "the old route still lands on the business",
  );

  // Your name left the Team card entirely; the roster is other people.
  const team = pane.slice(
    pane.indexOf("const TeamSection"),
    pane.indexOf("const PaneNotifications") + 1 || pane.length,
  );
  assert.ok(!team.includes("<YourName"), "the roster no longer opens with an input about you");
  assert.ok(pane.includes("<YourName flash={flash} />"), "it is a row on Profile instead");
  assert.ok(
    readCode("apps/dashboard/src/legacy/components/sidebar.jsx").includes('onNavigate("admin/profile")'),
    "and the account menu points where it says",
  );

  // AI memory is not in the rail: it renders the not-built pane for every real
  // workspace, so as a rail item it promised nothing. The route still answers.
  assert.ok(!/\{ id: "memory",[^\n]*group:/.test(pane), "no rail item that never becomes content");
  assert.ok(pane.includes('const SET_TABS_UNLISTED = [{ id: "memory"'), "but an old link still lands somewhere honest");
});

test("the workspace timezone is visible and an owner can change it", () => {
  // tenants.timezone decided what "today" meant in metrics (00009), which
  // closures were upcoming and the hours the receptionist quoted -- with no
  // write path anywhere, so every workspace sat on 00001's America/New_York
  // default without being asked.
  // The row is When you're open's (business-tab-open.jsx BtoZone, drawn as rec-row-timezone), beside the hours it
  // qualifies; it saves through the workspace's own door and not the settings save, and the card a workspace with
  // no receptionist sees draws the same row. All three are drawn: business-tab-open.test.mjs, "the timezone row
  // says the zone and the time there, and saves through the workspace's own door", and business-tab-create.test.mjs.

  const mig = readRaw("supabase/migrations/00084_workspace_timezone.sql");
  assert.ok(mig.includes("create policy tenants_owner_update on public.tenants"), "RLS is the row floor");
  assert.ok(
    mig.includes("revoke update on public.tenants from authenticated, anon;"),
    "and the column grant is the door",
  );
  assert.ok(mig.includes("grant update (timezone) on public.tenants to authenticated;"), "one column, not the row");
  assert.ok(
    !/grant update \([^)]*\b(name|slug|status)\b/.test(mig),
    "a slug is a URL and a status is a billing state; neither is a settings toggle",
  );

  const route = readCode("apps/dashboard/app/api/v1/workspaces/route.ts");
  assert.ok(route.includes('role: "owner",'), "owner-only");
  assert.ok(
    route.includes("if (!data?.length) throw new AppError"),
    "a forbidden UPDATE returns success with zero rows here, so the count IS the check",
  );
  assert.ok(
    route.includes("cleanTimezone(body?.timezone)"),
    "and the zone is validated against Intl, not a list that goes stale",
  );
});
