/**
 * How it runs, for a freed time's sequence (sequences/settings-sheet.tsx, decision 0082): it runs when a cancellation
 * frees a time, so it offers no hour; the most it sends is the people each freed time goes to (2, 4, 6 or 10); it says
 * how far ahead it offers, the workspace's booking window; and Save sends only what changed. Run through the real sheet
 * on the stub React, the verbs' one door and the typed client, with the wire answered by the test.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, find, byTestId, press, unmount } from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false, __surfaceState: () => "live", __chrome: { state: contracts.stateOf } });
const W = globalThis;
Object.assign(W, {
  CHANLY: { nav: () => {}, R: {} },
  appNavigate: () => {},
  ST_STORE: { can: (a) => !!contracts.ROLE_PERMS.owner[a], myRole: () => "owner" },
  __roleGate: contracts.roleGate,
  useHotkey: () => {},
});
(await import("../../../../apps/dashboard/src/surfaces/frame/frame-globals.ts")).installFrameGlobals();
const S = "../../../../apps/dashboard/src/surfaces";
const { Sheet } = await import(`${S}/kit/sheet/sheet.tsx`);
const { SettingsSheet } = await import(`${S}/campaigns/sequences/settings-sheet.tsx`);

const SEQ = "seq-freed";
const record = (settings) => ({
  sequence: {
    id: SEQ,
    name: "Fill a cancellation",
    state: "on",
    starts: "moment",
    mode: "ask",
    first: { id: SEQ, run_hour: 10, until: null, policy_class: "follow_up", trigger: "slot_opened" },
    next: null,
  },
  settings,
  evidence: null,
  timezone: "UTC",
  steps: [],
});

let wire = [];
let closed = 0;
W.fetch = async (url, init = {}) => {
  const path = new URL(String(url), "https://app.example").pathname.replace(/^.*\/api\/v1\//, "");
  wire.push([init.method || "GET", path, init.body ? JSON.parse(init.body) : null]);
  return new Response(
    JSON.stringify({
      ok: true,
      data: { id: SEQ, name: "Fill a cancellation", was: { cap_per_run: 4 }, decision_id: "d-1" },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
};

const draw = (rec) =>
  again(() =>
    W.React.createElement(SettingsSheet, {
      open: true,
      rec,
      flash: () => {},
      moved: () => {},
      onClose: () => (closed += 1),
    }),
  );
const sheetOf = (tree) => {
  const s = find(tree, (n) => n.type === Sheet && n.props.open);
  return s ? [s.props.children, s.props.foot] : null;
};
/** The text a node holds, its children's joined. */
const textOf = (n) =>
  n == null || typeof n === "boolean"
    ? ""
    : typeof n === "string" || typeof n === "number"
      ? String(n)
      : Array.isArray(n)
        ? n.map(textOf).join("")
        : textOf(n.props?.children);
/** The field a control sits in, by the control's test id: its label. */
const labelOf = (tree, testid) => find(tree, (n) => n.props?.control?.props?.["data-testid"] === testid)?.props.label;

beforeEach(() => {
  unmount();
  fresh();
  wire = [];
  closed = 0;
});

test("no hour, no gap and no cadence: the people each freed time goes to, 2, 4, 6 or 10, and how far ahead it offers", () => {
  const tree = sheetOf(draw(record({ cap_per_run: 4, gap_days: 7, cadence_days: 30, days_ahead: 21 })));
  for (const gone of ["sq-settings-hour", "sq-settings-gap", "sq-settings-every"])
    assert.equal(byTestId(tree, gone), null, `${gone}: a freed time runs when one is freed`);
  const cap = byTestId(tree, "sq-settings-cap");
  assert.equal(labelOf(tree, "sq-settings-cap"), "People per freed time");
  assert.equal(cap.props.value, "4");
  assert.deepEqual(
    cap.props.options.map((o) => [o.value, o.label]),
    [
      ["2", "2 people"],
      ["4", "4 people"],
      ["6", "6 people"],
      ["10", "10 people"],
    ],
  );
  assert.equal(
    textOf(byTestId(tree, "sq-settings-ahead")),
    "Up to 21 days ahead. The days ahead your receptionist offers times: change it in Settings, under Booking rules.",
  );
  // The mode and the last day are every sequence's.
  assert.ok(byTestId(tree, "sq-settings-mode") && byTestId(tree, "sq-settings-until"));
});

test("a number the sheet does not offer is kept among its choices; a server before it says nothing of how far ahead", () => {
  const tree = sheetOf(draw(record({ cap_per_run: 25, gap_days: 7, cadence_days: 30 })));
  assert.deepEqual(
    byTestId(tree, "sq-settings-cap").props.options.map((o) => o.value),
    ["2", "4", "6", "10", "25"],
  );
  assert.equal(byTestId(tree, "sq-settings-ahead"), null);
});

test("Save sends the people per freed time and nothing that did not change", async () => {
  const rec = record({ cap_per_run: 4, gap_days: 7, cadence_days: 30, days_ahead: 14 });
  byTestId(sheetOf(draw(rec)), "sq-settings-cap").props.onValueChange("6");
  press(byTestId(sheetOf(draw(rec)), "sq-settings-save"));
  for (let i = 0; i < 200 && closed === 0; i += 1) await new Promise((r) => setTimeout(r, 5));
  const puts = wire.filter(([m]) => m === "PUT");
  assert.equal(puts.length, 1);
  assert.deepEqual([puts[0][1], puts[0][2]], [`playbooks/${SEQ}`, { name: "Fill a cancellation", cap_per_run: 6 }]);
});
