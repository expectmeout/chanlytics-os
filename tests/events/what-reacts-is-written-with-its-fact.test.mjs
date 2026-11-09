/**
 * An event something reacts to is written with its fact (layer 10, decision 0115). `emitEvent` writes one afterwards and only
 * logs a failure, which is fine for the record of what happened and is not for a team's notice: member.left, written that way
 * when a person deleted their account, could be lost for good. So a kind in event_subscriptions may not be written by it, and
 * every such kind has a shape its deliveries read through (contracts SUBSCRIBED_EVENTS).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import { repoFiles, parse } from "../_ast.mjs";
import { EVENT_SUBSCRIBERS } from "../../packages/contracts/src/shared/enums.ts";
import { SUBSCRIBED_EVENTS, eventFieldsOff } from "../../packages/contracts/src/events/subscribed.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The kinds the migrations subscribe to a subscriber this build has. */
function subscribedKinds() {
  const dir = path.join(ROOT, "supabase/migrations");
  const named = new Set(EVENT_SUBSCRIBERS);
  const kinds = new Set();
  for (const f of fs.readdirSync(dir).sort()) {
    const sql = fs.readFileSync(path.join(dir, f), "utf8").replace(/--[^\n]*/g, "");
    for (const [insert] of sql.matchAll(/insert into public\.event_subscriptions[\s\S]*?;/g))
      for (const m of insert.matchAll(/\('([a-z_.]+)',\s*'([a-z_]+)',\s*\d\)/g)) if (named.has(m[2])) kinds.add(m[1]);
  }
  return [...kinds].sort();
}

test("every kind something reacts to has its shape, and none is left over", () => {
  const kinds = subscribedKinds();
  assert.ok(kinds.length >= 7, `read ${kinds.length} subscribed kinds`);
  assert.deepEqual(Object.keys(SUBSCRIBED_EVENTS).sort(), kinds);
});

test("no kind something reacts to is written by emitEvent: its failure would lose the reaction for good", () => {
  const subscribed = new Set(subscribedKinds());
  const off = [];
  let calls = 0;
  for (const file of repoFiles(["apps/edge", "apps/dashboard/src", "apps/dashboard/app", "packages"], {
    keep: /\.(ts|tsx)$/,
  })) {
    const sf = parse(file);
    const visit = (n) => {
      if (ts.isCallExpression(n) && n.expression.getText(sf).endsWith("emitEvent")) {
        calls++;
        const kind = n.arguments[2];
        // A kind in a variable is read at its own type (EmittedKind); a literal is what this holds.
        if (kind && ts.isStringLiteralLike(kind) && subscribed.has(kind.text)) off.push(`${file}: ${kind.text}`);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  assert.ok(calls >= 30, `read ${calls} emitEvent calls; the code holds more than that`);
  assert.deepEqual(off, [], "write it with its fact in SQL, or with recordEvent and a next read that finishes it");
});

test("what a SQL function writes for a kind something reacts to holds the fields its subscribers read", () => {
  const schema = fs.readFileSync(path.join(ROOT, "supabase/schema.sql"), "utf8").replace(/\r\n/g, "\n");
  const off = [];
  let read = 0;
  for (const fn of schema.split(/\n(?=CREATE FUNCTION )/)) {
    if (!fn.startsWith("CREATE FUNCTION")) continue;
    const name = /^CREATE FUNCTION public\.([a-z0-9_]+)/.exec(fn)[1];
    for (const [insert] of fn.split(/\n\n--\n/)[0].matchAll(/insert into (?:public\.)?events\b[\s\S]*?;/g)) {
      const kind = /'((?:appointment|contact|escalation|member)\.[a-z_]+)'/.exec(insert)?.[1];
      if (!kind || !Object.hasOwn(SUBSCRIBED_EVENTS, kind)) continue;
      const built = /jsonb_build_object\(([\s\S]*)\)/.exec(insert)?.[1];
      if (!built) continue;
      read++;
      const fields = [...built.matchAll(/'([a-z_]+)',/g)].map((m) => m[1]);
      for (const [field, schemaOf] of Object.entries(SUBSCRIBED_EVENTS[kind].shape))
        if (!schemaOf.safeParse(undefined).success && !fields.includes(field))
          off.push(`${name}: ${kind} has no ${field}`);
    }
  }
  assert.ok(read >= 3, `read ${read} SQL writers of a subscribed kind`);
  assert.deepEqual(off, []);
});

test("delete_my_account says member.left in its own transaction, before the seats go", () => {
  const schema = fs.readFileSync(path.join(ROOT, "supabase/schema.sql"), "utf8").replace(/\r\n/g, "\n");
  const at = schema.indexOf("CREATE FUNCTION public.delete_my_account()");
  const body = schema.slice(at, schema.indexOf("end $$;", at));
  const said = body.indexOf("'member.left'");
  assert.ok(said > 0, "the door writes it");
  assert.ok(said < body.indexOf("delete from memberships"), "while the seats it names are still there");
});

test("what is off is said by name, and never by what it holds", () => {
  assert.deepEqual(eventFieldsOff("member.left", { by: "u1", how: "left" }), []);
  assert.deepEqual(
    eventFieldsOff("member.left", { by: "u1", how: "left", more: "a thing nothing reads" }),
    [],
    "loose",
  );
  assert.deepEqual(eventFieldsOff("member.left", { how: "gone" }), ["by", "how"]);
  assert.deepEqual(eventFieldsOff("escalation.opened", null), ["(the data)"]);
  assert.deepEqual(eventFieldsOff("a.kind.nothing.reacts.to", {}), []);
});
