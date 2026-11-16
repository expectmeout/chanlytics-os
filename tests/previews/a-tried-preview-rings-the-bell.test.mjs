/**
 * A lead who tries their preview rings the bell (00632; decision 0079's sprint, step 2), and Health says what previews
 * came to. The row itself is the database's to write (its trigger, proved in a-tried-preview-rings-the-bell.db.test.mjs);
 * here: the kind is one the app knows everywhere a kind must be known, and Health's figures are read from what the
 * database answers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BELL_LINE_KINDS,
  EMAILED_NOTIFICATION_KINDS,
  PREVIEW_LIMITS,
  PUSH_KINDS,
  SERVER_NOTIFICATION_KINDS,
  addressOf,
  previewsHealthOf,
} from "@chanlytics/contracts";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("the kind is kept, a line on the bell and nothing more for now: no mail, no phone", () => {
  assert.ok(SERVER_NOTIFICATION_KINDS.includes("preview_tried"));
  assert.ok(!EMAILED_NOTIFICATION_KINDS.includes("preview_tried"));
  assert.ok(BELL_LINE_KINDS.includes("preview_tried"));
  assert.ok(!PUSH_KINDS.includes("preview_tried"));
});

test("the row the database writes opens the lead: its route is the address the app gives a lead", () => {
  const sql = readFileSync(
    path.join(ROOT, "supabase/migrations/00632_a_lead_who_tries_their_preview_rings_the_bell.sql"),
    "utf8",
  );
  const id = "55555555-5555-4555-8555-555555555555";
  const prefix = addressOf({ kind: "lead", id }).slice(0, -id.length);
  assert.ok(sql.includes(`'${prefix}' || NEW.lead_id::text`), `the trigger's route starts ${prefix}`);
});

test("Health's figures: what was made, what came of it and what it cost, or nothing where it could not be read", () => {
  assert.equal(previewsHealthOf(null), null);
  assert.equal(previewsHealthOf({ previews: null }), null);
  const said = previewsHealthOf({
    previews: {
      made: 31,
      made_today: 4,
      a_day: 50,
      tried: 6,
      claimed: 1,
      messages: 22,
      call_seconds: 400,
      usd: 1.2345,
    },
  });
  assert.deepEqual(said, {
    made: 31,
    madeToday: 4,
    aDay: PREVIEW_LIMITS.aDay,
    tried: 6,
    claimed: 1,
    messages: 22,
    callMinutes: 7,
    usd: 1.2345,
  });
});
