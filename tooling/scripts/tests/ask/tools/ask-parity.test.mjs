/**
 * Ask's hands on every page (the operator, 15 Oct 2026): every verb a page's button or sheet commits is a card an Ask
 * act tool proposes, or a verb contracts' guide says stays on its page, with why (ASK_PAGE_ONLY_VERBS); every verb is on
 * one page of the guide (ASK_GUIDE_PAGES), so "what can you do?" is answered from the build; and every page verb the
 * guide names is one the verb table has. A new page verb that ships with neither Ask's hand nor a written reason is a
 * red build. The real registry and the real tables are read, as ask-tools-size.test.mjs reads them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { ACT_DEFS } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { PROPOSAL_SPECS, ASK_GUIDE_PAGES, ASK_PAGE_ONLY_VERBS } = await import("@chanlytics/contracts");

const kinds = Object.keys(PROPOSAL_SPECS);
const proposed = new Set(
  ACT_DEFS.flatMap((tool) => Object.values(tool.actions).flatMap((d) => [d.kind, ...(d.makes ?? [])])),
);

test("every verb a page commits is a card Ask proposes, or the guide says why it stays on its page", () => {
  const neither = kinds.filter((k) => !proposed.has(k) && !Object.hasOwn(ASK_PAGE_ONLY_VERBS, k));
  assert.deepEqual(neither, [], `verbs with no Ask card and no reason: ${neither.join(", ")}`);
});

test("a verb the guide keeps on its page is not also proposed, and says why", () => {
  for (const [kind, why] of Object.entries(ASK_PAGE_ONLY_VERBS)) {
    assert.ok(kinds.includes(kind), `${kind} is not a verb`);
    assert.ok(!proposed.has(kind), `${kind} is both page-only and an Ask card`);
    assert.ok(typeof why === "string" && why.length > 20, `${kind} says why it stays on its page`);
  }
});

test("every verb is on exactly one page of the guide, and every verb the guide names is one the table has", () => {
  const onPages = ASK_GUIDE_PAGES.flatMap((p) => p.verbs);
  const twice = onPages.filter((k, i) => onPages.indexOf(k) !== i);
  assert.deepEqual(twice, [], `verbs on two pages: ${twice.join(", ")}`);
  const unknown = onPages.filter((k) => !kinds.includes(k));
  assert.deepEqual(unknown, [], `the guide names verbs the table lacks: ${unknown.join(", ")}`);
  const missing = kinds.filter((k) => !onPages.includes(k));
  assert.deepEqual(missing, [], `verbs on no page of the guide: ${missing.join(", ")}`);
});

test("every act tool's action makes a kind the table has", () => {
  for (const tool of ACT_DEFS)
    for (const [action, def] of Object.entries(tool.actions))
      assert.ok(kinds.includes(def.kind), `${tool.name}.${action} makes ${def.kind}, which no spec commits`);
});
