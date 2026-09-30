/**
 * apps/edge/lib/env.ts is the edge's one reader of the environment.
 *
 * Two promises, checked here because every door now depends on them: a value
 * is read when asked for, not at import, so a test that sets the environment
 * per case is answered for that case; and blank is unset, so a variable Vercel
 * stores as "" behaves like one never set, and a blank verify token cannot
 * match a blank query string.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "../../../../..");
const { env } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/env.ts")).href);

test("a value is read when asked for, not when the module loads", () => {
  delete process.env.DIAG_KEY;
  assert.equal(env.DIAG_KEY, undefined);
  process.env.DIAG_KEY = "k-1";
  assert.equal(env.DIAG_KEY, "k-1");
  process.env.DIAG_KEY = "k-2";
  assert.equal(env.DIAG_KEY, "k-2");
  delete process.env.DIAG_KEY;
});

test("blank is unset, and whitespace is trimmed", () => {
  process.env.WHATSAPP_VERIFY_TOKEN = "";
  assert.equal(env.WHATSAPP_VERIFY_TOKEN, undefined, "an emptied variable reads as unset");
  process.env.WHATSAPP_VERIFY_TOKEN = "   ";
  assert.equal(env.WHATSAPP_VERIFY_TOKEN, undefined);
  process.env.WHATSAPP_VERIFY_TOKEN = "  tok  ";
  assert.equal(env.WHATSAPP_VERIFY_TOKEN, "tok");
  delete process.env.WHATSAPP_VERIFY_TOKEN;
});

test("the module names every variable the manifest declares, and nothing else", () => {
  // The manifest test holds .env.example to what the edge reads; this holds
  // the typed module to the manifest, so a variable cannot be added to one
  // without the other. VERCEL_ENV and VERCEL_GIT_COMMIT_SHA are the platform's and are not in the file.
  const declared = new Set();
  for (const line of fs.readFileSync(path.join(ROOT, "apps/edge/.env.example"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=/);
    if (m) declared.add(m[1]);
  }
  const platforms = new Set(["VERCEL_ENV", "VERCEL_GIT_COMMIT_SHA"]);
  const typed = new Set(Object.keys(Object.getOwnPropertyDescriptors(env)).filter((k) => !platforms.has(k)));
  assert.deepEqual([...typed].filter((k) => !declared.has(k)).sort(), [], "typed but not in .env.example");
  assert.deepEqual([...declared].filter((k) => !typed.has(k)).sort(), [], "in .env.example but not typed");
});
