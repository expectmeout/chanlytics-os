/**
 * Every link between tables has an index that serves it (decision 0111). A link with none makes the database read the
 * whole child table when a parent row is deleted or its key changes: deleting one person's account read every message
 * for the one column that named who sent it. A link left with no index is named, with why (LINKS_LEFT_UNINDEXED), and
 * the reading is held to pg's printed form on a schema written for it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readRaw } from "../../_source.mjs";
import { OUT as SCHEMA_SQL } from "../../../tooling/scripts/gen/schema-snapshot.mjs";
import { LINKS_LEFT_UNINDEXED, linksAndIndexesOf, linksWithoutAnIndex } from "./_data.mjs";

const schema = readRaw(SCHEMA_SQL);

test("every link between tables has an index that serves it, or is named with why", () => {
  const unserved = linksWithoutAnIndex(schema).map((l) => l.key);
  assert.deepEqual(
    unserved.filter((k) => !(k in LINKS_LEFT_UNINDEXED)),
    [],
    "index the link's columns (a migration; CONCURRENTLY and alone in its file on a busy table), or name it in LINKS_LEFT_UNINDEXED with why",
  );
  assert.deepEqual(
    Object.keys(LINKS_LEFT_UNINDEXED).filter((k) => !unserved.includes(k)),
    [],
    "a link named as left with no index has one now, or is gone: take it out of LINKS_LEFT_UNINDEXED",
  );
});

test("the reading takes pg's printed form: a link, a key, a unique constraint and an index, a link served by its parent's own column", () => {
  const sql = [
    "CREATE TABLE public.notes (",
    "    id uuid NOT NULL,",
    "    tenant_id uuid NOT NULL,",
    "    contact_id uuid,",
    "    author_id uuid,",
    "    deal_id uuid",
    ");",
    "ALTER TABLE ONLY public.notes",
    "    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);",
    "ALTER TABLE ONLY public.notes",
    "    ADD CONSTRAINT notes_contact_id_same_workspace FOREIGN KEY (tenant_id, contact_id) REFERENCES public.contacts(tenant_id, id) ON DELETE CASCADE;",
    "ALTER TABLE ONLY public.notes",
    "    ADD CONSTRAINT notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL;",
    "ALTER TABLE ONLY public.notes",
    "    ADD CONSTRAINT notes_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id);",
    "CREATE INDEX notes_contact ON public.notes USING btree (contact_id, created_at DESC);",
    "CREATE UNIQUE INDEX notes_deal ON public.notes USING btree (deal_id) WHERE (deal_id IS NOT NULL);",
  ].join("\n");
  const { links, indexes } = linksAndIndexesOf(sql);
  assert.deepEqual(
    links.map((l) => [l.table, l.columns.join("+"), l.parent]),
    [
      ["notes", "tenant_id+contact_id", "public.contacts"],
      ["notes", "author_id", "auth.users"],
      ["notes", "deal_id", "public.deals"],
    ],
  );
  assert.deepEqual(indexes.get("notes"), [["id"], ["contact_id", "created_at"], ["deal_id"]]);
  assert.deepEqual(
    linksWithoutAnIndex(sql).map((l) => l.key),
    ["notes.author_id"],
    "the workspace pair is served by its parent's own column, the partial unique index serves deal_id, the author's link has none",
  );
});
