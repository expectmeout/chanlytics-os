/**
 * How it runs (sequences/settings-sheet.tsx), as its Save reaches the change door: a sequence's own mode, chosen under
 * Before each batch (decision 0064), goes as the body's `mode`, beside only what else changed. The sheet once sent it as
 * the payload's `mode`, which the verb's spec reads as the card's reading of how its runs go (contracts
 * playbookChangeSpec reads a sequence's under `sequence_mode`), so Save wrote nothing and said it had: found on the
 * throwaway stack, 19 Oct 2026. Run through the real sheet on the stub React, the verbs' one door and the typed client,
 * with the wire answered by the test.
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
  // The role store's gate (the frame's window.gate, canDo), over an owner and contracts' table.
  ST_STORE: { can: (a) => !!contracts.ROLE_PERMS.owner[a], myRole: () => "owner" },
  __roleGate: contracts.roleGate,
  useHotkey: () => {},
});
(await import("../../../../apps/dashboard/src/surfaces/frame/frame-globals.ts")).installFrameGlobals();
const S = "../../../../apps/dashboard/src/surfaces";
const { Sheet } = await import(`${S}/kit/sheet/sheet.tsx`);
const { SettingsSheet } = await import(`${S}/campaigns/sequences/settings-sheet.tsx`);

const SEQ = "seq-1";
const REC = {
  sequence: {
    id: SEQ,
    name: "Win-back",
    state: "on",
    starts: "moment",
    mode: "veto",
    first: { id: SEQ, run_hour: 10, until: null, policy_class: "reengage", trigger: "quiet_30" },
    next: null,
  },
  settings: { cap_per_run: 25, gap_days: 90, cadence_days: 30 },
  evidence: null,
  timezone: "UTC",
  steps: [],
};

/** The wire: each request recorded, answered as the change door answers one it wrote. */
let wire = [];
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
W.fetch = async (url, init = {}) => {
  const path = new URL(String(url), "https://app.example").pathname.replace(/^.*\/api\/v1\//, "");
  wire.push([init.method || "GET", path, init.body ? JSON.parse(init.body) : null]);
  return json(200, { ok: true, data: { id: SEQ, name: "Win-back", was: { mode: "veto" }, decision_id: "d-1" } });
};

let flashes = [];
let closed = 0;
const draw = () =>
  again(() =>
    W.React.createElement(SettingsSheet, {
      open: true,
      rec: REC,
      flash: (f) => flashes.push(f),
      moved: () => {},
      onClose: () => (closed += 1),
    }),
  );
/** What the open sheet draws: its body and its foot, by what the record hands the kit's Sheet. */
const sheetOf = (tree) => {
  const s = find(tree, (n) => n.type === Sheet && n.props.open);
  return s ? [s.props.children, s.props.foot] : null;
};

beforeEach(() => {
  unmount();
  fresh();
  wire = [];
  flashes = [];
  closed = 0;
});

test("Before each batch, changed and saved, reaches the change door as the sequence's mode, with nothing else that did not change", async () => {
  const mode = byTestId(sheetOf(draw()), "sq-settings-mode");
  assert.equal(mode.props.value, "veto", "it opens on the sequence's own mode");
  mode.props.onValueChange("ask");
  press(byTestId(sheetOf(draw()), "sq-settings-save"));
  // The press walks the verbs' door, the wire and its answer: settled once it has closed the sheet, or given up.
  for (let i = 0; i < 200 && closed === 0; i += 1) await new Promise((r) => setTimeout(r, 5));
  const puts = wire.filter(([m]) => m === "PUT");
  assert.equal(puts.length, 1, "one save");
  const [, path, body] = puts[0];
  assert.equal(path, `playbooks/${SEQ}`, "the campaign's own door, by the sequence");
  assert.equal(body.mode, "ask", "the mode chosen, as the door takes it");
  assert.deepEqual(
    Object.keys(body).sort(),
    ["mode", "name"],
    "the hour, the cap, the gap and the last day did not change, so none of them is sent",
  );
  assert.equal(closed, 1, "the sheet closes on the door's answer");
  const said = flashes.at(-1);
  assert.equal(said?.tone, "ok");
  // Its Undo puts back the mode the door said it found.
  await said.undo();
  const back = wire.filter(([m]) => m === "PUT").at(-1);
  assert.deepEqual([back[1], back[2]], [`playbooks/${SEQ}`, { mode: "veto" }]);
});
