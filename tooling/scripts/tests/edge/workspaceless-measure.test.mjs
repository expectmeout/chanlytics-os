/**
 * The measure behind the "edge statements that name no workspace" ratchet (_ast.mjs workspacelessStatements, the
 * baseline workspaceless.json), run on made-up modules: which statements count, which do not, and how a module that
 * reads across workspaces on purpose says so.
 *
 * The edge writes with the service role, which skips row-level security, so a statement on a workspace's table is
 * scoped only by the workspace it names. The ratchet holds the count, per module, at what it is and lets it only fall;
 * the modules the cross-workspace checklist classed by design carry a header line `Cross-workspace: <why>` and are
 * not measured (docs/debt.md).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { workspacelessStatements, headerOf } from "../_ast.mjs";
import { CROSS_WORKSPACE, tenantTablesOf } from "../_measures.mjs";

const sourceOf = (text) => ts.createSourceFile("probe.ts", text, ts.ScriptTarget.Latest, true);
const TABLES = new Set(["calls", "lines", "messages"]);
const count = (text) => workspacelessStatements(sourceOf(text), TABLES);

test("a statement on a workspace's table that names no workspace counts, by whatever verb it reads or writes", () => {
  assert.equal(count(`await db.from("calls").select("id").eq("retell_call_id", id).maybeSingle();`), 1);
  assert.equal(count(`await db.from("lines").update({ state: "x" }).eq("id", line.id);`), 1);
  assert.equal(count(`await db.from("messages").delete().eq("id", id);`), 1);
  assert.equal(count(`await db.from("messages").insert({ id, body });`), 1, "a row that names no workspace");
  assert.equal(count(`await db.from("calls").select("id"); await db.from("lines").select("id");`), 2);
});

test("a statement that names the workspace does not: a filter on tenant_id, a row that carries it, or tenantDb", () => {
  assert.equal(count(`await db.from("calls").select("id").eq("tenant_id", tenantId).eq("id", id);`), 0);
  assert.equal(count(`await db.from("calls").select("id").eq("id", id).eq("tenant_id", tenantId);`), 0);
  assert.equal(count(`await db.from("calls").select("id").match({ tenant_id: tenantId, id });`), 0);
  assert.equal(count(`await db.from("calls").select("id").in("tenant_id", ids);`), 0);
  assert.equal(count(`await db.from("messages").insert({ tenant_id: tenantId, body });`), 0);
  assert.equal(count(`await db.from("messages").insert([{ tenant_id, a }, { tenant_id, b }]);`), 0);
  assert.equal(count(`await tenantDb(db, tenantId).from("lines").update({ x: 1 }).eq("id", id);`), 0);
  // `platformWide` is the sweep saying, at the statement, that it reads every workspace on purpose.
  assert.equal(count(`await platformWide(db).from("lines").select("id").eq("voice_state", "failed");`), 0);
  // A filter on another column, and a rows list that does not all carry it, are not naming the workspace.
  assert.equal(count(`await db.from("calls").select("id").eq("tenant", tenantId);`), 1);
  assert.equal(count(`await db.from("messages").insert([{ tenant_id, a }, { b }]);`), 1);
  // An update's values are what changes, never whose row it is.
  assert.equal(count(`await db.from("lines").update({ tenant_id: other }).eq("id", id);`), 1);
});

test("what is not a workspace's table, or is not a statement, is not counted", () => {
  assert.equal(count(`await db.from("tenants").select("id").eq("id", id);`), 0, "the workspaces are their own table");
  assert.equal(count(`const b = Buffer.from("calls");`), 0);
  assert.equal(count(`await db.rpc("calls_due", { p_tenant: t });`), 0);
});

test("a header line says why a module reads across workspaces, and only a header does", () => {
  const header = (text) => CROSS_WORKSPACE.test(headerOf(sourceOf(text)));
  assert.equal(
    header(`/**\n * A sweep.\n *\n * Cross-workspace: the sweep visits every workspace.\n */\nimport x from "y";`),
    true,
  );
  assert.equal(header(`// Cross-workspace: a provider's webhook names its workspace by id.\nimport x from "y";`), true);
  assert.equal(header(`/** No workspace here. */\nimport x from "y";`), false);
  assert.equal(header(`/**\n * Cross-workspace:\n */\nimport x from "y";`), false, "a header line gives its reason");
  assert.equal(
    header(`import x from "y";\n/** Cross-workspace: too late, after the code. */\nexport const a = 1;`),
    false,
  );
});

test("the tables that count are the generated types' tenant tables: calls and lines in, the workspaces themselves out", () => {
  const tables = tenantTablesOf();
  for (const t of ["calls", "lines", "messages", "conversations", "contacts", "tenant_channels"])
    assert.ok(tables.has(t), t);
  for (const t of ["tenants", "operator_pages", "sweep_status", "rate_hits"]) assert.ok(!tables.has(t), t);
  assert.ok(tables.size > 40, "read from the generated types, not a hand list");
});
