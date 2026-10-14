/**
 * The tracer that holds reads to never writing (_trace.mjs), run on fixtures: what it finds, and what it must not.
 *
 * It follows a GET's handler a function at a time, so a file that holds a reader beside a writer is judged by what the
 * reader calls (the miss that would make the ratchet cry wolf for every route that shares a module with its POST), and it
 * follows an import, a re-export and a call from one file to the next (the miss that would make it blind to a write one
 * helper away, which is how the board's people and the workspace list's invitations were written).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { writesReachedBy, writingRpcs } from "./_trace.mjs";

const ROUTE = "apps/dashboard/app/api/v1/things/route.ts";

/** A checkout of a few files, as text, for the tracer to read. */
const checkout = (files, rpcs = []) => ({
  read: (file) => files[file] ?? null,
  exists: (file) => Object.hasOwn(files, file),
  writingRpcs: new Set(rpcs),
});
const routeOf = (handle, imports = "") => `
  import { read, write, workspace } from "@/server/route";
  ${imports}
  export const GET = read({ scope: workspace, handle: ${handle} });
`;
const trace = (files, rpcs) => writesReachedBy(checkout({ [ROUTE]: "", ...files }, rpcs), ROUTE);

test("a handler that writes a row is found, whichever method of the chain writes it", () => {
  for (const method of ["insert", "upsert", "update", "delete"]) {
    const found = trace({
      [ROUTE]: routeOf(`async ({ ctx }) => { await ctx.supabase.from("contacts").${method}({ a: 1 }).eq("id", 1); }`),
    });
    assert.equal(found.length, 1, method);
    assert.match(found[0], new RegExp(`^\\.${method}\\(\\) on a table \\(${ROUTE}:\\d+\\)$`));
  }
});

test("a handler that only reads is not found: select, a storage bucket, a map's delete, a SQL function that reads", () => {
  const found = trace(
    {
      [ROUTE]: routeOf(
        `async ({ ctx }) => {
          const seen = new Map();
          seen.delete("a");
          await ctx.supabase.storage.from("recordings").update("a", new Blob());
          await ctx.supabase.from("contacts").select("*").eq("id", 1);
          return ctx.supabase.rpc("people_list", {});
        }`,
      ),
    },
    ["recording_opened"],
  );
  assert.deepEqual(found, []);
});

test("a ledger helper and a SQL function that writes are doors wherever they are called", () => {
  assert.deepEqual(
    trace({ [ROUTE]: routeOf(`async ({ ctx }) => { await recordDecision(ctx, "export"); }`) }).map(
      (d) => d.split(" (")[0],
    ),
    ["recordDecision()"],
  );
  assert.deepEqual(
    trace({
      [ROUTE]: routeOf(`async () => { await emitEvent(db, "contact.added"); await recordEvent(db, "x"); }`),
    }).map((d) => d.split(" (")[0]),
    ["emitEvent()", "recordEvent()"],
  );
  const rpc = routeOf(`async ({ ctx }) => ctx.supabase.rpc("create_person", { p: 1 })`);
  assert.deepEqual(
    trace({ [ROUTE]: rpc }, ["create_person"]).map((d) => d.split(" (")[0]),
    ["rpc create_person"],
  );
  assert.deepEqual(trace({ [ROUTE]: rpc }, ["something_else"]), [], "a function the schema shows reading is no door");
});

test("it follows a call from the handler into the file it imports, a function at a time", () => {
  const files = {
    [ROUTE]: routeOf(`({ ctx }) => listThings(ctx)`, `import { listThings } from "@/server/things";`),
    "apps/dashboard/src/server/things.ts": `
      import { view } from "./view";
      export async function listThings(ctx) { return view(ctx); }
      export async function addThing(ctx) { await ctx.supabase.from("things").insert({ a: 1 }); }
    `,
    "apps/dashboard/src/server/view.ts": `export const view = (ctx) => ctx.supabase.from("things").select("*");`,
  };
  assert.deepEqual(trace(files), [], "the file holds a writer, and the read does not call it");

  files["apps/dashboard/src/server/view.ts"] =
    `export const view = (ctx) => addThing(ctx);\nimport { addThing } from "./things";`;
  const found = trace(files);
  assert.equal(found.length, 1, "a read that reaches the writer through a second file is found");
  assert.match(found[0], /^\.insert\(\) on a table \(apps\/dashboard\/src\/server\/things\.ts:\d+\)$/);
});

test("it follows a re-export, a star re-export and a relative path to where the function is", () => {
  const files = {
    [ROUTE]: routeOf(`({ ctx }) => exportThings(ctx)`, `import { exportThings } from "@/server/things/things";`),
    "apps/dashboard/src/server/things/things.ts": `export { exportThings } from "./thing-export";`,
    "apps/dashboard/src/server/things/thing-export.ts": `export * from "./the-copy";`,
    "apps/dashboard/src/server/things/the-copy.ts": `
      export async function exportThings(ctx) { await recordDecision(ctx, "export"); return "file"; }
    `,
  };
  assert.deepEqual(
    trace(files).map((d) => d.split(" (")[0]),
    ["recordDecision()"],
  );
});

test("it follows a handler named elsewhere in the file, a method, an index file, and ends on a cycle", () => {
  const files = {
    [ROUTE]: `
      import { read, workspace } from "@/server/route";
      import { first } from "@/server/loop";
      const handle = ({ ctx }) => first(ctx);
      export const GET = read({ scope: workspace, handle });
    `,
    "apps/dashboard/src/server/loop/index.ts": `
      export function first(ctx) { return second(ctx); }
      function second(ctx) { if (ctx.again) return first(ctx); return ctx.supabase.from("a").update({ b: 1 }); }
    `,
  };
  assert.equal(trace(files).length, 1, "through the file's own handler, an index file, and a loop that comes back");
  const method = trace({
    [ROUTE]: `
      import { read, workspace } from "@/server/route";
      export const GET = read({ scope: workspace, async handle({ ctx }) { await ctx.supabase.from("a").delete(); } });
    `,
  });
  assert.equal(method.length, 1, "a handler written as a method");
  const declared = trace({
    [ROUTE]: `export async function GET(req) { await recordDecision(req, "export"); return new Response(); }`,
  });
  assert.equal(declared.length, 1, "a GET that is no read(): the whole of it is traced");
});

test("a package is a door's home and is not followed, and a route with no GET reaches nothing", () => {
  assert.deepEqual(
    trace({ [ROUTE]: routeOf(`({ ctx }) => addPerson(ctx)`, `import { addPerson } from "@chanlytics/db";`) }),
    [],
  );
  assert.deepEqual(
    trace({
      [ROUTE]: `
        import { write, workspace } from "@/server/route";
        export const POST = write({ scope: workspace, role: "operator", rate: null, handle: ({ ctx }) => ctx.supabase.from("a").insert({}) });
      `,
    }),
    [],
  );
});

test("the SQL functions that write are the ones whose body inserts, deletes or updates a table", () => {
  const sql = [
    "create function public.reads_only() returns integer language sql as $$ select 1 $$;",
    "create function public.makes_a_row(p uuid) returns void language plpgsql as $$ begin insert into public.t (a) values (1); end $$;",
    "create function public.changes_a_row(p uuid) returns void language plpgsql as $$ begin update public.t set a = 1 where id = p; end $$;",
    "create function public.removes_a_row(p uuid) returns void language plpgsql as $$ begin delete from public.t where id = p; end $$;",
    "create function public.only_locks(p uuid) returns integer language plpgsql as $$ begin perform 1 from public.t where id = p for update; return 1; end $$;",
    "create function public.mentions_it() returns integer language plpgsql as $$ begin -- insert into public.t (a) values (1)\n return 1; end $$;",
  ].join("\n");
  assert.deepEqual([...writingRpcs(sql)].sort(), ["changes_a_row", "makes_a_row", "removes_a_row"]);
});

test("a write one call into packages/db, and one behind a module's own object of functions, is found; another package is not followed (the wiring's second audit, R11 S11-8)", () => {
  const SERVER = "apps/dashboard/src/server/things.ts";
  const DB = "packages/db/src/index.ts";
  const REPO = "packages/db/src/repositories/things.ts";
  const files = {
    [ROUTE]: routeOf(`({ ctx }) => ideasFor(ctx)`, `import { ideasFor } from "@/server/things";`),
    [SERVER]: `
      import { keepThing } from "@chanlytics/db";
      import { wordsOf } from "@chanlytics/contracts";
      const SERVICE_STORE = { keep: (t) => keepThing(t), read: (t) => wordsOf(t) };
      let store = SERVICE_STORE;
      export async function ideasFor(ctx) {
        wordsOf("x");
        await store.read(ctx);
        return store.keep(ctx);
      }
    `,
    [DB]: `export { keepThing } from "./repositories/things";`,
    [REPO]: `export async function keepThing(db) { await db.from("things").upsert({ a: 1 }); }`,
  };
  const found = trace(files);
  assert.equal(found.length, 1, found.join("; "));
  assert.match(found[0], /^\.upsert\(\) on a table \(packages\/db\/src\/repositories\/things\.ts:\d+\)$/);
  // The store's member that only reads, and a call into contracts, are passed by.
  const reading = trace({ ...files, [SERVER]: files[SERVER].replace("return store.keep(ctx);", "return null;") });
  assert.deepEqual(reading, []);
});
