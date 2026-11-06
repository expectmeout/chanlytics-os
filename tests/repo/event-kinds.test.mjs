/**
 * Every event kind declared is emitted somewhere, and every kind emitted is
 * declared. A repo-wide lint (listed in SOURCE_SCAN_EXEMPT, _measures.mjs).
 *
 * Three declared kinds were never written and fourteen written kinds were
 * never declared before this existed; an owner reading the activity log
 * would have met rows nobody could name. The emitters are found the way they
 * are written: `insert into events` in a migration, `emitEvent(...)` and
 * `recordEvent(...)` (packages/db events.ts, the one writer, whose table the
 * compiler holds to EVENT_KINDS: events.type-test.ts), the send door's own
 * `event(...)`, a direct `.from("events").insert({ kind })`, and a `*_KIND`
 * constant. Meta's account webhooks are the one computed
 * family, `channel.<field>`, held to WABA_FIELDS in contracts.
 *
 * And a measure on the same map (the wiring's second audit, R11 S11-9; _measures.mjs TS_ONLY_EVENTS, held by
 * check:debt): the kinds no SQL door writes, told from TypeScript after the fact they announce, each with how many
 * files write it. A fact and its event share a transaction (decision 0031, invariant 2), and doors-without-events sees
 * only the SQL side of that. The kinds may only go away (a set: the numbers are a record).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EVENT_KINDS, WABA_FIELDS } from "@chanlytics/contracts";
import { readRaw } from "../_source.mjs";
import { EVENT_KIND, emittedKinds, walkTypeScript as walk } from "../_measures.mjs";

const KIND = EVENT_KIND;
const declared = new Set(EVENT_KINDS);
const channelFamily = new Set(WABA_FIELDS.map((f) => `channel.${f}`));
const emitted = emittedKinds;

test("every kind the product writes is declared, and every declared kind is written somewhere", () => {
  const by = emitted();
  const written = [...by.keys()].filter((k) => KIND.test(k));
  const undeclared = written.filter((k) => !declared.has(k) && !channelFamily.has(k)).sort();
  assert.deepEqual(
    undeclared.map((k) => `${k} <- ${[...by.get(k)].join(", ")}`),
    [],
    "emitted but not in EVENT_KINDS: declare it, or stop writing it",
  );
  const dead = [...declared].filter((k) => !by.has(k)).sort();
  assert.deepEqual(
    dead,
    [],
    "declared but nothing writes it: a dead kind, or an emitter this lint cannot see (teach it the shape)",
  );
  assert.ok(written.length >= 40, `the lint saw ${written.length} kinds; the product writes more than that`);
});

test("the computed family is the contracts' list, and nothing else is computed", () => {
  assert.deepEqual([...WABA_FIELDS].sort(), [
    "account_review_update",
    "account_update",
    "message_template_quality_update",
    "message_template_status_update",
    "phone_number_name_update",
    "phone_number_quality_update",
    "template_category_update",
  ]);
  const waba = readRaw("apps/edge/lib/whatsapp/waba-events.ts");
  assert.ok(waba.includes("new Set<string>(WABA_FIELD_LIST)"), "the edge's set is the contracts' list");
  // The one template-literal emit is the channel family; any other would be a kind nobody can name.
  let computed = 0;
  for (const dir of [
    "apps/edge",
    "apps/dashboard/src",
    "apps/dashboard/app",
    "packages/db/src",
    "packages/core/src",
    "packages/jobs/src",
  ]) {
    for (const f of walk(dir)) {
      const src = readRaw(f);
      for (const m of src.matchAll(/emitEvent\(\s*[^,]+,\s*[^,]+,\s*`([^`]*)`/g)) {
        computed += 1;
        assert.equal(m[1], "channel.${change.field}", `a computed kind in ${f}: ${m[1]}`);
      }
    }
  }
  assert.equal(computed, 1);
});
