/**
 * Every event kind declared is emitted somewhere, and every kind emitted is
 * declared. A repo-wide lint (registered in source-scan-baseline.json).
 *
 * Three declared kinds were never written and fourteen written kinds were
 * never declared before this existed; an owner reading the activity log
 * would have met rows nobody could name. The emitters are found the way they
 * are written: `insert into events` in a migration, `emitEvent(...)`, the
 * send door's own `event(...)`, a direct `.from("events").insert({ kind })`,
 * and a `*_KIND` constant. Meta's account webhooks are the one computed
 * family, `channel.<field>`, held to WABA_FIELDS in contracts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { EVENT_KINDS, WABA_FIELDS } from "@chanlytics/contracts";
import { ROOT, readRaw } from "./_source.mjs";

const KIND = /^[a-z_]+\.[a-z_]+$/;
const declared = new Set(EVENT_KINDS);
const channelFamily = new Set(WABA_FIELDS.map((f) => `channel.${f}`));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name === ".next" || e.name === "tests") continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".d.ts")) out.push(rel);
  }
  return out;
}

/** kind → the files that write it. */
function emitted() {
  const by = new Map();
  const add = (kind, file) => {
    if (!by.has(kind)) by.set(kind, new Set());
    by.get(kind).add(file);
  };
  // SQL: each insert into events, the first dotted literal in its values.
  for (const f of fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((n) => n.endsWith(".sql"))) {
    const src = readRaw(`supabase/migrations/${f}`);
    for (const m of src.matchAll(/insert into (?:public\.)?events\b([\s\S]*?);/g)) {
      const lit = m[1].match(/'([a-z_]+\.[a-z_]+)'/);
      if (lit) add(lit[1], `supabase/migrations/${f}`);
    }
  }
  // TypeScript: the runtimes and the packages, never the tests or the built copies.
  for (const dir of [
    "apps/edge",
    "apps/dashboard/src",
    "apps/dashboard/app",
    "packages/db/src",
    "packages/core/src",
    "packages/jobs/src",
    "packages/channels/src",
    "packages/contracts/src",
  ]) {
    for (const f of walk(dir)) {
      const src = readRaw(f);
      const consts = new Map(
        [...src.matchAll(/const ([A-Z_]+_KIND)\s*=\s*"([a-z_]+\.[a-z_]+)"/g)].map((m) => [m[1], m[2]]),
      );
      // Every literal inside the call, to its closing paren: a conditional that
      // picks one of three billing kinds names all three.
      for (const m of src.matchAll(/emitEvent\(/g)) {
        let depth = 0;
        let i = m.index;
        for (; i < src.length; i++) {
          if (src[i] === "(") depth++;
          else if (src[i] === ")") {
            depth--;
            if (depth === 0) break;
          }
        }
        const call = src.slice(m.index, i + 1);
        for (const lit of call.matchAll(/"([a-z_]+\.[a-z_]+)"/g)) if (KIND.test(lit[1])) add(lit[1], f);
        for (const c of call.matchAll(/\b([A-Z_]+_KIND)\b/g)) if (consts.has(c[1])) add(consts.get(c[1]), f);
      }
      for (const m of src.matchAll(/\.from\("events"\)\s*\.insert\(\{[\s\S]{0,400}?kind:\s*"([a-z_]+\.[a-z_]+)"/g))
        add(m[1], f);
      for (const m of src.matchAll(/\bevent\(\s*(?:ports\.)?db,\s*d,\s*"([a-z_]+\.[a-z_]+)"/g)) add(m[1], f);
      // A verdict that names its own event kind (channels/a2p: the line's texting state).
      for (const m of src.matchAll(/\bevent:\s*"(line\.[a-z_]+)"/g)) add(m[1], f);
    }
  }
  return by;
}

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
