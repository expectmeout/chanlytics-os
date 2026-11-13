/**
 * 13 Nov 2026. What the receptionist is told, as Settings shows it, reads the calendar by the one rule (contracts
 * calendarFeedKeyOf): a calendar connected through a mailbox is a calendar. The settings read handed the preview the
 * link alone, so a business on a connected Google calendar saw a preview with no open times while its receptionist was
 * saying them (the edge's availability asks the rule).
 *
 * The real settings reader runs, over a database in memory. The edge's calendar door (POST /api/admin/calendar/feed)
 * is stood in for at `fetch`, where the dashboard's callEdge reaches it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describeNow } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_URL = "https://edge.example";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (file) => pathToFileURL(path.join(ROOT, file)).href;
const kernel = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { settings } = await import(at("apps/dashboard/src/server/readers/settings.ts"));

const GRANTED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BARE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MAILBOX = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TZ = "America/New_York";
/** A Monday at 10:00 in New York. */
const NOW = new Date("2026-09-14T14:00:00Z");
const DOOR = "https://edge.example/api/admin/calendar/feed";
const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//test//EN",
  "BEGIN:VEVENT",
  "UID:1",
  "DTSTART:20260915T130000Z",
  "DTEND:20260915T150000Z",
  "SUMMARY:Move for Ada",
  "END:VEVENT",
  "END:VCALENDAR",
  "",
].join("\r\n");

const brain = {
  business_name: "Harbor Moving",
  system_prompt: "Answer as the front desk of Harbor Moving: brief, warm, and never a price.",
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
  profile: { hours: { mon: { open: "09:00", close: "17:00" }, tue: { open: "09:00", close: "17:00" } } },
};
const world = () => ({
  tenant_config: [
    {
      tenant_id: GRANTED,
      config: { brain, calendar_grant: { mailbox_id: MAILBOX, provider: "google" } },
      version: 1,
      updated_at: "2026-09-01T00:00:00Z",
    },
    { tenant_id: BARE, config: { brain }, version: 1, updated_at: "2026-09-01T00:00:00Z" },
  ],
  tenants: [
    { id: GRANTED, name: "Harbor Moving", timezone: TZ },
    { id: BARE, name: "Harbor Moving", timezone: TZ },
  ],
  tenant_channels: [],
  google_listings: [],
});
const previewOf = async (tenantId) => {
  const ctx = { supabase: fakeDb(world()), userId: "u1", email: "ada@example.com", params: {} };
  const read = await kernel.load(kernel.readerContext(ctx, { tenantId, role: "owner" }, NOW), settings, undefined);
  return read.data.prompt;
};

test("REGRESSION: the preview of what the receptionist is told says the open times of a calendar connected through a mailbox -- it read the link alone, and said none", async () => {
  const realFetch = globalThis.fetch;
  const fetched = [];
  globalThis.fetch = async (url) => {
    fetched.push(String(url));
    return new Response(JSON.stringify({ ok: true, text: ICS }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const clock = describeNow(TZ, NOW, undefined);
    const granted = await previewOf(GRANTED);
    assert.deepEqual(fetched, [DOOR], "the mailbox's calendar is the edge's to read, asked once");
    assert.ok(
      granted.now.startsWith(`${clock}\n\nOpen times (from the calendar`) &&
        granted.now.includes("Tuesday, September 15"),
      "the clock, then the openings the calendar leaves",
    );
    // No calendar at all: the clock alone, and nothing is asked of the edge.
    const bare = await previewOf(BARE);
    assert.equal(bare.now, clock);
    assert.deepEqual(fetched, [DOOR], "no calendar, no read");
  } finally {
    globalThis.fetch = realFetch;
  }
});
