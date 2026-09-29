/**
 * docs/data-model.md is what tooling/scripts/gen/data-model.mjs writes from supabase/schema.sql and packages/db/src.
 *
 * A dictionary typed by hand is stale the day a column lands, so this one is generated, and a plain run fails when
 * the page and its sources disagree: a migration regenerated the snapshot and not the page, or a repository started
 * or stopped naming a table. No database: the snapshot is committed, and the owners are read off the syntax tree.
 *
 *   corepack pnpm gen:data-model
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../_source.mjs";
import { OUT, generate, modelOf, render } from "../../gen/data-model.mjs";

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
      "Run `corepack pnpm gen:data-model` (after `corepack pnpm gen:schema-snapshot` when a migration changed), and commit it.",
  );
});

test("a table reads off the dump: columns, keys, security, policies, partitions and comments", () => {
  const dump = `
CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text
);
CREATE TABLE public.notes (
    id bigint NOT NULL,
    tenant_id uuid NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    words integer GENERATED ALWAYS AS (length(body)) STORED,
    CONSTRAINT notes_body_check CHECK ((length(body) < 500))
)
PARTITION BY LIST (tenant_id);
CREATE TABLE public.notes_rest (
    id bigint NOT NULL,
    tenant_id uuid NOT NULL
);
COMMENT ON TABLE public.notes IS 'What a member wrote; it''s theirs.';
COMMENT ON COLUMN public.notes.body IS 'The words, a | and all.';
ALTER TABLE public.notes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (SEQUENCE NAME public.notes_id_seq);
ALTER TABLE ONLY public.notes ATTACH PARTITION public.notes_rest DEFAULT;
ALTER TABLE ONLY public.notes ADD CONSTRAINT notes_pkey PRIMARY KEY (id, tenant_id);
ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_author_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE POLICY notes_member_select ON public.notes FOR SELECT TO authenticated USING ((tenant_id IN ( SELECT m.tenant_id
   FROM public.memberships m
  WHERE (m.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY notes_own_write ON public.notes AS RESTRICTIVE TO authenticated, service_role WITH CHECK (true);
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE VIEW public.notes_view WITH (security_invoker='true') AS
 SELECT id FROM public.notes;
`;
  const model = modelOf(dump);
  const notes = model.tables.get("notes");
  assert.deepEqual(
    notes.columns.map((c) => [c.name, c.type, c.notNull, c.fill]),
    [
      ["id", "bigint", true, "identity (always)"],
      ["tenant_id", "uuid", true, null],
      ["body", "text", true, "''::text"],
      ["words", "integer", false, "generated: length(body)"],
    ],
  );
  assert.equal(notes.comment, "What a member wrote; it's theirs.");
  assert.deepEqual(notes.primaryKey, ["id", "tenant_id"]);
  assert.deepEqual(
    notes.foreignKeys.map((k) => [k.columns, k.references, k.referenced, k.actions]),
    [
      [["tenant_id"], "tenants", ["id"], ["on delete cascade"]],
      [["id"], "auth.users", ["id"], ["on delete set null"]],
    ],
  );
  assert.deepEqual(
    notes.policies.map((p) => [p.name, p.command, p.roles, p.restrictive, p.using !== null, p.check]),
    [
      ["notes_member_select", "select", ["authenticated"], false, true, null],
      ["notes_own_write", "all", ["authenticated", "service_role"], true, false, "true"],
    ],
  );
  assert.equal(notes.rls, true);
  assert.equal(model.tables.get("notes_rest").parent, "notes");
  assert.ok(model.views.has("notes_view"));

  const page = render(model, new Map([["notes", ["packages/db/src/repositories/notes.ts"]]]));
  assert.doesNotMatch(page, /^### notes_rest$/m, "a partition is listed under its parent, not as a table");
  assert.match(page, /Partitioned by list \(tenant_id\): `notes_rest` \(default\)/);
  assert.match(
    page,
    /\| `body` \| text \| no \| `''::text` \| The words, a \\\| and all\. \|/,
    "a pipe cannot end a cell",
  );
  assert.match(page, /\| \[`tenants`\]\(#tenants\) \| none \| on, no policy, so only the service role reaches it \|/);
  assert.match(
    page,
    /`notes_member_select` \| select \| authenticated \| `\(tenant_id IN \( SELECT m\.tenant_id FROM memberships m WHERE \(m\.user_id = auth\.uid\(\)\)\)\)`/,
  );
});
