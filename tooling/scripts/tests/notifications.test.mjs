/**
 * The bell, fed by what the browser already holds.
 *
 * The seeded bell promised five things that never happened and a real
 * session showed nothing. Now the feed is built from the Inbox threads, the
 * Live calls and the open invitations already on the page; this device
 * remembers what it has seen; and, when asked, it raises a system alert for
 * something new that needs the owner while the app is in the background.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildNotificationFeed, applyReadState, agoLabel, ALERT_KINDS } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const NOW = Date.parse("2026-09-05T15:00:00Z");

const thread = (over) => ({ id: "t1", real: true, needsYou: false, who: "Dani", preview: "can I come saturday?", ...over });
const call = (over) => ({ callId: "k1", cvId: "cv-k1", who: "+1 917 555 0100", number: "+1 917 555 0100", missed: true, live: false, startedAtMs: NOW - 3_600_000, ...over });

test("the feed: who needs you, a draft still waiting, a missed call today, an open invitation — newest first, real only", () => {
  const items = buildNotificationFeed({
    threads: [
      thread({ needsYou: true, waitingMin: 12 }),
      thread({ id: "t2", who: "Rosa", veto: { window: 60, endsAtMs: NOW + 30_000, messageId: "m2", draft: "We open at 10 tomorrow, come by!", why: { heldFor: "low_confidence" } } }),
      thread({ id: "t3", who: "Old", veto: { window: 60, endsAtMs: NOW - 1, messageId: "m3", draft: "gone" } }),
      thread({ id: "seed", real: false, needsYou: true, who: "Aisha Khan" }),
    ],
    calls: [call({}), call({ callId: "k2", cvId: "cv-k2", startedAtMs: NOW - 2 * 86_400_000 }), call({ callId: "k3", cvId: "cv-k3", missed: false })],
    invites: [{ id: "i1", email: "sam@salon.com", created_at: "2026-09-04T15:00:00Z" }],
    now: NOW,
  });
  assert.deepEqual(items.map((i) => i.key), ["draft:m2", "needs:t1", "call:k1", "invite:i1"], "the seed thread, the expired draft, the old and the answered calls are out");
  assert.equal(items[0].at, NOW + 30_000 - 60_000, "a draft's moment is when it was written");
  assert.ok(items[0].message.startsWith("Not sure enough to send alone · “We open at 10 tomorrow"));
  assert.equal(items[1].at, NOW - 12 * 60_000, "without an absolute time, how long they have waited");
  const abs = buildNotificationFeed({ threads: [thread({ needsYou: true, waitingMin: 12, escalatedAtMs: NOW - 5 * 60_000 })], now: NOW });
  assert.equal(abs[0].at, NOW - 5 * 60_000, "the escalation's own moment wins: it never drifts with the clock");
  assert.equal(items[1].title, "Dani needs you");
  assert.equal(items[1].to, "inbox/t1");
  assert.equal(items[2].to, "conversations/cv-k1");
  assert.equal(items[3].to, "admin/workspace");
  assert.deepEqual(buildNotificationFeed({ now: NOW }), []);
});

test("this device's read state: seen moves the line, read and dismissed are by key", () => {
  const items = buildNotificationFeed({ threads: [thread({ needsYou: true, waitingMin: 5 }), thread({ id: "t9", who: "Ana", needsYou: true, waitingMin: 120 })], now: NOW });
  const fresh = applyReadState(items, { seenAt: 0, read: [], dismissed: [], alerts: false });
  assert.deepEqual(fresh.map((r) => r.unread), [true, true]);
  const seen = applyReadState(items, { seenAt: NOW - 30 * 60_000, read: [], dismissed: [], alerts: false });
  assert.deepEqual(seen.map((r) => [r.key, r.unread]), [["needs:t1", true], ["needs:t9", false]], "what became true after the last look is new");
  const read = applyReadState(items, { seenAt: 0, read: ["needs:t1"], dismissed: ["needs:t9"], alerts: false });
  assert.deepEqual(read.map((r) => [r.key, r.unread]), [["needs:t1", false]]);
  assert.equal(agoLabel(NOW - 20_000, NOW), "now");
  assert.equal(agoLabel(NOW - 5 * 60_000, NOW), "5m");
  assert.equal(agoLabel(NOW - 3 * 3_600_000, NOW), "3h");
  assert.equal(agoLabel(NOW - 2 * 86_400_000, NOW), "2d");
  assert.deepEqual([...ALERT_KINDS], ["needs_you", "held_draft", "missed_call"], "an invitation can wait for the bell");
});

test("the bridge: reads the globals, keeps state per workspace and device, alerts only for what appears after the first look and only in the background", async () => {
  const mod = await import(pathToFileURL(path.join(here, "../../../apps/dashboard/src/legacy-bridge/notifications.ts")).href);
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const handlers = {};
  const fired = [];
  const base = Date.now();
  class FakeNotification {
    static permission = "granted";
    constructor(title, opts) { fired.push({ title, tag: opts.tag }); this.close = () => {}; }
    static async requestPermission() { return "granted"; }
  }
  const win = {
    addEventListener: (ev, fn) => { handlers[ev] = fn; },
    document: { visibilityState: "hidden" },
    focus: () => {},
    location: { hash: "" },
    Notification: FakeNotification,
    INBOX_DATA: { THREADS: [thread({ needsYou: true, escalatedAtMs: base - 60_000 })] },
    __LIVE: { now: [], recent: [] },
    __TEAM_INVITES: [],
  };
  const api = mod.installNotifications(win, storage);
  assert.equal(win.__notifs, api, "published for the top bar");
  assert.equal(api.feed().length, 1);
  assert.equal(api.unread(), 1);
  assert.equal(api.feed()[0].actions[0].to, "inbox/t1");
  // First look: the backlog never alerts.
  handlers["surface:inbox"]();
  assert.deepEqual(fired, []);
  // Alerts are off until the owner asks.
  win.INBOX_DATA.THREADS.push(thread({ id: "t2", who: "Rosa", needsYou: true, escalatedAtMs: base - 30_000 }));
  handlers["surface:inbox"]();
  assert.deepEqual(fired, [], "off by default");
  const r = await api.setAlerts(true);
  assert.deepEqual(r, { on: true, permission: "granted" });
  assert.equal(api.alerts().on, true);
  win.INBOX_DATA.THREADS.push(thread({ id: "t3", who: "Ana", needsYou: true, escalatedAtMs: base - 20_000 }));
  handlers["surface:inbox"]();
  assert.deepEqual(fired, [{ title: "Ana needs you", tag: "needs:t3" }], "only the new one, only in the background");
  win.document.visibilityState = "visible";
  win.INBOX_DATA.THREADS.push(thread({ id: "t4", who: "Bea", needsYou: true, escalatedAtMs: base - 10_000 }));
  handlers["surface:inbox"]();
  assert.equal(fired.length, 1, "in view, the bell is enough");
  // Read state lives in this device's storage, keyed by workspace.
  api.read("needs:t1");
  api.dismiss("needs:t2");
  assert.deepEqual(api.feed().map((x) => [x.id, x.unread]), [["needs:t4", true], ["needs:t3", true], ["needs:t1", false]]);
  api.seenAll();
  assert.equal(api.unread(), 0);
  const saved = JSON.parse(store.get("chanlytics:notifs:default"));
  assert.ok(saved.seenAt > 0 && saved.read.includes("needs:t1") && saved.dismissed.includes("needs:t2") && saved.alerts === true);
  api.restore("needs:t2");
  assert.equal(api.feed().length, 4);
});

test("the top bar shows the real feed outside a demo, with the device-alert switch", () => {
  const tb = readRaw("apps/dashboard/src/legacy/components/topbar.jsx");
  assert.ok(tb.includes("const real = !window.__DEMO_MODE && window.__notifs ? window.__notifs : null;"));
  assert.ok(tb.includes("const shown = real ? realRows : window.__DEMO_MODE ? notifs.map(tbOverlay) : [];"));
  assert.ok(tb.includes("real.onChange("), "repaints when a surface refreshes or a mark changes");
  assert.ok(tb.includes("if (real) { real.seenAll();"), "Mark all read is this device's line");
  assert.ok(tb.includes('data-testid="notif-alerts"'), "the switch is addressable");
  assert.ok(tb.includes("Alerts are blocked in your browser settings"), "a denied permission is said, not hidden");
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx").includes("installNotifications();"));
  assert.ok(readCode("packages/contracts/src/index.ts").includes('export * from "./notifications";'));
});
