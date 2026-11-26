/**
 * Keeping the WhatsApp Business app is a press of its own on Settings › Connections, where Meta's door offers it: the
 * row's second button asks Meta's flow for the app's users (`keepApp`), and Connect stays the plain sign-up (decision
 * 0073, R12). Drawn on the stub React over the pane itself; pinned as pane.tsx's and row.tsx's text in
 * whatsapp-connect.test.mjs until 26 Nov 2026.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, fresh, again, byTestId } from "../../_stub-react.mjs";
import { bridgeHolds } from "../../shell/_bridge-holds.mjs";
import { until } from "../../shared/_until.mjs";

installStubReact();
const { setSurfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");
const SETTINGS = "../../../apps/dashboard/src/surfaces/settings/connections";
const { PaneIntegrationsReal } = await import(`${SETTINGS}/pane.tsx`);
const { waConnect, lineCodes, waStanding } = await import(`${SETTINGS}/whatsapp.ts`);

// What the open pane asks beside Meta's door, and nothing here may send: the codes sent to the line, the number's check.
Object.assign(lineCodes, { read: async () => [] });
Object.assign(waStanding, { check: async () => true });

const pane = () => globalThis.React.createElement(PaneIntegrationsReal, {});
/** The pane drawn again until `id` is in it (Meta's door answered), and that drawing. */
async function drawnWith(id) {
  let tree = again(pane);
  await until(() => byTestId((tree = again(pane)), id), `${id} drawn`);
  return tree;
}

test("where Meta's door offers it, the row's second press asks Meta's flow for the app's users, and Connect the plain one", async () => {
  bridgeHolds({ who: { me: { email: "dana@northside.example", role: "owner" } } });
  setSurfaceValue("channels", { rows: [] });
  setSurfaceValue("setup", null);
  setSurfaceValue("google", null);
  const asked = [];
  Object.assign(waConnect, {
    config: async () => ({ ready: true, reason: null, keep_app: true }),
    start: async (ask) => {
      asked.push(ask);
      return { ok: false, reason: "cancelled", message: "The sign-up was closed before it finished." };
    },
  });
  fresh();
  byTestId(await drawnWith("connect-whatsapp-keep-btn"), "connect-whatsapp-keep-btn").props.onClick();
  await until(() => asked.length === 1, "the keep press asked Meta");
  byTestId(await drawnWith("connect-whatsapp-btn"), "connect-whatsapp-btn").props.onClick();
  await until(() => asked.length === 2, "Connect asked Meta");
  assert.deepEqual(asked, [{ keepApp: true }, {}]);

  // Where Meta's door does not offer it, there is nothing to press. Connect is drawn only once the door has answered
  // (while it is asked the row offers nothing, model/setup.ts), so its drawing is the answer the keep press is judged by.
  Object.assign(waConnect, { config: async () => ({ ready: true, reason: null }) });
  fresh();
  const plain = await drawnWith("connect-whatsapp-btn");
  assert.equal(byTestId(plain, "connect-whatsapp-keep-btn"), null);
});
