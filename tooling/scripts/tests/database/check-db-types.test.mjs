/**
 * The comparison that holds database.types.ts to the migrations, run over
 * strings shaped like the generator's output, and then the script itself run
 * against a stand-in CLI so its exit codes are proved rather than described.
 *
 * What the comparison ignores is environment: the generator's record of the
 * PostgREST it read (a linked project's generation has one, the local stack's
 * has none) and the month's partitions of `events`. Everything else is schema,
 * and a renamed, retyped or dropped column is exactly the drift that
 * typechecks clean and fails in production.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compare, normalise, postgrestVersion, OUT, FIX } from "../../gen/db-types.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = path.join(ROOT, "tooling/scripts/gen/db-types.mjs");

/**
 * A database.types.ts in miniature: the generator's shape, small enough to
 * read. `version: null` is the local stack's generation, which has no
 * __InternalSupabase block at all.
 */
function types({ version = "14.5", tables = null } = {}) {
  const t = tables ?? {
    contacts: ["id: string", "phone: string", "tenant_id: string"],
    tenants: ["id: string", "name: string"],
  };
  const table = (name, cols) => [
    `      ${name}: {`,
    "        Row: {",
    ...cols.map((c) => `          ${c}`),
    "        }",
    "        Insert: {",
    ...cols.map((c) => `          ${c.replace(":", "?:")}`),
    "        }",
    "        Relationships: []",
    "      }",
  ];
  return [
    "export type Json =",
    "  | string",
    "  | null",
    "",
    "export type Database = {",
    ...(version === null
      ? []
      : [
          "  // Allows to automatically instantiate createClient with right options",
          "  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)",
          "  __InternalSupabase: {",
          `    PostgrestVersion: "${version}"`,
          "  }",
        ]),
    "  public: {",
    "    Tables: {",
    ...Object.entries(t).flatMap(([name, cols]) => table(name, cols)),
    "    }",
    "  }",
    "}",
    "",
  ].join("\n");
}

test("the same file is the same", () => {
  const r = compare(types(), types());
  assert.equal(r.same, true);
  assert.equal(r.committedVersion, "14.5");
  assert.equal(r.generatedVersion, "14.5");
  assert.equal(r.diffHint, null);
});

test("files that differ only in the PostgREST version are the same, and both versions are reported", () => {
  const r = compare(types({ version: "14.5" }), types({ version: "12.2.12" }));
  assert.equal(r.same, true, "the version is environment, not schema");
  assert.equal(r.committedVersion, "14.5");
  assert.equal(r.generatedVersion, "12.2.12");
});

test("a linked project's generation and the local stack's are the same schema: one records PostgREST's version, the other nothing", () => {
  const r = compare(types({ version: null }), types({ version: "14.5" }));
  assert.equal(r.same, true, "the local stack writes no __InternalSupabase block at all");
  assert.equal(r.committedVersion, null);
  assert.equal(r.generatedVersion, "14.5");
  assert.equal(compare(types({ version: "14.5" }), types({ version: null })).same, true, "and the other way round");
});

test("a renamed column is drift, and the hint names the line and the table", () => {
  const committed = types();
  const generated = types({
    tables: {
      contacts: ["id: string", "phone_e164: string", "tenant_id: string"],
      tenants: ["id: string", "name: string"],
    },
  });
  const r = compare(committed, generated);
  assert.equal(r.same, false);
  assert.equal(
    r.diffHint.line,
    committed.split("\n").indexOf("          phone: string") + 1,
    "the committed file's own line number",
  );
  assert.equal(r.diffHint.within, "public.Tables.contacts");
  assert.equal(r.diffHint.committed.trim(), "phone: string");
  assert.equal(r.diffHint.generated.trim(), "phone_e164: string");
});

test("a retyped column is drift", () => {
  const generated = types({
    tables: { contacts: ["id: string", "phone: number", "tenant_id: string"], tenants: ["id: string", "name: string"] },
  });
  assert.equal(compare(types(), generated).same, false);
});

test("a dropped table is drift", () => {
  const generated = types({ tables: { contacts: ["id: string", "phone: string", "tenant_id: string"] } });
  const r = compare(types(), generated);
  assert.equal(r.same, false);
  assert.equal(
    r.diffHint.within,
    "public.Tables.tenants",
    "the first line that differs is where the dropped table used to start",
  );
});

test("CRLF and LF are the same file", () => {
  const lf = types();
  assert.equal(compare(lf, lf.replace(/\n/g, "\r\n")).same, true);
  assert.equal(compare(lf.replace(/\n/g, "\r\n"), lf).same, true);
});

test("normalise drops the generator's PostgREST block -- the comment above it, the block, the version -- and nothing else", () => {
  const src = types();
  const out = normalise(src);
  assert.equal(out, types({ version: null }), "exactly what the local stack's generator writes for the same schema");
  assert.ok(!out.includes("PostgrestVersion") && !out.includes("__InternalSupabase"));
  assert.equal(normalise(out), out, "a file without the block is returned as it is");
  assert.equal(postgrestVersion(out), null);
  assert.equal(postgrestVersion(src.replace(/\n/g, "\r\n")), "14.5");
});

test("which events partitions exist is the calendar's, not the schema's: files that differ only in their events_yYYYYmMM tables are the same", () => {
  const events = ["id: string", "kind: string", "tenant_id: string"];
  const people = {
    contacts: ["id: string", "phone: string", "tenant_id: string"],
    tenants: ["id: string", "name: string"],
  };
  const august = types({
    tables: {
      contacts: people.contacts,
      events,
      events_y2026m08: events,
      events_y2026m09: events,
      tenants: people.tenants,
    },
  });
  const october = types({
    tables: {
      contacts: people.contacts,
      events,
      events_y2026m10: events,
      events_y2026m11: events,
      events_y2026m12: events,
      tenants: people.tenants,
    },
  });
  assert.equal(
    compare(august, october).same,
    true,
    "a replay in October has partitions a replay in August does not, for the same migrations",
  );
  assert.equal(compare(august, types({ tables: people })).same, false, "the partitioned table itself is schema");
});

test("drift after the partitions is still drift, at the committed file's own line", () => {
  const events = ["id: string", "kind: string", "tenant_id: string"];
  const committed = types({
    tables: {
      contacts: ["id: string", "tenant_id: string"],
      events_y2026m08: events,
      events_y2026m09: events,
      tenants: ["id: string", "name: string"],
    },
  });
  const generated = types({
    tables: {
      contacts: ["id: string", "tenant_id: string"],
      events_y2026m10: events,
      tenants: ["id: string", "title: string"],
    },
  });
  const r = compare(committed, generated);
  assert.equal(r.same, false);
  assert.equal(
    r.diffHint.line,
    committed.split("\n").indexOf("          name: string") + 1,
    "the skipped partitions are counted back in",
  );
  assert.equal(r.diffHint.within, "public.Tables.tenants");
  assert.equal(r.diffHint.generated.trim(), "title: string");
});

/**
 * The script, with SUPABASE_CLI pointing at a stand-in launcher that answers
 * `gen types typescript --local` with a copy of the committed file, altered
 * one way per case. The `.js` name is deliberate: it is the npm-distributed
 * CLI's shape, and the branch that runs it with this Node.
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "check-db-types-"));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const TYPES = path.join(ROOT, OUT);
function stub(name, body) {
  const p = path.join(dir, `${name}.js`);
  fs.writeFileSync(
    p,
    [
      'const fs = require("node:fs");',
      'if (process.argv.slice(2).join(" ") !== "gen types typescript --local") { console.error("unexpected args: " + process.argv.slice(2).join(" ")); process.exit(9); }',
      `const real = () => fs.readFileSync(${JSON.stringify(TYPES)}, "utf8");`,
      body,
      "",
    ].join("\n"),
  );
  return p;
}
const run = (cli) =>
  spawnSync(process.execPath, [SCRIPT, "--check"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, SUPABASE_CLI: cli },
  });

test("--check: the committed file, regenerated identically, is current (exit 0)", () => {
  const r = run(stub("same", "process.stdout.write(real());"));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /database\.types\.ts is current/);
});

test("--check: one column renamed is stale (exit 1), and the message says what to run", () => {
  const r = run(
    stub(
      "renamed",
      [
        "const src = real();",
        "const m = /^ {10}(\\w+): string$/m.exec(src);",
        'process.stdout.write(src.replace(m[0], m[0].replace(m[1], m[1] + "_renamed")));',
      ].join("\n"),
    ),
  );
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /database\.types\.ts is stale/);
  assert.match(r.stderr, /first difference at line \d+, in public\.Tables\.\w+/);
  assert.ok(r.stderr.includes(FIX), `the fix is named: ${r.stderr}`);
});

test("--check: a generation that differs only in PostgREST's version block is current (exit 0), and both versions are printed", () => {
  // The stand-in answers with version 99.9 whatever the committed file records:
  // a different version when it has one, the whole block when it has none.
  const r = run(
    stub(
      "version",
      String.raw`const src = real();
const VERSION = /PostgrestVersion: "[^"]*"/;
const block = (nl) => ["  // Allows to automatically instantiate createClient with right options", "  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)", "  __InternalSupabase: {", '    PostgrestVersion: "99.9"', "  }", ""].join(nl);
process.stdout.write(VERSION.test(src) ? src.replace(VERSION, 'PostgrestVersion: "99.9"') : src.replace(/export type Database = \{(\r?\n)/, (m, nl) => m + block(nl)));`,
    ),
  );
  assert.equal(r.status, 0, r.stderr);
  const committed = postgrestVersion(fs.readFileSync(TYPES, "utf8")) ?? "none";
  assert.ok(r.stdout.includes(`PostgREST ${committed} committed, 99.9 generated`), r.stdout);
  assert.match(r.stdout, /environment the comparison ignores/);
});

test("--check: the same schema replayed a month later is current (exit 0): only its events partitions moved on", () => {
  const r = run(
    stub(
      "month-later",
      [
        "const src = real();",
        "const later = (y, m) => (m === 12 ? [y + 1, 1] : [y, m + 1]);",
        'process.stdout.write(src.replace(/events_y(\\d{4})m(\\d{2})/g, (_, y, m) => { const [ny, nm] = later(+y, +m); return "events_y" + ny + "m" + String(nm).padStart(2, "0"); }));',
      ].join("\n"),
    ),
  );
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /database\.types\.ts is current/);
});

test("--check: a CLI that fails is exit 2, not a pass", () => {
  const r = run(
    stub("down", 'process.stderr.write("failed to connect to postgres: connection refused\\n"); process.exit(1);'),
  );
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /Is `supabase start` running\?/);
  assert.match(r.stderr, /connection refused/, "the CLI's own words are passed on");
});

test("--check: a CLI that answers with something other than types is exit 2, not a pass", () => {
  const r = run(stub("noise", 'process.stdout.write("hello\\n");'));
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /not generated types/);
});
