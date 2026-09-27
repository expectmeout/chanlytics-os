/**
 * apps/edge/.env.example must list every variable the edge actually reads.
 *
 * It listed 12 of 21. The nine missing ones included SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY — without which nothing is persisted and the
 * receptionist has no memory to read. An environment built from that file
 * came up looking healthy and recorded nothing.
 *
 * A manifest nobody checks drifts the moment someone adds a feature, so this
 * checks it. It is a documentation test, and that is the point: the file is
 * documentation whose wrongness is invisible until an incident.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "../../../..");

/**
 * The edge and the dashboard are separate Vercel projects that deploy
 * independently, and they genuinely need different variables — the edge only
 * VERIFIES QStash signatures while the dashboard PUBLISHES jobs, so only the
 * dashboard holds the token. Two manifests, each checked against the code that
 * actually reads it. (This test caught its own author declaring QSTASH_TOKEN in
 * the wrong one.)
 */
const MANIFESTS = [
  {
    name: "apps/edge/.env.example",
    file: path.join(ROOT, "apps/edge/.env.example"),
    // The packages the edge bundles read env too.
    sources: ["apps/edge", "packages/jobs/src", "packages/db/src", "packages/channels/src"],
  },
  {
    name: "apps/dashboard/.env.example",
    file: path.join(ROOT, "apps/dashboard/.env.example"),
    // src/legacy is the ported mockup and reads no env. middleware.ts sits at
    // the app root and was not scanned at all — the one file every request
    // passes through, reading env to decide the address and the session.
    sources: [
      "apps/dashboard/app",
      "apps/dashboard/src/server",
      "apps/dashboard/src/lib",
      "apps/dashboard/src/legacy-bridge",
      "apps/dashboard/proxy.ts",
    ],
  },
];

/** Every `process.env.NAME` under a directory, recursively, source only. */
function envReads(dir) {
  const found = new Set();
  const read = (file) => {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) found.add(m[1]);
  };
  // A source may be one FILE — middleware.ts sits at the app root, outside
  // every directory below it, and reads env on every request.
  if (fs.statSync(dir).isFile()) {
    read(dir);
    return found;
  }
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", "dist", ".next", ".vercel"].includes(entry.name)) continue;
        walk(p);
      } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
        read(p);
      }
    }
  };
  walk(dir);
  return found;
}

/** Names declared in a manifest, comments and blanks ignored. */
function declared(file) {
  const out = new Set();
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=/);
    if (m) out.add(m[1]);
  }
  return out;
}

// Set by the platform, not by an operator filling in this file.
const PROVIDED_BY_VERCEL = new Set(["VERCEL_ENV", "VERCEL_URL", "VERCEL_GIT_COMMIT_SHA", "NODE_ENV"]);

const usedBy = (m) => new Set(m.sources.flatMap((s) => [...envReads(path.join(ROOT, s))]));

for (const m of MANIFESTS) {
  test(`${m.name} documents every env var that code reads`, () => {
    const missing = [...usedBy(m)].filter((k) => !declared(m.file).has(k) && !PROVIDED_BY_VERCEL.has(k)).sort();
    assert.deepEqual(
      missing,
      [],
      `read from process.env but absent from ${m.name} — an operator following that file deploys without them`,
    );
  });

  test(`${m.name} documents nothing the code does not read`, () => {
    // A stale entry is its own lie: it implies a variable does something, and
    // sends whoever is provisioning an environment looking for a value.
    const used = usedBy(m);
    const stale = [...declared(m.file)].filter((k) => !used.has(k) && !PROVIDED_BY_VERCEL.has(k)).sort();
    assert.deepEqual(stale, [], `declared in ${m.name} but never read`);
  });
}
