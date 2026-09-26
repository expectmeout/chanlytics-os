/**
 * Templates as Meta holds them.
 *
 * The table knew a name, a language and three statuses, and its one row was
 * written by hand. A broadcast needs the category (marketing needs the
 * customer's yes), the two after-approval statuses, why a template was
 * rejected, and when the row last matched Meta. Now: a sync from the
 * number's own account, a webhook that keeps the row current, and a card
 * in Settings that shows every template with its status and one verb.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TEMPLATE_STATUSES } from "@chanlytics/contracts";
import { readCode, readRaw, importSrc } from "../_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const TENANT = "00000000-0000-0000-0000-000000000000";

test("the migration: category, the two after-approval statuses, why rejected, when synced; the contract agrees", () => {
  const m = readRaw("supabase/migrations/00045_templates_truth.sql");
  assert.ok(
    m.includes("add column category        text check (category in ('marketing', 'utility', 'authentication'))"),
  );
  assert.ok(m.includes("check (meta_status in ('approved', 'pending', 'rejected', 'paused', 'disabled'))"));
  assert.ok(m.includes("add column synced_at       timestamptz"));
  assert.deepEqual([...TEMPLATE_STATUSES], ["approved", "pending", "rejected", "paused", "disabled"]);
});

test("Meta's words into the table's: status, category, the body, the numbered variables with examples, labels kept", async () => {
  const mod = await import(pathToFileURL(path.join(here, "../../../../apps/edge/lib/whatsapp/meta-templates.ts")).href);
  assert.equal(mod.mapStatus("APPROVED"), "approved");
  assert.equal(mod.mapStatus("IN_APPEAL"), "pending");
  assert.equal(mod.mapStatus("PENDING_DELETION"), "disabled");
  assert.equal(mod.mapStatus("PAUSED"), "paused");
  assert.equal(mod.mapStatus(undefined), "pending");
  assert.equal(mod.mapCategory("MARKETING"), "marketing");
  assert.equal(mod.mapCategory("weird"), null);
  const t = {
    id: "123",
    name: "spring_offer",
    language: "en_US",
    status: "APPROVED",
    category: "MARKETING",
    quality_score: { score: "GREEN" },
    rejected_reason: "NONE",
    components: [
      { type: "HEADER", format: "TEXT", text: "Hi {{1}}" },
      {
        type: "BODY",
        text: "Hi {{1}}, {{2}} is 20% off this week at {{3}}.",
        example: { body_text: [["Dani", "Balayage", "Marisa's"]] },
      },
      { type: "FOOTER", text: "Reply STOP to opt out" },
    ],
  };
  assert.equal(mod.bodyOf(t), "Hi {{1}}, {{2}} is 20% off this week at {{3}}.");
  assert.deepEqual(mod.variablesOf(t), [
    { position: 1, label: "Value 1", example: "Dani" },
    { position: 2, label: "Value 2", example: "Balayage" },
    { position: 3, label: "Value 3", example: "Marisa's" },
  ]);
  assert.deepEqual(
    mod.variablesOf(t, [{ position: 2, label: "Service", example: null }]).map((v) => v.label),
    ["Value 1", "Service", "Value 3"],
    "a label a person gave survives a sync",
  );
  const row = mod.templateRow(t, TENANT, [], new Date("2026-09-05T12:00:00Z"));
  assert.equal(row.meta_status, "approved");
  assert.equal(row.category, "marketing");
  assert.equal(row.quality, "GREEN");
  assert.equal(row.rejected_reason, null);
  assert.equal(row.synced_at, "2026-09-05T12:00:00.000Z");
  assert.equal(row.channel, "whatsapp");
  const rej = mod.templateRow({ ...t, status: "REJECTED", rejected_reason: "INVALID_FORMAT" }, TENANT);
  assert.equal(rej.meta_status, "rejected");
  assert.equal(rej.rejected_reason, "INVALID_FORMAT");
  assert.deepEqual(mod.labelsOf([{ position: 1, label: "Business name", example: "x" }, "junk"]), [
    { position: 1, label: "Business name", example: null },
  ]);
  assert.equal(mod.bodyOf({ ...t, components: [] }), null);
});

// The edge sync -- the number's own credentials, the WABA on the channel,
// upsert what Meta returns, leave the rest exactly as it was, labels kept --
// is run in templates-doors.test.mjs.

test("the dashboard: the route proves the operator, the service reaches the edge in production only, the composer still sees approved only", () => {
  const r = readCode("apps/dashboard/app/api/v1/templates/sync/route.ts");
  assert.ok(r.includes('role: "operator",') && r.includes('rate: "settings",'));
  assert.ok(r.includes("no_waba:") && r.includes("meta_failed:"));
  const svc = readCode("apps/dashboard/src/server/campaigns/meta-templates.ts");
  assert.ok(svc.includes("`${edgeUrl()}/api/admin/whatsapp/templates-sync`"));
  const g = readCode("apps/dashboard/app/api/v1/templates/route.ts");
  assert.ok(
    g.includes('const all = input.all === "1";') &&
      g.includes('if (!all) q = q.eq("meta_status", "approved").is("hidden_at", null);'),
  );
  assert.ok(
    g.includes("category, meta_status, quality, rejected_reason, synced_at"),
    "the picker can tell marketing from utility",
  );
});

test("the webhook writes the row Meta changed; Settings shows every template with its status and one verb", async () => {
  const w = readCode("apps/edge/lib/whatsapp/waba-events.ts");
  assert.ok(w.includes('"template_category_update"'), "a recategorised template changes who may receive it");
  assert.match(w, /\.from\("templates"\)\s*\.update\(\{ meta_status: mapStatus\(event\), rejected_reason: reason \}\)/);
  assert.match(w, /\.from\("templates"\)\s*\.update\(\{\s*category: mapCategory\(/);
  assert.ok(
    w.includes(
      'const TEMPLATE_STATUS_EVENTS = new Set(["APPROVED", "REJECTED", "PAUSED", "DISABLED", "PENDING_DELETION", "IN_APPEAL"]);',
    ),
    "a quality flag leaves an approved template approved",
  );
  const s = readCode("apps/dashboard/src/legacy/pages/messages.jsx");
  assert.ok(
    s.includes('data-testid="templates"') &&
      s.includes('data-testid="template-row"') &&
      s.includes('data-testid="sync-templates"'),
  );
  assert.ok(s.includes("A marketing template can only go to people who said yes to offers."));
  assert.ok(
    readCode("apps/dashboard/src/legacy-bridge/surface-data.ts").includes(
      'read("GET templates", { query: { all: "1" } })',
    ),
  );
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx").includes("installTemplates();"));
  assert.deepEqual(
    (await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts")).AFTER["POST templates/sync"]().map(
      (o) => o.key,
    ),
    ["settings", "inbox"],
    "the composer learns of a newly approved template too",
  );
});
