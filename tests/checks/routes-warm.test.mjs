/**
 * The warm-up (GET /api/warm, GET /api/warm/long): the routes every page opens on, loaded before anyone asks for them.
 *
 * On Vercel a route's code is loaded the first time it is asked for in an instance (Next preloads its entries only outside
 * minimal mode), so after every deploy the first visit to each page waited for it: 1.1 to 3.3 s to a first byte, against 0.2
 * to 0.6 s once loaded (production, 12 Nov 2026). Routes of one configuration share a function, and a route that imports
 * another loads it, so one route in each function, asked by the platform's clock, loads them all. Held here: every read a
 * page opens on is one a warm-up holds, in the function that answers it, and the clock asks for each.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PREFETCH_BESIDE, PREFETCH_READS } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const API = "apps/dashboard/app/api";
const warm = await import(at(`${API}/warm/route.ts`));
const long = await import(at(`${API}/warm/long/route.ts`));

/** A read as the client spells it, by its route's path: `calendar?around=today` is `calendar`. */
const pathOf = (read) => read.replace(/\?.*$/, "");
/** What a warm-up holds, as its handler says it (server/workspace/routes-warm.ts routesWarmed). */
const heldBy = (route) => route.GET.held;

/**
 * First reads no warm-up holds, each with why. Ask's morning is read in the stream's second tier, after Today has drawn,
 * and lives in Ask's own function (its POST runs a turn of the model): nothing a first draw waits for.
 */
const LEFT = new Set(["ask/morning"]);

test("every read a page opens on is one a warm-up holds: no page's first visit after a deploy waits for its route's code", () => {
  const held = new Set([...heldBy(warm), ...heldBy(long)]);
  const reads = new Set(["open", "workspaces"]);
  for (const list of [...Object.values(PREFETCH_READS), ...Object.values(PREFETCH_BESIDE)])
    for (const read of list) reads.add(pathOf(read));
  const missing = [...reads].filter((r) => !held.has(r) && !LEFT.has(r)).sort();
  assert.deepEqual(
    missing,
    [],
    "REGRESSION: a page's first read whose route nobody loads waits 1 to 3 s for its code on the first visit after each deploy",
  );
  for (const r of LEFT) assert.ok(!held.has(r), `${r} is held after all: take it out of the reads left`);
});

test("a warm-up holds only routes of its own function: Vercel groups routes by their configuration, and a route in another function is loaded by nobody", async () => {
  const configOf = async (r) => (await import(at(`${API}/v1/${r}/route.ts`))).maxDuration;
  for (const r of heldBy(warm))
    assert.equal(
      await configOf(r),
      undefined,
      `${r} sets its own maxDuration: it left the warm-up's function, hold it in one of its own`,
    );
  assert.equal(warm.maxDuration, undefined);
  const theirs = heldBy(long);
  assert.ok(theirs.length > 0);
  for (const r of theirs)
    assert.equal(
      await configOf(r),
      long.maxDuration,
      `${r} and the long warm-up share one configuration, so one function`,
    );
});

test("the platform's clock asks for each warm-up, every five minutes", () => {
  const { crons } = JSON.parse(fs.readFileSync(path.join(ROOT, "apps/dashboard/vercel.json"), "utf8"));
  for (const door of ["/api/warm", "/api/warm/long"])
    assert.deepEqual(
      crons.filter((c) => c.path === door).map((c) => c.schedule),
      ["*/5 * * * *"],
      `${door} is asked for by the clock`,
    );
});
