/**
 * The road to a mailbox on the Cold email page: the one thing a new account can't skip. The sheet says what connecting
 * gives, in the owner's words, and a refused account comes back to a sheet that says why and what to do. Only Google
 * Workspace connects; "Tell us" keeps who asked for what on the ledger, so "We'll tell you when it's ready" can be kept.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { unmount, find, byTestId, textOf, press } from "../../_stub-react.mjs";
import { drawTab, redrawTab } from "../../_business-tab-harness.mjs";
import { until } from "../../shared/_until.mjs";
import { fakeDb } from "../../_fake-db.mjs";
import { MAILBOX_HISTORY_WORDS } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const { setServiceClient } = await import("../../../apps/dashboard/src/server/shared/service-db.ts");

after(() => unmount());

const STANDING = {
  kind: "no_mailbox",
  headline: "Connect your mailbox to start sending",
  detail: "Emails go out from your own address, so replies come back to you. Nothing can go out without one.",
  act: "Connect Google",
  to: null,
  needsYou: true,
  steps: [],
};
const READ = {
  standing: STANDING,
  sending: {
    from: null,
    more: 0,
    health: "none",
    pace: null,
    ceiling: null,
    checks: [],
    today: null,
    month: null,
    customerHost: null,
  },
  batch_mode: "ask",
  never: null,
  foot: { business: null, address: null },
  mailbox: null,
  month: { sent: 0, of: 2000 },
  by_hand_per_day: 30,
  claims: [],
  voice: [],
  sequence: null,
  reply_mode: "ask",
  about: null,
  about_from: null,
  known: { name: null, first_name: null, newest_search: null },
};

const asked = [];
globalThis.window.fetch = (url, init) => {
  asked.push([String(url), init?.method ?? "GET", init?.body ?? null]);
  const body = String(url).includes("settings/reach-out")
    ? { ok: true, data: READ }
    : String(url).includes("mailbox-connections/connect")
      ? { ok: true, data: { url: "https://accounts.example/consent" } }
      : { ok: false };
  return Promise.resolve(
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );
};
const page = () => drawTab({ part: "outreach", config: {} });
/** A member the door admits, over the workspace in memory (its role is what route-policy pins). */
const TENANT = "11111111-1111-4111-8111-111111111111";
const EVENTS = [];
const WORLD = fakeDb({
  memberships: [
    {
      user_id: "u1",
      tenant_id: TENANT,
      role: "owner",
      tenants: { slug: "harbor" },
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
  events: EVENTS,
});
setServiceClient(WORLD);
const CTX = {
  supabase: WORLD,
  userId: "u1",
  email: "owner@example.com",
  params: {},
};
const landed = async () => {
  await until(() => {
    page();
    return !!byTestId(redrawTab(), "rec-standing-act");
  }, "the page's read");
  return redrawTab();
};

test("the press opens the sheet that says what connecting gives, and only Google is offered", async () => {
  let tree = await landed();
  press(byTestId(tree, "rec-standing-act"));
  tree = redrawTab();
  const sheet = textOf(byTestId(tree, "rec-connect-sheet"));
  assert.match(sheet, /Chanlytics sends your emails from your own address, so replies come straight back to you\./);
  assert.match(sheet, /Starts at 10 a day/);
  assert.match(sheet, /Replies land in your Inbox here/);
  assert.match(sheet, /You approve the first run/);
  assert.match(sheet, /Not on Google Workspace\?/);
  assert.doesNotMatch(sheet, /Microsoft|Outlook|Exchange/);
  assert.match(textOf(byTestId(tree, "rec-connect-google")), /Connect Google/);
  unmount();
});

test("Connect Google asks for the way to Google's consent, and to come back to this page", async () => {
  let tree = await landed();
  press(byTestId(tree, "rec-standing-act"));
  tree = redrawTab();
  press(byTestId(tree, "rec-connect-google"));
  await until(() => asked.some(([u]) => u.includes("mailbox-connections/connect")), "the connect door");
  const [url] = asked.find(([u]) => u.includes("mailbox-connections/connect"));
  assert.match(url, /provider=google/);
  assert.match(url, /back=cold_email/);
  unmount();
});

test("connecting says what it brings in, and the owner's choice rides the connect", async () => {
  asked.length = 0;
  let tree = await landed();
  press(byTestId(tree, "rec-standing-act"));
  tree = redrawTab();
  assert.match(textOf(byTestId(tree, "mailbox-history-line")), /last 6 months/i, "said before anything leaves");
  press(byTestId(tree, "mailbox-history-change"));
  const ways = () => find(redrawTab(), (n) => n.props?.label === MAILBOX_HISTORY_WORDS.choose);
  ways().props.onValueChange("from_now");
  press(byTestId(redrawTab(), "rec-connect-google"));
  await until(() => asked.some(([u]) => u.includes("mailbox-connections/connect")), "the connect door");
  const [url] = asked.find(([u]) => u.includes("mailbox-connections/connect"));
  assert.match(url, /history=from_now/);
  unmount();
});

test("an account refused may try again, and is told what trying brings in too", async () => {
  globalThis.window.location.search = "?mailbox=error&why=free_mail";
  await landed();
  const tree = redrawTab();
  assert.ok(byTestId(byTestId(tree, "rec-connect-free-sheet"), "mailbox-history-line"));
  unmount();
  globalThis.window.location.search = "";
});

test("Not on Google Workspace says what works, and Tell us posts a name and says thanks", async () => {
  let tree = await landed();
  press(byTestId(tree, "rec-standing-act"));
  tree = redrawTab();
  press(byTestId(tree, "rec-connect-other"));
  tree = redrawTab();
  const other = textOf(byTestId(tree, "rec-connect-other-sheet"));
  assert.match(other, /Your main email can stay where it is/);
  assert.match(other, /a Google Workspace mailbox on a second domain works/);
  const box = find(byTestId(tree, "rec-provider-box"), (n) => n.type === "input");
  assert.equal(box.props.placeholder, "Microsoft 365, for example");
  box.props.onChange({ target: { value: "  Microsoft 365  " } });
  tree = redrawTab();
  press(byTestId(tree, "rec-provider-send"));
  await until(() => asked.some(([u]) => u.includes("provider-wanted")), "Tell us");
  const [, method, body] = asked.find(([u]) => u.includes("provider-wanted"));
  assert.equal(method, "POST");
  assert.deepEqual(JSON.parse(body), { provider: "Microsoft 365" });
  unmount();
});

test("an account refused comes back to a sheet that says why, in the owner's words", async () => {
  for (const [why, sheetId, words] of [
    ["free_mail", "rec-connect-free-sheet", /That's a personal address/],
    ["not_workspace", "rec-connect-other-sheet", /Not on Google Workspace\?/],
  ]) {
    globalThis.window.location.search = `?mailbox=error&why=${why}`;
    await landed();
    const tree = redrawTab();
    assert.match(textOf(byTestId(tree, sheetId)), words, why);
    unmount();
  }
  globalThis.window.location.search = "";
});

test("Tell us takes a name that says something, and keeps it on the ledger with who asked", async () => {
  const { POST } = await import("../../../apps/dashboard/app/api/v1/settings/reach-out/provider-wanted/route.ts");
  const ask = (provider) =>
    POST.run(
      new Request("http://x/api/v1/settings/reach-out/provider-wanted", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider }),
      }),
      CTX,
    );
  const refused = await ask("   ").then(
    () => null,
    (e) => e,
  );
  assert.match(String(refused?.message), /Say which you use/);
  assert.deepEqual(EVENTS, [], "nothing said, nothing kept");
  assert.deepEqual(await ask("Microsoft 365"), { told: true });
  assert.equal(EVENTS.length, 1);
  assert.equal(EVENTS[0].kind, "mailbox_connection.provider_wanted");
  assert.equal(EVENTS[0].tenant_id, TENANT);
  assert.deepEqual(EVENTS[0].data, { provider: "Microsoft 365", by: "u1" });
});
