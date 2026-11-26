/**
 * The code a customer scans to say yes to offers, run: GET /api/v1/consent/qr through route() with its module's own
 * `run`, over a database in memory. It encodes one link, the workspace's own WhatsApp number with the opt-in words, and
 * nothing a caller chooses; a workspace with no number has nothing to say yes to, and one that takes no sign-ups hands
 * out no code. Pinned as the route's and consent-qr.ts's text in broadcasts.test.mjs until 26 Nov 2026.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { optInLink } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { importSrc } from "../_source.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/shared/rate-limit.ts");
const qr = await importSrc("apps/dashboard/app/api/v1/consent/qr/route.ts");
const QRCode = createRequire(new URL("../../apps/dashboard/package.json", import.meta.url))("qrcode");
beforeEach(() => setRateStore(memoryStore()));

const T = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const NUMBER = "+13055550188";
const ctx = ({ tenant = {}, channels = [{ number_e164: NUMBER }] } = {}) => ({
  supabase: fakeDb({
    memberships: [
      {
        user_id: USER,
        tenant_id: T,
        role: "operator",
        tenants: { slug: "harbor" },
        created_at: "2026-02-01T00:00:00Z",
      },
    ],
    tenants: [
      { id: T, slug: "harbor", name: "Harbor Moving", status: "active", timezone: "America/New_York", ...tenant },
    ],
    tenant_channels: channels.map((c, i) => ({
      id: `ch-${i}`,
      tenant_id: T,
      kind: "whatsapp",
      status: "active",
      external_id: `wa-${i}`,
      created_at: `2026-02-0${i + 1}T00:00:00Z`,
      ...c,
    })),
  }),
  userId: USER,
  email: "ada@example.com",
  aal: "aal2",
  params: {},
});
const ask = (query = "") => new Request(`http://localhost/api/v1/consent/qr?workspace=${T}${query}`);
const refusalOf = (p) =>
  p.then(
    () => assert.fail("the route answered where it should have refused"),
    (e) => ({ code: e.code, status: e.status }),
  );

test("the code is the workspace's own number with the opt-in words, whatever the caller asks for", async () => {
  const res = await qr.GET.run(ask(), ctx());
  assert.equal(res.headers.get("content-type"), "image/svg+xml; charset=utf-8");
  const svg = await res.text();
  const theirs = await QRCode.toString(optInLink(NUMBER), {
    type: "svg",
    margin: 1,
    width: 240,
    errorCorrectionLevel: "M",
  });
  assert.equal(svg, theirs, "the code of the number's own opt-in link");
  const asked = await qr.GET.run(ask("&link=https%3A%2F%2Fevil.example&text=hi"), ctx());
  assert.equal(await asked.text(), theirs, "nothing a caller chooses is encoded");
  // A workspace holding two numbers says the one Connections shows, the oldest, each time.
  const two = await qr.GET.run(ask(), ctx({ channels: [{ number_e164: NUMBER }, { number_e164: "+13055550199" }] }));
  assert.equal(await two.text(), theirs);
});

test("no number, no code; and a workspace that takes no sign-ups hands out none", async () => {
  assert.deepEqual(await refusalOf(qr.GET.run(ask(), ctx({ channels: [] }))), { code: "not_found", status: 404 });
  for (const [why, tenant] of [
    ["paused", { status: "paused" }],
    ["ended", { left_empty_at: "2026-10-01T00:00:00Z" }],
  ])
    assert.deepEqual(await refusalOf(qr.GET.run(ask(), ctx({ tenant }))), { code: "conflict", status: 409 }, why);
});
