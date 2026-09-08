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
import { readCode, readRaw } from "./_source.mjs";

const pane = readRaw("apps/dashboard/src/legacy/pages/settings.jsx");
const verbsBridge = readCode("apps/dashboard/src/legacy-bridge/inbox-verbs.ts");

test("F4: a save re-reads the settings surface, so the next save carries the new version", () => {
  const start = verbsBridge.indexOf("export async function saveSettings");
  const end = verbsBridge.indexOf("\nexport ", start + 10);
  const fn = verbsBridge.slice(start, end === -1 ? undefined : end);
  assert.ok(fn.includes("await refreshSurfaces([settingsOverride, todayOverride, calendarOverride]);"), "REGRESSION: the second save in a row was a 409");
  assert.ok(!fn.includes("await refresh();"), "the generic refresh never re-read this pane");
});

test("F32: a config the parser refuses is its own state, and no form can save over it", () => {
  const route = readCode("apps/dashboard/app/api/v1/settings/route.ts");
  assert.ok(route.includes("parseTenantConfigResult(row.config)"));
  assert.ok(route.includes("configBroken: true, issues: parsed.issues"));
  assert.ok(!route.includes("parseTenantConfig(row.config) ?? {}"), "REGRESSION: a broken config collapsed to {} and read as 'no receptionist yet'");
  const surface = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  assert.ok(surface.includes("broken: { issues: cfg.issues ?? [] }"));
  assert.ok(pane.includes("const broken = !!(settings && settings.broken);"));
  assert.ok(pane.includes("This workspace's settings can't be read"));
  assert.ok(pane.indexOf("if (broken) {") < pane.indexOf("if (connected && editing) {"), "the broken branch wins over the editor");
  assert.equal((pane.match(/disabled=\{broken \|\| !isOwner \|\| busy/g) ?? []).length, 3, "every notifications write is closed on a broken config");
  // The parser really does tell the two apart.
  assert.equal(parseTenantConfigResult({}).ok, true, "an empty config is not broken");
  const bad = parseTenantConfigResult({ brain: { business_name: 42 } });
  assert.equal(bad.ok, false);
  assert.ok(bad.issues.some((i) => i.startsWith("brain.business_name")), "the issue names its field");
});

test("F33: the prompt card says which channel reads it", () => {
  assert.ok(pane.includes('"every WhatsApp message, word for word"'));
  assert.ok(pane.includes("every phone call, composed when the call starts"), "the phone line reads the composed prompt at call start");
  assert.ok(!pane.includes("<span>every message, word for word</span>"));
});

test("F35: every pause reads the workspace's own pause_hours, not a hard-coded day", () => {
  const verbs = readCode("apps/dashboard/src/server/verbs.ts");
  assert.ok(verbs.includes("export async function pauseMsFor(ctx: RouteContext, tenantId: string): Promise<number>"));
  assert.ok(verbs.includes('.eq("class", "reply")'));
  for (const rel of ["apps/dashboard/app/api/v1/conversations/[id]/take-over/route.ts", "apps/dashboard/app/api/v1/conversations/[id]/reply/route.ts"]) {
    const src = readCode(rel);
    assert.ok(src.includes("await pauseMsFor(ctx, conv.tenant_id)"), `${rel} reads the limit`);
    assert.ok(!src.includes("PAUSE_MS"), `${rel}: REGRESSION — Settings said N hours, the verb paused for 24`);
  }
  const wa = readCode("apps/edge/api/whatsapp.ts");
  const inbound = readCode("apps/edge/lib/whatsapp/inbound.ts");
  const alerts = readCode("apps/edge/lib/whatsapp/alerts.ts");
  assert.ok(wa.includes("const echoPauseMs = (echoLimits.pause_hours ? echoLimits.pause_hours * 3600 * 1000 : PAUSE_MS);"));
  assert.ok(!wa.includes("t.pausedUntil = Date.now() + PAUSE_MS;"), "the WhatsApp-app echo honoured nothing");
  assert.ok(alerts.includes("the receptionist is paused on this thread for ${pauseHours}h."), "and the handoff email states the same number");
  assert.equal((inbound.match(/, pauseHours[,)]/g) ?? []).length + (inbound.match(/\n\s+pauseHours,\n/g) ?? []).length, 13, "every handoff email carries it — thirteen since the carriers' hold got its own; two also carry the thread route");
});

test("F36/F37: alerts that go to Chanlytics say so; switching a number off is described as it is", () => {
  assert.ok(pane.includes("Goes to Chanlytics, not to the addresses above"));
  assert.equal((pane.match(/platform: true/g) ?? []).length, 2, "exactly the two platform alerts");
  assert.ok(pane.includes("except the two marked for Chanlytics"));
  assert.ok(!pane.includes("emails you every message instead"), "REGRESSION: promised an email nothing sends");
  // The channels sentence moved with the pane it belongs to; the alerts
  // above it are the notifications pane and stay in the settings shell.
  assert.ok(readRaw("apps/dashboard/src/legacy/pages/integrations-real.jsx").includes("neither answered nor recorded — Chanlytics is told they are arriving, you are not"));
});

test("F50: gates match doors — the business form is owner-only like PUT /settings; a delay edit sends no mode; an invite has no role menu", () => {
  assert.equal(ROLE_PERMS.owner.settings, true);
  assert.equal(ROLE_PERMS.operator.settings, false, "PUT /settings is owner-only; an operator's form opened on the autonomy gate and was refused at Save");
  assert.equal(ROLE_PERMS.viewer.settings, false);
  assert.equal((pane.match(/window\.gate\("settings"\)/g) ?? []).length, 3, "Edit, Save and Set up");
  const editor = pane.slice(pane.indexOf("const BusinessEditor"), pane.indexOf("const PaneWorkspace"));
  assert.ok(!editor.includes('gate("autonomy")'), "the form no longer opens on a gate the door refuses");
  assert.ok(pane.includes('gate("autonomy")'), "the autonomy matrix keeps its own gate — PUT /policies is operator-or-owner");
  // Delay edits.
  assert.ok(pane.includes("if (d && reply) put(reply, undefined, d[1]);"));
  assert.ok(!pane.includes("reply.mode.toLowerCase()"), "REGRESSION: a stale page changing the hold window resent its remembered mode");
  const policies = readCode("apps/dashboard/app/api/v1/policies/route.ts");
  assert.ok(policies.includes("mode = current.mode;"), "the row keeps the mode it has");
  assert.ok(verbsBridge.includes("export async function setPolicy(cls: string, mode: string | undefined, replyDelayMs?: number, minConfidence?: number)"));
  assert.ok(verbsBridge.includes("...(mode !== undefined ? { mode } : {})"));
  // Invites.
  assert.ok(pane.includes("...(pending && realRoster ? [] : ["), "an open invitation has no membership row to change the role on");
});
