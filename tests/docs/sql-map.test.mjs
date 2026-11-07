/**
 * docs/sql-map.md is what tooling/scripts/gen/sql-map.mjs writes from supabase/schema.sql, the migrations' clock and
 * the code (decision 0111).
 *
 * Every function in the schema is on it with who may call it and who does, and a function nothing calls is named with
 * why it stays, or it is dropped: 658 functions had no map before, and one of them had been read by nothing since
 * 00019. No database: the snapshot is committed, and the callers are read off the syntax tree.
 *
 *   corepack pnpm gen:sql-map
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../_source.mjs";
import { OUT as SNAPSHOT } from "../../tooling/scripts/gen/schema-snapshot.mjs";
import {
  KEPT_WITH_NO_CALLER,
  OUT,
  clockOf,
  codeCallersOf,
  functionsOf,
  generate,
  mapOf,
  uncalled,
} from "../../tooling/scripts/gen/sql-map.mjs";

const snapshot = fs.readFileSync(path.join(ROOT, SNAPSHOT), "utf8").replace(/\r\n/g, "\n");

test("the page is what the script writes", () => {
  const page = fs.readFileSync(path.join(ROOT, OUT), "utf8").split("\r\n").join("\n");
  const next = generate();
  if (page === next) return;
  const a = page.split("\n");
  const b = next.split("\n");
  let i = 0;
  while (a[i] === b[i]) i++;
  assert.fail(
    `${OUT} is stale at line ${i + 1}:\n  page       ${a[i] ?? "(end)"}\n  generated  ${b[i] ?? "(end)"}\n` +
      "Run `corepack pnpm gen:sql-map` (after `corepack pnpm gen:schema-snapshot` when a migration changed), and commit it.",
  );
});

test("a function nothing calls is named with why it stays, and a function named so is still one nothing calls", () => {
  const names = [...functionsOf(snapshot).fns.keys()];
  const none = uncalled(mapOf(snapshot, { clock: clockOf(), ...codeCallersOf(names) }));
  assert.deepEqual(
    none.filter((n) => !(n in KEPT_WITH_NO_CALLER)),
    [],
    "give it a caller, name it in KEPT_WITH_NO_CALLER (tooling/scripts/gen/sql-map.mjs) with why, or drop it by a migration",
  );
  assert.deepEqual(
    Object.keys(KEPT_WITH_NO_CALLER).filter((n) => !none.includes(n)),
    [],
    "a function named as called by nothing is called now, or gone: take it out of KEPT_WITH_NO_CALLER",
  );
});

test("a function reads off the dump: its kind, who may call it, and who does", () => {
  const dump = `
CREATE TABLE public.notes (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    body text
);
CREATE FUNCTION public.note_add(p_tenant_id uuid, p_body text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.may_write(p_tenant_id) then raise exception 'no'; end if;
  return null;
end $$;
CREATE FUNCTION public.may_write(p_tenant_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ select true $$;
CREATE FUNCTION public.notes_stamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ begin return new; end $$;
CREATE FUNCTION public.note_is_long(n public.notes) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$ select length(n.body) > 80 $$;
CREATE FUNCTION public.note_is_old(p_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$ select false $$;
COMMENT ON FUNCTION public.note_add(p_tenant_id uuid, p_body text) IS 'A member''s note: it says so.';
GRANT ALL ON FUNCTION public.note_add(p_tenant_id uuid, p_body text) TO authenticated;
GRANT ALL ON FUNCTION public.note_add(p_tenant_id uuid, p_body text) TO service_role;
GRANT ALL ON FUNCTION public.may_write(p_tenant_id uuid) TO service_role;
CREATE CONSTRAINT TRIGGER notes_stamp AFTER INSERT ON public.notes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN ((public.note_is_old(new.id) IS FALSE)) EXECUTE FUNCTION public.notes_stamp();
CREATE POLICY notes_member_read ON public.notes FOR SELECT TO authenticated USING (public.may_write(tenant_id));
`;
  const code = new Map([["note_add", new Set(["apps/edge/lib/notes/notes.ts"])]]);
  const map = mapOf(dump, {
    clock: new Map([["notes-sweep", "select public.note_is_long(null)"]]),
    code,
    scripts: new Map(),
  });
  const row = (n) => map.find((r) => r.name === n);
  assert.deepEqual(
    map.map((r) => [r.name, r.kind]),
    [
      ["may_write", "the server's"],
      ["note_add", "door"],
      ["note_is_long", "computed column"],
      ["note_is_old", "the server's"],
      ["notes_stamp", "trigger"],
    ],
  );
  assert.deepEqual(row("note_add").mayCall, ["a signed-in person", "the server"]);
  assert.equal(row("note_add").comment, "A member's note: it says so.");
  assert.deepEqual(row("note_add").calledBy.code, ["apps/edge/lib/notes/notes.ts"]);
  assert.deepEqual(row("may_write").calledBy.sql, ["note_add"], "another function's body");
  assert.deepEqual(row("may_write").calledBy.rules, ["rule notes_member_read on notes"], "a rule");
  assert.deepEqual(row("notes_stamp").calledBy.triggers, ["notes_stamp on notes"], "a constraint trigger runs it");
  assert.deepEqual(row("note_is_old").calledBy.triggers, ["notes_stamp on notes"], "its WHEN asks it");
  assert.deepEqual(row("note_is_long").calledBy.clock, ["notes-sweep"], "the clock");
  assert.deepEqual(uncalled(map), [], "each is called by something");
});
