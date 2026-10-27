/**
 * A reply window reads its own wire's clock (decision 0001, step 5): no code reads conversations.last_wa_inbound_at.
 *
 * The column stays written by ingest_inbound and merge_people for the fourteen days before step 7 drops it (0001's fifth
 * answer), and nothing may read it in that time, or the drop would take a reader with it. The database's half is held by
 * a-reply-window-reads-its-own-wire.db.test.mjs (no function, view or policy but the two writers names it). This is the
 * code's half: every string the apps and packages write out whole (a PostgREST select is one), read off the syntax tree,
 * names the column only as an alias's name, the field a page reads, over the accessor that answers it
 * (`last_wa_inbound_at:last_inbound_on_whatsapp`). A TypeScript field of that name is a page's own word, not a read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { repoFiles, parse, stringsIn } from "../_ast.mjs";

const COLUMN = /\blast_wa_inbound_at\b/g;

/**
 * Each place a string names the column as a column: anywhere but as an alias's name, the word before a colon
 * (`last_wa_inbound_at:<accessor>`). The word after a colon is what the alias reads, so `x:last_wa_inbound_at` reads it.
 */
function readsOf(text) {
  const out = [];
  for (const m of text.matchAll(COLUMN)) {
    if (/^\s*:/.test(text.slice(m.index + m[0].length))) continue;
    out.push(text.slice(Math.max(0, m.index - 30), m.index + 40));
  }
  return out;
}

test("the rule tells a read from an alias's name", () => {
  assert.deepEqual(readsOf("id, state, last_wa_inbound_at:last_inbound_on_whatsapp, last_message_at"), []);
  assert.equal(readsOf("id, state, last_wa_inbound_at, last_message_at").length, 1);
  assert.equal(readsOf("id, last_wa_inbound_at:last_wa_inbound_at").length, 1, "an alias over the column is a read");
  assert.deepEqual(
    readsOf("latest_wa_inbound_at, last_inbound_at"),
    [],
    "a person's latest clock is people_list's own",
  );
});

test("no string in the apps or the packages reads last_wa_inbound_at: every select names the one accessor", () => {
  const files = repoFiles(["apps", "packages"]);
  assert.ok(files.length > 500, "the trees were read");
  const reads = files.flatMap((f) => stringsIn(parse(f)).flatMap((s) => readsOf(s).map((at) => `${f}: …${at}…`)));
  assert.deepEqual(reads, [], "read the WhatsApp clock through last_inbound_on_whatsapp (decision 0001, step 5)");
});
