/**
 * Each workspace's day, counted (00279 platform_metrics), from the back office's side: the read that turns the
 * nightly rollup's rows into the wire's numbers, the overview route that carries them beside the workspaces, and the
 * words the card says. The rollup itself, and its alarm's condition, run on a real Postgres in
 * platform/platform-metrics.db.test.mjs; the sweep that pages the alarm is cron/cron-health-door.test.mjs's.
 *
 * Like field data, it never fails loudly: a read that fails leaves the back office's other cards standing and says it
 * could not be read (null), and a database 00279 has not reached has no days to show (none).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PLATFORM_DAYS_READ, platformDaysWords } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const { platformDays } = await import(at("apps/dashboard/src/server/platform/day-counts.ts"));
const overview = await import(at("apps/dashboard/app/api/v1/platform/overview/route.ts"));

after(() => setServiceClient(null));

const raise = (code, message) => () => {
  throw Object.assign(new Error(message), { code });
};
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** A row as platform_metrics_read answers it: counts by channel and by outcome as jsonb, tokens as a bigint's string. */
const stored = (tenant_id, name, day, over = {}) => ({
  tenant_id,
  name,
  day,
  messages_in: { whatsapp: 9, sms: 2 },
  messages_out: { whatsapp: 8 },
  asks: 11,
  answered: 11,
  replies_answered: 8,
  replies_held: 1,
  replies_handed_off: 2,
  brain_p95_ms: 2140,
  provider_failures: {},
  tokens: "48213",
  ...over,
});
const office = (rpc) => ({ db: fakeDb({}, {}, { platform_metrics_read: rpc }), session: null });

test("the back office's read asks for the bounded window and answers the wire's numbers: counts as numbers, tokens as one, anything else in a count dropped", async () => {
  const asked = [];
  const read = await platformDays(
    office((args) => {
      asked.push(args);
      return [
        stored(A, "Harbor Moving", "2026-09-28", {
          messages_in: { whatsapp: 9, sms: "x", email: null, voice: 3 },
          provider_failures: { retryable: 2, refused: 1 },
        }),
        stored(B, "Bayside Dental", "2026-09-28", { brain_p95_ms: null, messages_in: null, tokens: 0 }),
      ];
    }),
  );
  assert.deepEqual(asked, [{ p_days: PLATFORM_DAYS_READ.days }]);
  assert.deepEqual(read[0], {
    tenant_id: A,
    name: "Harbor Moving",
    day: "2026-09-28",
    messages_in: { whatsapp: 9, voice: 3 },
    messages_out: { whatsapp: 8 },
    asks: 11,
    answered: 11,
    replies_answered: 8,
    replies_held: 1,
    replies_handed_off: 2,
    brain_p95_ms: 2140,
    provider_failures: { retryable: 2, refused: 1 },
    tokens: 48213,
  });
  assert.deepEqual([read[1].messages_in, read[1].brain_p95_ms, read[1].tokens], [{}, null, 0]);
});

test("a read that fails is unread (null), and a database the migration has not reached has no days (none)", async () => {
  assert.equal(await platformDays(office(raise("57014", "canceling statement due to statement timeout"))), null);
  assert.deepEqual(await platformDays(office(raise("PGRST202", "Could not find the function"))), []);
});

test("the days ride on the overview beside the workspaces, and a read that fails takes nothing else with it", async () => {
  const session = {
    is_platform_admin: () => true,
    platform_overview: () => [],
    platform_partner_balances: () => [],
    platform_partner_workspaces: () => [],
  };
  const ctx = { supabase: fakeDb({}, {}, session), userId: "u1", email: "ada@example.com", params: {} };
  const service = (days) =>
    fakeDb(
      { waitlist: [] },
      {},
      { sweep_health: () => [], jobs_backlog: () => 0, page_vitals_p75: () => [], platform_metrics_read: days },
    );
  setServiceClient(service(() => [stored(A, "Harbor Moving", "2026-09-28")]));
  const out = await overview.GET.run(new Request("http://localhost/api/v1/platform/overview"), ctx);
  assert.deepEqual(
    out.days.map((d) => [d.name, d.day, d.asks]),
    [["Harbor Moving", "2026-09-28", 11]],
  );
  setServiceClient(service(raise("57014", "canceling statement due to statement timeout")));
  const down = await overview.GET.run(new Request("http://localhost/api/v1/platform/overview"), ctx);
  assert.equal(down.days, null, "unread, said as unread");
  assert.deepEqual(down.tenants, []);
  assert.equal(down.health.backlog, 0);
});

test("the card's words: the newest day only, the workspaces that answered nobody first, then the busiest; a failed send says what it came to", () => {
  const rows = [
    stored(A, "Harbor Moving", "2026-09-28"),
    stored(B, "Bayside Dental", "2026-09-28", {
      asks: 7,
      answered: 0,
      replies_answered: 0,
      replies_held: 0,
      replies_handed_off: 0,
      brain_p95_ms: null,
      provider_failures: { retryable: 4, unknown: 1, refused: 2 },
    }),
    stored(C, "Cedar Salon", "2026-09-28", { asks: 30, answered: 29, replies_held: 0, replies_handed_off: 0 }),
    stored(A, "Harbor Moving", "2026-09-27", { asks: 99, answered: 0 }),
  ];
  const words = platformDaysWords(rows);
  assert.equal(words.day, "2026-09-28");
  assert.equal(words.sentence, "3 workspaces worked on 2026-09-28; 1 answered nobody.");
  assert.deepEqual(
    words.lines.map((l) => [l.name, l.silent, l.tone]),
    [
      ["Bayside Dental", true, "danger"],
      ["Cedar Salon", false, "plain"],
      ["Harbor Moving", false, "plain"],
    ],
    "yesterday's silence is not today's card",
  );
  assert.equal(words.lines[0].answers, "7 asked, 0 answered");
  assert.equal(words.lines[0].receptionist, "the receptionist did not reply");
  assert.equal(words.lines[0].failures, "7 sends failed (2 refused, 4 not taken, 1 may have gone)");
  assert.equal(words.lines[2].answers, "11 asked, 11 answered");
  assert.equal(words.lines[2].receptionist, "8 answered at once, 1 held, 2 handed over · 95% within 2.1 s");
  assert.equal(words.lines[2].failures, "");
  assert.equal(
    platformDaysWords([stored(A, "Harbor Moving", "2026-09-28")]).sentence,
    "1 workspace worked on 2026-09-28; every one written to answered.",
  );
  assert.deepEqual(platformDaysWords(null), { day: null, sentence: "Could not be read just now.", lines: [] });
  assert.deepEqual(platformDaysWords([]), { day: null, sentence: "No day has been counted yet.", lines: [] });
});
