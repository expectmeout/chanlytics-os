/**
 * The truth pass: the last places a real workspace could reach something
 * seeded or something that silently did nothing.
 *
 * Settings → Billing and → AI memory fell through the shell's gate, which
 * replaced the whole settings page with a bare card titled "billing"; the
 * Conversations menu offered Export and Assign that opened an overlay stubbed
 * outside demos; the thread menu's "Mark as unread" flipped a flag the next
 * reseed wiped and "Block sender" opened the same dead overlay; a diagnostics
 * page shipped as a production route; two mockup files nobody loaded were
 * still in the tree.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, readCode, readRaw } from "./_source.mjs";

test("AI memory is an honest pane that keeps the settings nav; Billing is real", () => {
  const settings = readRaw("apps/dashboard/src/legacy/pages/settings.jsx");
  assert.ok(settings.includes('{active.id === "memory" && (window.__SETTINGS === undefined ? <PaneMemory flash={flash} /> : <PaneSoon which="memory" onTab={onTab} />)}'));
  assert.ok(settings.includes('{active.id === "billing" && (window.__SETTINGS === undefined ? <PaneBilling flash={flash} /> : <window.PaneBillingReal flash={flash} />)}'), "Billing is real on a workspace: billing-real.jsx");
  assert.ok(settings.includes('data-testid={`soon-${which}`}'), "the pane is addressable by the e2e");
  assert.ok(settings.includes("does not learn rules on its own yet"), "AI memory says what is true");
  assert.ok(!settings.includes("There is no billing in the product yet"), "nothing says billing is not built any more");
  assert.ok(settings.includes('action: { label: "Open Workspace", tab: "workspace"'), "and points at where the knowledge lives");
  // The registry classifies both panes so the gate no longer swallows the page.
  const registry = readCode("apps/dashboard/src/legacy-bridge/surface-registry.ts");
  for (const pane of ["billing", "memory"]) {
    assert.ok(registry.includes(`"admin/${pane}": "real"`), `${pane} classified`);
    assert.ok(registry.includes(`"admin/${pane}": "settings"`), `${pane} waits for the settings data like the other panes`);
  }
});

test("outside a demo the Conversations header has no menu of things that do nothing", () => {
  const page = readCode("apps/dashboard/src/legacy/pages/conversations.jsx");
  const menu = page.indexOf('{ label: "Export transcript"');
  const gate = page.lastIndexOf("{window.__DEMO_MODE && (", menu);
  assert.ok(menu > 0 && gate > 0 && menu - gate < 400, "the Export/Assign menu renders only in a demo");
});

test("the thread menu on a real workspace offers only verbs that act", () => {
  const page = readCode("apps/dashboard/src/legacy/pages/inbox-thread.jsx");
  assert.ok(page.includes('...(window.__DEMO_MODE ? [{ label: "Mark as unread"'), "Mark as unread is demo-only until unread state exists");
  assert.ok(page.includes('{ label: "Block sender", icon: "x", danger: true'), "the demo keeps its item");
  const block = page.indexOf('{ label: "Block sender"');
  const gate = page.lastIndexOf("...(window.__DEMO_MODE", block);
  assert.ok(gate > 0 && block - gate < 120, "Block sender is behind the demo gate");
  assert.ok(page.includes('{ label: "Receptionist for this person…", icon: "shield", onClick: () => onOpenClient(thread.clientId) }'), "a real session is sent to the per-person mode instead");
});

test("no diagnostics page in production, and the unloaded mockup files are gone", () => {
  assert.ok(!fs.existsSync(path.join(ROOT, "apps/dashboard/app/(os)/foundation")), "app/(os)/foundation still exists");
  assert.ok(!readCode("apps/dashboard/app/(os)/error.tsx").includes("/foundation"), "the error page still links to it");
  assert.ok(!readRaw("e2e/auth-gate.spec.ts").includes('"/foundation"'), "the e2e still probes it");
  for (const rel of ["apps/dashboard/src/legacy/design-canvas.jsx", "apps/dashboard/src/legacy/tweaks-panel.jsx"]) {
    assert.ok(!fs.existsSync(path.join(ROOT, rel)), `${rel} still in the tree`);
  }
  assert.ok(!readCode("apps/dashboard/src/legacy-bridge/manifest.ts").includes("design-canvas"), "nothing imports the deleted files");
});
