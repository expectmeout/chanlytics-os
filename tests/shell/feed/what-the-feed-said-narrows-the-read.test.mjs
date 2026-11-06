/**
 * What the feed said narrows the read, and a call's words are read where Live is (the wiring's second audit, lane R9: S10-2,
 * S10-4), run on the real surfaces over a wire that answers their reads.
 *
 *  1. A delivery's receipts read Conversations' rows alone: the holds and the calls are the last read's. Every receipt of a
 *     reminder run read all three, three requests where one tells. A new message among the receipts, a read nobody heard of, and
 *     a read after one whose calls failed read all three.
 *  2. A call starting or ending is Live's to read wherever the tab is; a turn of one under way only on Live's page, or once Live's
 *     read is five minutes old. Elsewhere it is kept for Live's page, and read once as it comes on screen. Every turn, every few
 *     seconds, read the newest hundred calls with their transcripts on whatever page was open.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { memberWords, stateOf } from "@chanlytics/contracts";
import { installLegacyReact } from "../../_legacy-react.mjs";
import { importSrc } from "../../_source.mjs";

const quiet = async (fn) => {
  const e = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = e;
  }
};

installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
Object.assign(globalThis, {
  location: {
    pathname: "/w/studio",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
  __chrome: { state: stateOf },
  __identity: { member: memberWords },
  CHANLY: { nav() {}, R: {}, IX_NOW: "12:04", CONF: { SAFE: 0.8, MED: 0.5 } },
});

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** What each read asked the wire for, by route; and whether the calls answer. */
let asked = [];
let failCalls = false;
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  asked.push(u.pathname.replace("/api/v1/", ""));
  if (u.pathname === "/api/v1/conversations") return json(200, { ok: true, data: { conversations: [] } });
  if (u.pathname === "/api/v1/escalations") return json(200, { ok: true, data: { escalations: [] } });
  if (u.pathname === "/api/v1/calls")
    return failCalls
      ? json(500, { ok: false, error: { code: "internal", message: "down" } })
      : json(200, { ok: true, data: { calls: [] } });
  if (u.pathname === "/api/v1/workspaces")
    return json(200, { ok: true, data: { workspaces: globalThis.__WORKSPACES, activeWorkspaceId: "t1" } });
  return json(404, { ok: false, error: { code: "not_found", message: u.pathname } });
};

const { conversationsOverride } = await quiet(() =>
  importSrc("apps/dashboard/src/surfaces/inbox/conversations-surface.ts"),
);
const { liveOverride } = await quiet(() => importSrc("apps/dashboard/src/surfaces/live/surface.ts"));
const { api } = await importSrc("apps/dashboard/src/legacy-bridge/api.ts");
const { wantsRefresh } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
const { readWhatWasMissed } = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");

const MINUTE = 60_000;
const ALL_THREE = ["calls", "conversations", "escalations"];
const tick = (status = "delivered") => ({ table: "messages", event: "UPDATE", row: { status } });
const newMessage = { table: "messages", event: "INSERT", row: {} };

/** One read of Conversations, told of these changes, as the runner makes it: what it asked the wire for. */
async function readConversations(heard) {
  // A read the feed asks for shares none already out (surface-runner.ts refreshSoon).
  api().forget();
  asked = [];
  await quiet(() => conversationsOverride.apply(heard));
  return [...new Set(asked)].sort();
}

test("a delivery's receipts read Conversations' rows alone: the holds and the calls are the last read's (S10-2)", async () => {
  failCalls = false;
  assert.deepEqual(await readConversations(), ALL_THREE, "the first read: all three");
  assert.deepEqual(
    await readConversations([tick("sent"), tick("delivered"), tick("read")]),
    ["conversations"],
    "receipts alone: the rows, whose last words carry the ticks, and nothing beside them",
  );
  assert.deepEqual(await readConversations([tick(), newMessage]), ALL_THREE, "a new message among them: all three");
  assert.deepEqual(
    await readConversations(),
    ALL_THREE,
    "a read nobody heard of (a pass, Retry, a write's): all three",
  );
});

test("a read after one whose calls failed reads the calls again, receipts or not: nothing failed is kept", async () => {
  failCalls = true;
  await readConversations();
  failCalls = false;
  assert.deepEqual(await readConversations([tick()]), ALL_THREE);
});

test("a call's turn is read on Live's page, and elsewhere kept for it until Live's read is five minutes old (S10-4)", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-14T15:00:00Z") });
  const onScreen = (route) => {
    globalThis.location.pathname = route ? `/w/studio/${route}` : "/w/studio";
  };
  const turn = { table: "calls", event: "UPDATE", row: { status: "ongoing" } };
  // The address the registry hears moves on, as the shell's pushes and the browser's back say it.
  const win = {
    location: globalThis.location,
    addEventListener(_t, fn) {
      this.on = fn;
    },
    removeEventListener() {},
  };
  try {
    onScreen("");
    await quiet(() => liveOverride.apply());
    assert.equal(
      wantsRefresh(liveOverride, "calls", turn),
      false,
      "a turn heard on Today, Live read a moment ago: kept",
    );
    assert.equal(
      wantsRefresh(liveOverride, "calls", { table: "calls", event: "INSERT", row: { status: "ongoing" } }),
      true,
      "a call starting: read wherever the tab is",
    );
    assert.equal(
      wantsRefresh(liveOverride, "calls", { table: "calls", event: "UPDATE", row: { status: "completed" } }),
      true,
      "a call ending",
    );

    const read = [];
    const stop = readWhatWasMissed([liveOverride], (keys) => read.push(...keys), win);
    onScreen("live");
    win.on?.();
    stop();
    assert.deepEqual(read, ["live"], "the turn kept is read once, as Live comes on screen");
    assert.equal(wantsRefresh(liveOverride, "calls", turn), true, "on Live's page, every turn");

    onScreen("");
    t.mock.timers.tick(5 * MINUTE + 1);
    assert.equal(
      wantsRefresh(liveOverride, "calls", turn),
      true,
      "and elsewhere once Live's read is five minutes old: the top bar's line of the call and Today's stay honest",
    );
  } finally {
    onScreen("");
    t.mock.timers.reset();
  }
});
