/**
 * Settings › Connections lists no message: a connected WhatsApp number's Settings point at Campaigns, where every message
 * the number sends is kept, and the pane draws no list of templates (Messages folded into Campaigns; the canvas of 10
 * Nov 2026). Drawn on the stub React over the pane itself; pinned as pane.tsx's and row.tsx's text in
 * templates/starter-templates.test.mjs until 26 Nov 2026. Where the press goes is the nightly's to walk
 * (e2e/settings/settings-integrations.spec.ts, "Integrations lists no template").
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, fresh, again, byTestId, textOf } from "../../_stub-react.mjs";
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
Object.assign(waConnect, { config: async () => ({ ready: true, reason: null }) });

const pane = () => globalThis.React.createElement(PaneIntegrationsReal, {});

test("a connected number's Settings point at Campaigns, and the pane lists no message", async () => {
  bridgeHolds({ who: { me: { email: "dana@northside.example", role: "owner" } } });
  setSurfaceValue("channels", {
    rows: [
      { id: "ch-wa", kind: "whatsapp", status: "active", number_e164: "+13055550111", external_id: "pn-1", config: {} },
    ],
  });
  setSurfaceValue("setup", null);
  setSurfaceValue("google", null);
  fresh();
  let tree = again(pane);
  await until(() => byTestId((tree = again(pane)), "connection-whatsapp-settings"), "the number's row drawn");
  assert.equal(byTestId(tree, "templates"), null, "no list of messages on the pane");

  byTestId(tree, "connection-whatsapp-settings").props.onClick();
  await until(() => byTestId((tree = again(pane)), "connection-whatsapp-verb"), "its Settings open");
  const verb = byTestId(tree, "connection-whatsapp-verb");
  assert.equal(textOf(verb), "Campaigns", "where the messages it sends are");
  assert.equal(verb.props["data-tip"], "What AI and your campaigns send on this number");
  assert.equal(byTestId(tree, "templates"), null, "and its Settings list none either");
});
