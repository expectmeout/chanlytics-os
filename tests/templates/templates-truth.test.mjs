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
import { LIBRARY_WORDS, TEMPLATE_STATUSES } from "@chanlytics/contracts";
import { readCode, importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const TENANT = "00000000-0000-0000-0000-000000000000";

test("the table holds category, the two after-approval statuses, why rejected and when synced; the contract agrees", async () => {
  // The database in memory refuses what Postgres refuses, from the closed sets and columns the Database workflow holds
  // to the replayed migrations (_schema.mjs): a row of every status the contract names lands, and one it does not name
  // is refused, as 00045's checks refuse it. (Pinned as 00045's text until 26 Nov 2026.)
  assert.deepEqual([...TEMPLATE_STATUSES], ["approved", "pending", "rejected", "paused", "disabled"]);
  const db = fakeDb({ templates: [] });
  const put = (over) =>
    db
      .from("templates")
      .insert({
        tenant_id: TENANT,
        channel: "whatsapp",
        name: `t_${JSON.stringify(over).length}_${Math.random()}`,
        language: "en_US",
        ...over,
      })
      .select("id")
      .single();
  for (const meta_status of TEMPLATE_STATUSES) assert.equal((await put({ meta_status })).error, null, meta_status);
  for (const category of ["marketing", "utility", "authentication"])
    assert.equal((await put({ category })).error, null, category);
  assert.equal((await put({ meta_status: "in_appeal" })).error?.code, "23514", "Meta's own words are mapped first");
  assert.equal((await put({ category: "promotional" })).error?.code, "23514");
  assert.equal(
    (await put({ rejected_reason: "INVALID_FORMAT", synced_at: "2026-09-05T12:00:00Z", quality: "GREEN" })).error,
    null,
    "why rejected, and when the row last matched Meta",
  );
});

test("Meta's words into the table's: status, category, the body, the numbered variables with examples, labels kept", async () => {
  const mod = await import(pathToFileURL(path.join(here, "../../apps/edge/lib/whatsapp/meta-templates.ts")).href);
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

// The dashboard: the sync route is an operator's, counted with the other settings changes (its policy, run in
// playbooks/routes/); it asks the edge's sync door for this workspace in production alone, and says a missing account
// or a silent Meta in the owner's words; Settings' read carries the category, Meta's verdict and why, and when it last
// matched (routes/what-meta-holds-is-asked-of-the-edge.test.mjs). `?all=1` is Settings' read and the composer still sees
// approved only: RUN through the route in playbooks/routes/ ("templates: the composers see the approved and unhidden")
// and its reader in ask/readers/. Pinned as the route's, the service's and the reader's text until 26 Nov 2026.

test("the webhook writes the row Meta changed; Settings shows every template with its status and one verb", async () => {
  // A recategorised template changes who may receive it (template_category_update), Meta's verdict and its reason are written on the row, its kind moved by name and language, and a quality flag leaves
  // an approved template approved: all three run in whatsapp/a-template-s-verdict-reaches-its-row.test.mjs.
  // A message's sheet (message-row-parts.tsx): the list that stood beside it went as Messages folded into Campaigns.
  // No sync button (the Messages redesign's step 5): a message's name menu is Rename, Put away, Add a language and
  // Delete, drawn whole in templates/sheet/message-versions-page.test.mjs. WhatsApp is asked quietly as Campaigns opens,
  // whichever view is on screen (parts/whatsapp-list.ts; Campaigns, one tab, call C11: it was the Messages page's own) --
  // the one read left here: no test draws Campaigns' route yet.
  assert.ok(
    readCode("apps/dashboard/src/surfaces/campaigns/home/route.tsx").includes("useWhatsAppListAsked()"),
    "Campaigns asks it as it opens",
  );
  // The head's hover is contracts' (the page draws it: message-versions-page.test.mjs): it says who a marketing message reaches.
  assert.ok(LIBRARY_WORDS.headTip.includes("A marketing message can only go to people who said yes to offers."));
  // Settings' read asks every template with its status, once: run over a wire that records it in
  // shell/hearing/templates-are-read-once.test.mjs ("the settings read is the one read of them").
  assert.deepEqual(
    (await importSrc("apps/dashboard/src/bridge/refresh-map.ts")).AFTER["POST templates/sync"]().map((o) => o.key),
    ["settings"],
    "Settings' read is the one read of the templates: the Inbox's reply box and the composers are made of it (offered-templates.ts)",
  );
});
