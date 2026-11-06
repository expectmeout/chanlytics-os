/**
 * One session a run, whatever restarts the worker.
 *
 * Playwright starts a new worker after a failing test, and a worker holds its session in memory, so each failure minted
 * another: 31 in thirty minutes on 6 Nov 2026, 5,526 kept by Auth for the one test owner, against a limit of 30 an hour
 * on the local stack (supabase/config.toml). So a session is kept where the next worker reads it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { keptSession, keepSession } = await import("../../e2e/session.ts");

const WHO = "https://e2e-ref.supabase.co e2e-owner@example.com";
const SESSION = { access_token: "a", refresh_token: "r", expires_in: 3600, expires_at: 2_000_000_000, user: {} };
const AT = 1_000_000;
const MIN = 60_000;

const inTemp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "e2e-session-")), "folder", "kept.json");

test("what one worker minted is the next worker's", () => {
  const file = inTemp();
  keepSession(file, WHO, SESSION, AT);
  assert.deepEqual(keptSession(file, WHO, AT + 29 * MIN), SESSION);
});

test("past its half hour it is no session, so a long run mints again before the hour's token ends", () => {
  const file = inTemp();
  keepSession(file, WHO, SESSION, AT);
  assert.equal(keptSession(file, WHO, AT + 30 * MIN), null);
});

test("another project's or another person's is no session", () => {
  const file = inTemp();
  keepSession(file, WHO, SESSION, AT);
  assert.equal(keptSession(file, "http://127.0.0.1:54321 e2e-owner@example.com", AT), null);
});

test("nothing kept, or a file that cannot be read, is no session and no failure", () => {
  const file = inTemp();
  assert.equal(keptSession(file, WHO, AT), null);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "{not json");
  assert.equal(keptSession(file, WHO, AT), null);
});
