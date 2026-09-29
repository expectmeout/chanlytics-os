/**
 * The phone app's walk (tooling/scripts/mobile), where it needs no phone: the screen read from uiautomator's tree, a
 * WebView's DevTools socket found by its own process, the bundle a launch ran read from the app's line in the log,
 * and a page's times moved to the moment the run started the app.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { devtoolsSocketOf, launchOf, median, nodesOf } from "../../mobile/device.mjs";
import { fromTheStart } from "../../mobile/cold-start.mjs";
import { launchLine } from "../../../../apps/mobile/src/shell/deploy.ts";

test("a node says its text and its description, entities undone, at the centre of its bounds", () => {
  const xml = [
    "<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation=\"0\">",
    '<node index="0" text="" content-desc="More" bounds="[864,2126][1080,2337]">',
    '<node index="1" text="Sign in with your email" content-desc="" bounds="[172,1330][908,1456]" />',
    '<node index="2" text="Save &quot;Calls&quot; as a CSV file" content-desc="" bounds="[0,0][10,10]" />',
    '<node index="3" text="R &amp; D" content-desc="Chart" bounds="[0,0][2,2]" />',
    '<node index="4" text="no bounds" content-desc="" />',
    "</node></hierarchy>",
  ].join("");
  assert.deepEqual(nodesOf(xml), [
    { says: "More", x: 972, y: 2232 },
    { says: "Sign in with your email", x: 540, y: 1393 },
    { says: 'Save "Calls" as a CSV file', x: 5, y: 5 },
    { says: "R & D Chart", x: 1, y: 1 },
  ]);
});

test("a WebView's DevTools socket is its own process's, never another whose id starts the same", () => {
  const table = [
    "Num       RefCount Protocol Flags    Type St Inode Path",
    "0000000000000000: 00000002 00000000 00010000 0001 01 123456 @webview_devtools_remote_42470",
    "0000000000000000: 00000002 00000000 00010000 0001 01 123457 @webview_devtools_remote_4247",
    "0000000000000000: 00000002 00000000 00010000 0001 01 123458 @chrome_devtools_remote",
  ].join("\n");
  assert.equal(devtoolsSocketOf(table, "4247"), "webview_devtools_remote_4247");
  assert.equal(devtoolsSocketOf(table, "42470"), "webview_devtools_remote_42470");
  assert.equal(devtoolsSocketOf(table, "424"), null);
});

test("the bundle a launch ran is the last line the app wrote as it started, read back from the device's log, and nothing when there is none or it does not read", () => {
  // The app's own line after the device's prefix, as the emulator printed one on 28 September (logcat's threadtime).
  const logged = (line) => `09-28 16:22:30.308 23774 23811 I ReactNativeJS: ${line}`;
  const embedded = { update: null, publishedAt: null, embedded: true, channel: "preview" };
  const update = {
    update: "01a0e9aa-08a6-720b-8552-18b293e0d69c",
    publishedAt: "2026-09-28T20:17:09.798Z",
    embedded: false,
    channel: "preview",
  };
  const log = [
    "--------- beginning of main",
    logged(launchLine(embedded)),
    logged('Running "main"'),
    logged(launchLine(update)),
  ];
  assert.deepEqual(launchOf(log.join("\r\n")), update);
  assert.deepEqual(launchOf(log.slice(0, 3).join("\n")), embedded);
  assert.equal(launchOf("--------- beginning of main"), null);
  assert.equal(launchOf(logged("app_launch {not json")), null);
});

test("a run's times are the page's own, moved to the moment the run started the app", () => {
  const read = { origin: 1_000_500, now: 9_000, server: 1_200, paint: 2_400, today: true };
  assert.deepEqual(fromTheStart(1_000_000, read), { server: 1_700, paint: 2_900, today: 9_500 });
  assert.equal(fromTheStart(1_000_000, { ...read, paint: null }).paint, null, "no paint yet is no paint");
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 3, "an even count is the rounded mean of the middle two");
});
