/**
 * Offers by email's ask on the person's page (00489), drawn: the real page (surfaces/people/person, ClientProfile) over a
 * wire the test answers. Someone the website brought, whom nobody asked yet, is offered "Ask to confirm"; the press is
 * one request to POST contacts/:id/signup-confirm, and the page says the edge's answer. An open ask offers nothing, a
 * person the website did not bring is offered nothing, and a viewer, who may record no answer, is offered nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  again,
  all,
  fresh,
  installLegacyReact,
  installRoleStore,
  settle,
  textOf,
  unmount,
} from "../../_legacy-react.mjs";
import { stateOf } from "@chanlytics/contracts";
import { personDto } from "../../consent/_person-row.mjs";

installLegacyReact({ __DEMO_MODE: false, __chrome: { state: stateOf } });
const W = globalThis;
const PEOPLE = "../../../../../apps/dashboard/src/surfaces/people";
const BRIDGE = "../../../../../apps/dashboard/src/legacy-bridge";
const ZONE = "America/New_York";
const toasts = [];
Object.assign(W, {
  __ME: { role: "operator", id: "u-me" },
  __WORKSPACES: [{ id: "t-1", slug: "harbor", name: "Harbor Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "t-1",
  CHANLY: { nav() {} },
  usePPToast: () => [null, (t) => toasts.push(t)],
});
installRoleStore(W);
W.mayAtLeast = (rung) => W.ST_STORE.mayAtLeast(rung);
const { ClientProfile } = await import(`${PEOPLE}/person/person-real.tsx`);
const { recFolds } = await import("../../../../../apps/dashboard/src/surfaces/kit/record/registry.ts");
const { clearReadCaches } = await import(`${BRIDGE}/read-cache.ts`);
await import(`${BRIDGE}/refresh-map.ts`);

const ID = "p-ana";
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** The wire: the person's read and the ask's door, answered as the test says, every request kept. */
const wire = { calls: [], person: null, answer: { asked: true, said: "We emailed them to confirm." } };
W.fetch = async (url, init = {}) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  const method = init.method || "GET";
  wire.calls.push({ method, path: u.pathname });
  await settle();
  if (method === "GET" && u.pathname === `/api/v1/contacts/${ID}`)
    return json(200, { ok: true, data: { person: wire.person } });
  if (method === "POST" && u.pathname === `/api/v1/contacts/${ID}/signup-confirm`)
    return json(200, { ok: true, data: wire.answer });
  return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
};

const NOW = Date.now();
const ROW = (over = {}) =>
  personDto({
    id: ID,
    display_name: "Ana Ruiz",
    email: "ana@example.com",
    email_marketing: "unknown",
    came_from: "website",
    ...over,
  });
/** The confirmation an ask wrote, sent `daysAgo` days ago. */
const asked = (daysAgo) => ({
  id: "m-ask",
  conversation_id: "cv1",
  direction: "outbound",
  sender: "system",
  channel: "email",
  type: "text",
  body: "Confirm your sign-up",
  media: null,
  status: "sent",
  created_at: new Date(NOW - daysAgo * 86_400_000).toISOString(),
  meta: { source: "signup_confirm" },
});

async function page(row, messages = []) {
  wire.person = {
    row,
    identities: [],
    conversations: messages.length ? [{ id: "cv1", state: "open", contact: { id: ID }, messages }] : [],
    calls: [],
    escalations: [],
    decisions: [],
    receptionist_mode: null,
    workspace_reply_mode: "auto",
  };
  wire.calls.length = 0;
  toasts.length = 0;
  unmount();
  recFolds.reset();
  clearReadCaches();
  fresh();
  const draw = () => W.React.createElement(ClientProfile, { id: ID });
  let tree = draw();
  const row_ = () => all(tree, (n) => n.props?.["data-testid"] === "rec-row-person-email-offers")[0] ?? null;
  for (let i = 0; i < 400 && !row_(); i += 1) {
    await settle();
    tree = again(draw);
  }
  return { tree: () => tree, row: row_, redraw: () => (tree = again(draw)) };
}
const askButton = (root) =>
  all(root, (n) => n.type === "button").find((b) => /^(Ask to confirm|Ask again)$/.test(textOf(b).trim())) ?? null;

test("someone the website brought, not asked yet: Ask to confirm, one press, one request, and the page says the answer", async () => {
  W.__ME = { role: "operator", id: "u-me" };
  const p = await page(ROW());
  assert.ok(p.row(), "the email offers row is drawn");
  const b = askButton(p.row());
  assert.equal(textOf(b).trim(), "Ask to confirm");
  b.props.onClick({ preventDefault() {}, stopPropagation() {} });
  for (let i = 0; i < 12; i += 1) await settle();
  assert.deepEqual(
    wire.calls.filter((c) => c.method === "POST").map((c) => c.path),
    [`/api/v1/contacts/${ID}/signup-confirm`],
  );
  assert.ok(
    toasts.some((t) => textOf(t.msg) === "We emailed them to confirm."),
    `the page says the answer: ${toasts.map((t) => textOf(t.msg))}`,
  );
});

test("an ask that ended offers Ask again; an open one, someone the website did not bring, and a viewer are offered nothing", async () => {
  W.__ME = { role: "operator", id: "u-me" };
  const ended = await page(ROW(), [asked(9)]);
  assert.equal(textOf(askButton(ended.row())).trim(), "Ask again");
  assert.match(textOf(ended.row()), /Did not confirm/);
  const open = await page(ROW(), [asked(1)]);
  assert.equal(askButton(open.row()), null);
  assert.match(textOf(open.row()), /Asked to confirm/);
  const elsewhere = await page(ROW({ came_from: "whatsapp" }));
  assert.equal(askButton(elsewhere.row()), null);
  W.__ME = { role: "viewer", id: "u-me" };
  installRoleStore(W);
  const viewer = await page(ROW());
  assert.equal(askButton(viewer.row()), null, "a viewer records no answer and asks for none");
  W.__ME = { role: "operator", id: "u-me" };
  installRoleStore(W);
});
