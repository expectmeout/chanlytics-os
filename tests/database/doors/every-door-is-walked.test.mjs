/**
 * No door a signed-in person may call is left out of the door walk, held with no database (decision 0150).
 *
 * The walk (`_walk.mjs`, run on the stack by every-door-refuses-the-wrong-caller.db.test.mjs) calls every function the
 * session role may execute, as the wrong person. Its list is the database's own, so nothing is left out by forgetting.
 * A door is left out in effect when the walk cannot name one of this workspace's rows to it: an id it takes that the
 * walk has no row for is filled with one that exists nowhere, and a call about nothing proves nothing. This reads the
 * committed snapshot and fails for such an argument, so the pull request that adds the door says where its row comes
 * from (`ARG_ROWS`, or `DOOR_ARGS` for that door alone) before the database suites run. It also holds every list to the
 * schema: an entry for a door, an argument or a table that is gone fails as a missing one does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../../_source.mjs";
import { OUT as SNAPSHOT, statementsOf } from "../../../tooling/scripts/gen/schema-snapshot.mjs";
import {
  AN_ERASURE_KEEPS,
  ANSWERS_NO_PERSON_IN_WORDS,
  ARG_ROWS,
  A_KEPT_ROW_MAY_STAND,
  A_PASSWORD_ALONE_MAY,
  A_VIEWER_WRITES,
  DOOR_ARGS,
  REFUSES_IN_WORDS,
  SAME_FOR_EVERYONE,
  SEED_MORE,
  SEED_VALUES,
} from "./_lists.mjs";

const flat = (s) => s.replace(/\s+/g, " ").trim();

/** A function's arguments as the snapshot writes them in a grant: `p_a uuid, p_b timestamp with time zone`. */
function argsOf(list) {
  const out = [];
  let depth = 0;
  let from = 0;
  const text = flat(list);
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (c === "(") depth++;
    if (c === ")") depth--;
    if ((c === "," && depth === 0) || i === text.length) {
      const words = text.slice(from, i).trim().split(" ").filter(Boolean);
      from = i + 1;
      if (words.length === 0) continue;
      if (["IN", "INOUT", "VARIADIC"].includes(words[0])) words.shift();
      // One word is a type alone (a computed column's row); more is a name and its type.
      const [name, type] = words.length === 1 ? ["", words[0]] : [words[0], words.slice(1).join(" ")];
      out.push({ name, type: type.replace(/^public\./, "") });
    }
  }
  return out;
}

/**
 * What the snapshot says: the functions the session role may execute (trigger functions aside, which only a trigger
 * runs), each with its arguments, its body and the name the database prints for it; the tables; and which name a
 * workspace.
 */
function schemaOf(sql) {
  const granted = new Map();
  const made = new Map();
  const tables = new Map();
  const ids = new Set();
  for (const st of statementsOf(sql)) {
    const head = flat(st.text.slice(0, 4000));
    const grant = /^GRANT ALL ON FUNCTION public\.(\w+)\((.*)\) TO authenticated$/.exec(head.replace(/;$/, ""));
    if (grant) granted.set(`${grant[1]}(${flat(grant[2])})`, { name: grant[1], args: argsOf(grant[2]) });
    const fn = /^CREATE FUNCTION public\.(\w+)\(/.exec(head);
    if (fn) {
      const returnsTrigger = /\) RETURNS trigger\b/.test(head);
      const prev = made.get(fn[1]);
      made.set(fn[1], { trigger: returnsTrigger && (prev?.trigger ?? true), body: `${prev?.body ?? ""}\n${st.text}` });
    }
    const table = /^CREATE TABLE public\.(\w+) \(/.exec(head);
    if (table) {
      tables.set(table[1], /\n\s+tenant_id uuid\b/.test(st.text));
      for (const m of st.text.matchAll(/\n\s+(\w+) uuid\b/g)) ids.add(`${table[1]}.${m[1]}`);
    }
  }
  const doors = [...granted.values()]
    .filter((d) => !made.get(d.name)?.trigger)
    .map((d) => ({
      ...d,
      sig: `${d.name}(${d.args.map((a) => a.type).join(",")})`,
      body: made.get(d.name)?.body ?? "",
    }));
  return { doors, tables, ids };
}

const snapshot = fs.readFileSync(path.join(ROOT, SNAPSHOT), "utf8").replace(/\r\n/g, "\n");
const { doors, tables, ids } = schemaOf(snapshot);
const names = new Set(doors.map((d) => d.name));
const sigs = new Set(doors.map((d) => d.sig));

/** Whether the walk has a row under this name: a table that names a workspace (it seeds one row in each), or a second row. */
const hasRow = (row) => tables.get(row) === true || Object.hasOwn(SEED_MORE, row);
/** The table an id's name says, as the walk reads it: `p_contact_id` is `contacts`. */
function byName(arg) {
  const kind = arg.replace(/^p_/, "").replace(/_ids?$/, "");
  return [`${kind}s`, `${kind}es`, kind].filter((t) => tables.has(t)).sort((x, y) => y.length - x.length)[0];
}
const isWorkspace = (a) => a.type === "uuid" && ["p_tenant_id", "p_tenant"].includes(a.name);
const isId = (a) => ["uuid", "uuid[]"].includes(a.type) && !isWorkspace(a);

test("the snapshot's doors are read: every function the session role may execute, with its arguments", () => {
  assert.ok(doors.length > 300, `the doors are read (${doors.length})`);
  for (const sig of [
    "set_person_email(uuid,text)",
    "form_entry_hold(uuid,uuid)",
    "notifications_read_through(uuid,timestamp with time zone,boolean)",
    "file_keep_many(uuid,uuid[])",
  ])
    assert.ok(sigs.has(sig), `${sig} is one, named as the database prints it`);
  assert.ok(
    tables.get("contacts") === true && tables.get("tenants") === false,
    "a table says whether it names a workspace",
  );
});

test("every id a door takes is filled with a row of this workspace's: by its name, by ARG_ROWS, or for that door by DOOR_ARGS", () => {
  const nothing = [];
  for (const d of doors)
    for (const a of d.args.filter(isId)) {
      const row = DOOR_ARGS[d.name]?.[a.name] ?? ARG_ROWS[a.name] ?? byName(a.name);
      if (!row) nothing.push(`${d.sig}: ${a.name} names no table`);
      else if (!row.startsWith("@") && !hasRow(row))
        nothing.push(`${d.sig}: ${a.name} is a row of ${row}, which the walk does not seed`);
    }
  assert.deepEqual(
    nothing,
    [],
    "a door takes an id the walk has no row for, so the walk would call it about nothing: name the argument's table in " +
      "ARG_ROWS (tests/database/doors/_lists.mjs), or for this door alone in DOOR_ARGS; `@nothing` only for an id that names no row to act on",
  );
});

test("the lists name what the schema holds: no entry for a door, an argument or a table that is gone", () => {
  const stale = [];
  const allArgs = new Set(doors.flatMap((d) => d.args.map((a) => a.name)));
  // An id read out of a jsonb argument is filled by the same list, under `p_<key>`.
  const readFromObjects = new Set(
    doors.flatMap((d) => [...d.body.matchAll(/->>?\s*'(\w+_ids?)'/g)].map((m) => `p_${m[1]}`)),
  );
  for (const [arg, row] of Object.entries(ARG_ROWS)) {
    if (!allArgs.has(arg) && !readFromObjects.has(arg)) stale.push(`ARG_ROWS.${arg}: no door takes it`);
    if (!row.startsWith("@") && !hasRow(row)) stale.push(`ARG_ROWS.${arg}: ${row} is not a row the walk seeds`);
  }
  for (const [door, args] of Object.entries(DOOR_ARGS)) {
    if (!names.has(door)) {
      stale.push(`DOOR_ARGS.${door}: not a door a signed-in person may call`);
      continue;
    }
    const takes = doors.filter((d) => d.name === door).flatMap((d) => d.args);
    for (const [arg, value] of Object.entries(args)) {
      const its = takes.find((a) => a.name === arg);
      if (!its) stale.push(`DOOR_ARGS.${door}.${arg}: the door takes no such argument`);
      else if (isId(its) && !String(value).startsWith("@") && !hasRow(value))
        stale.push(`DOOR_ARGS.${door}.${arg}: ${value} is not a row the walk seeds`);
    }
  }
  for (const table of Object.keys(SEED_VALUES))
    if (tables.get(table) !== true) stale.push(`SEED_VALUES.${table}: not a table that names a workspace`);
  for (const [label, row] of Object.entries(SEED_MORE))
    if (tables.get(row.table) !== true)
      stale.push(`SEED_MORE.${label}: ${row.table} is not a table that names a workspace`);
  for (const [list, named] of Object.entries({
    SAME_FOR_EVERYONE,
    A_VIEWER_WRITES,
    A_PASSWORD_ALONE_MAY,
    REFUSES_IN_WORDS,
    ANSWERS_NO_PERSON_IN_WORDS,
  }))
    for (const sig of Object.keys(named))
      if (!sigs.has(sig))
        stale.push(`${list}: ${sig} is not a door a signed-in person may call, as the database prints it`);
  for (const [who, kept] of Object.entries(AN_ERASURE_KEEPS))
    for (const column of Object.keys(kept))
      if (!ids.has(column)) stale.push(`AN_ERASURE_KEEPS.${who}: ${column} is not an id column of the schema`);
  for (const table of Object.keys(A_KEPT_ROW_MAY_STAND))
    if (!tables.has(table)) stale.push(`A_KEPT_ROW_MAY_STAND.${table}: not a table`);
  assert.deepEqual(stale, [], "take the entry out, or name it as the schema does now");
});

test("every door argued by name says why", () => {
  for (const named of [SAME_FOR_EVERYONE, A_VIEWER_WRITES, A_PASSWORD_ALONE_MAY, ANSWERS_NO_PERSON_IN_WORDS])
    for (const [sig, why] of Object.entries(named))
      assert.ok(typeof why === "string" && why.trim().length >= 8, `${sig} says why`);
  for (const [sig, seats] of Object.entries(REFUSES_IN_WORDS))
    for (const [who, why] of Object.entries(seats))
      assert.ok(typeof why === "string" && why.trim().length >= 8, `${sig}, ${who}, says why`);
});
