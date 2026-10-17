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
import { ROOT, readCode, readRaw } from "../../_source.mjs";

test("AI memory is an honest pane that keeps the settings nav; Billing is real", () => {
  const settings = readRaw("apps/dashboard/src/surfaces/settings/frame/page.tsx");
  assert.ok(
    settings.includes(
      // The pane, wherever Settings is drawn: the mockup's twin, five invented memories with a Forget that kept nothing,
      // went with step 11 of decision 0015.
      '{id === "memory" && <PaneSoon which="memory" onTab={onTab} />}',
    ),
  );
  assert.ok(
    settings.includes('{id === "billing" && (') && settings.includes("<PaneBillingReal flash={flash} />"),
    "Billing is real on a workspace: surfaces/settings/billing, imported by the page",
  );
  assert.ok(settings.includes("data-testid={`soon-${which}`}"), "the pane is addressable by the e2e");
  assert.ok(settings.includes("does not learn rules on its own yet"), "AI memory says what is true");
  assert.ok(!settings.includes("There is no billing in the product yet"), "nothing says billing is not built any more");
  assert.ok(
    settings.includes('action: { label: "Open How it answers", tab: "receptionist"'),
    "and points at where the knowledge lives",
  );
  // The registry classifies both panes so the gate no longer swallows the page.
  const registry = readCode("apps/dashboard/src/legacy-bridge/surface-registry.ts");
  for (const pane of ["billing", "memory"]) {
    assert.ok(registry.includes(`"admin/${pane}": "real"`), `${pane} classified`);
    assert.ok(
      registry.includes(`"admin/${pane}": "settings"`),
      `${pane} waits for the settings data like the other panes`,
    );
  }
});

test("the thread menu on a real workspace offers only verbs that act", () => {
  const page = readCode("apps/dashboard/src/surfaces/inbox/thread/header.tsx");
  assert.ok(
    page
      .replace(/\s+/g, " ")
      .includes('...(demoSession() || (thread.real && thread.clientId) ? [{ label: "Mark as unread"'),
    "Mark as unread acts now (the reader's own mark, 00349): offered on a real thread where there is a person to mark",
  );
  assert.ok(/label: "Block sender",\s*glyph: ixGlyph\("x"\),\s*tone: "danger"/.test(page), "the demo keeps its item");
  const block = page.indexOf('label: "Block sender"');
  const gate = page.lastIndexOf("demoSession()", block);
  assert.ok(gate > 0 && block - gate < 120, "Block sender is behind the demo gate");
  assert.ok(
    page.includes(
      '{ label: "Receptionist settings", glyph: ixGlyph("shield"), onSelect: () => onOpenClient(thread.clientId) }',
    ),
    "a real session is sent to the per-person mode instead",
  );
});

test("no diagnostics page in production, and the unloaded mockup files are gone", () => {
  assert.ok(!fs.existsSync(path.join(ROOT, "apps/dashboard/app/(os)/foundation")), "app/(os)/foundation still exists");
  assert.ok(!readCode("apps/dashboard/app/(os)/error.tsx").includes("/foundation"), "the error page still links to it");
  assert.ok(!readRaw("e2e/auth/auth-gate.spec.ts").includes('"/foundation"'), "the e2e still probes it");
  for (const rel of ["apps/dashboard/src/legacy/design-canvas.jsx", "apps/dashboard/src/legacy/tweaks-panel.jsx"]) {
    assert.ok(!fs.existsSync(path.join(ROOT, rel)), `${rel} still in the tree`);
  }
  assert.ok(
    !readCode("apps/dashboard/src/legacy-bridge/manifest.ts").includes("design-canvas"),
    "nothing imports the deleted files",
  );
});
