/**
 * Refusals on the page.
 *
 * The client now names every refusal (refusals-in-our-words). This is where
 * the pages say it: one field error under the box it belongs to, where six
 * forms coloured their own hint red inline; a failure in the danger tone,
 * where Today's snooze, resolve, approve and stop wore the green check (A13)
 * and a saved business record arrived as a red toast (S16); a refused list
 * delete that says why instead of closing with no word (B5); and a failed
 * Ask turn that can be asked again (N20). Mounted without a browser, over the
 * contracts' own refusal.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { refusalOf, stateOf, toTodayVM } from "@chanlytics/contracts";

let cells = [];
let seq = 0;
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = type(props);
    return node;
  },
  useState: (init) => { const k = seq++; if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init; return [cells[k], (v) => { cells[k] = typeof v === "function" ? v(cells[k]) : v; }]; },
  useReducer: (red, init) => { const k = seq++; if (!(k in cells)) cells[k] = init; return [cells[k], (a) => { cells[k] = red(cells[k], a); }]; },
  useRef: (init) => { const k = seq++; if (!(k in cells)) cells[k] = { current: init }; return cells[k]; },
  useMemo: (fn) => { const k = seq++; if (!(k in cells)) cells[k] = fn(); return cells[k]; },
  useEffect: (fn) => { const k = seq++; if (!(k in cells)) { cells[k] = true; fn(); } },
  useCallback: (fn) => fn,
};
globalThis.ReactDOM = { createPortal: (node) => node };
globalThis.document = { body: {}, addEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }) };
globalThis.window = {
  __chrome: { state: stateOf },
  CHANLY: { nav() {}, R: {}, IX_NOW: "12:04", CONF: { SAFE: 0.8, MED: 0.5 } },
  gate: () => ({}),
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
  canDo: () => true,
  appNavigate() {},
};
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
await import("../../../apps/dashboard/src/legacy/components/message-preview.jsx");
for (const k of ["StatePill", "Confirm", "EmptyState", "FailedRead", "FieldError", "PolicyChip"]) globalThis[k] = globalThis.window[k];
globalThis.StatStrip = globalThis.window.StatStrip || (({ children }) => children);
globalThis.StatCell = globalThis.window.StatCell || ((p) => p.value);
globalThis.useHotkey = () => {};

/** The words of a tree in reading order. */
const say = (n) => {
  if (n == null || n === false || n === true) return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(say).join("");
  if (n.rendered !== undefined) return say(n.rendered);
  return (n.props?.children ?? []).map(say).join("");
};
const walk = (n, fn) => { if (n == null || typeof n !== "object") return; fn(n); for (const k of n.props?.children ?? []) walk(k, fn); if (n.rendered) walk(n.rendered, fn); };
const byTestId = (tree, id) => { let hit = null; walk(tree, (n) => { if (!hit && n.props?.["data-testid"] === id) hit = n; }); return hit; };
const buttonSaying = (tree, words) => { let hit = null; walk(tree, (n) => { if (!hit && n.type === "button" && say(n).trim() === words) hit = n; }); return hit; };
const inlineDanger = (tree) => { let n = 0; walk(tree, (x) => { const s = x.props?.style; if (s && Object.values(s).some((v) => String(v).includes("var(--danger)"))) n += 1; }); return n; };
const refused = (message, code = "conflict", status = 409, details) => ({ ok: false, ...refusalOf({ code, status, message, details, write: true }) });
const settle = () => new Promise((r) => setTimeout(r, 0));

/* ------------------------------ the shared layer ------------------------------ */

test("FieldError: one sentence under the box it belongs to, announced, with the id the box points at -- and nothing without a sentence", () => {
  const FieldError = globalThis.window.FieldError;
  assert.equal(typeof FieldError, "function", "one component for a field's error");
  const node = FieldError({ id: "list-name-error", message: "A list by that name already exists.", testid: "list-name-error" });
  assert.equal(node.props.className, "field-error");
  assert.equal(node.props.role, "alert");
  assert.equal(node.props.id, "list-name-error");
  assert.equal(node.props["data-testid"], "list-name-error");
  assert.ok(say(node).includes("A list by that name already exists."), say(node));
  assert.equal(FieldError({ message: null }), null);
  assert.equal(FieldError({ message: "" }), null);
});

test("a refusal as a toast: the danger tone, the page's words for what did not happen, then why", () => {
  const toast = globalThis.window.refusalToast;
  assert.equal(typeof toast, "function", "one shape for a refusal's toast");
  const owner = refused("Only an owner can do this.", "forbidden", 403, { needs: "owner" });
  const said = toast(owner, "Not stopped");
  assert.equal(said.tone, "danger");
  assert.equal(say(said.msg), "Not stopped — Only an owner can do this.");
  assert.equal(say(toast(owner).msg), "Owner only — Only an owner can do this.", "no words of the page's own: the refusal's title");
  assert.equal(toast({ ok: false, message: "It could not be sent." }, "Not sent").tone, "danger", "a courier's plain { ok, message } reads the same way");
  assert.equal(say(toast({ ok: false, message: "It could not be sent." }).msg), "It could not be sent.", "and with neither a title nor the page's words, the sentence alone");
});

/* ------------------------------- forms ------------------------------- */

await import("../../../apps/dashboard/src/legacy/pages/templates-real.jsx");

test("REGRESSION: a template the route refuses says why under the form as a field error -- it was inline red text", async () => {
  Object.assign(globalThis.window, { __ME: { role: "owner" }, __starters: undefined, __templates: { create: async () => refused("A template called spring_offer already exists in English.") } });
  cells = [];
  const render = () => { seq = 0; return globalThis.window.TemplateComposer({ onDone() {}, onCancel() {}, businessName: "Melany's Beauty Salon" }); };
  byTestId(render(), "tpl-name").props.onChange({ target: { value: "spring_offer" } });
  byTestId(render(), "tpl-body").props.onChange({ target: { value: "Twenty percent off this week." } });
  await byTestId(render(), "tpl-submit").props.onClick();
  const tree = render();
  const err = byTestId(tree, "tpl-error");
  assert.ok(err, "the refusal is on the form");
  assert.equal(err.props.className, "field-error");
  assert.equal(err.props.role, "alert", "announced as it appears");
  assert.ok(say(err).includes("already exists"), say(err));
  assert.equal(inlineDanger(tree), 0, "REGRESSION: style={{ color: 'var(--danger)' }}");
});

await import("../../../apps/dashboard/src/legacy/pages/business-record.jsx");

const bizApi = (over = {}) => ({
  read: async () => ({ ok: true, record: { legal_name: "Melany's Beauty Salon LLC", ein: "12-3456789" }, path: "standard", problems: {}, message: "" }),
  save: async () => ({ ok: true, message: "Saved. The carriers see this when you file.", problems: {} }),
  register: async () => ({ ok: true, pending: true, message: "Filed." }),
  problems: () => ({}),
  fieldsFor: () => [
    { name: "legal_name", label: "Legal name", group: "business", required: true },
    { name: "ein", label: "Tax ID", group: "business", required: true, hint: "Nine digits" },
  ],
  groupsFor: () => ({ business: { title: "The business", sub: "" }, address: { title: "", sub: "" }, contact: { title: "", sub: "" } }),
  paths: ["standard", "sole_proprietor"],
  question: { title: "", sub: "", nudge: "" },
  pathWords: { standard: { filed: "A business with a tax ID", sub: "", choice: "" }, sole_proprietor: { filed: "", sub: "", choice: "" } },
  costWords: { standard: "", sole_proprietor: "" },
  limits: () => [],
  pathOf: () => "standard",
  forPath: (r) => r,
  empty: () => ({}),
  line: () => "",
  optionWords: (o) => o,
  ...over,
});
const mountBiz = async (api) => {
  const flashes = [];
  Object.assign(globalThis.window, { __businessRecord: api, __ME: { role: "owner", email: "owner@example.com" } });
  cells = [];
  const render = () => { seq = 0; return globalThis.window.BusinessRecordForm({ line: null, flash: (p) => flashes.push(p) }); };
  render();
  await settle();
  return { flashes, render };
};

test("REGRESSION (S16): a saved business record says so in the ok tone -- it arrived as a danger toast", async () => {
  const m = await mountBiz(bizApi());
  await byTestId(m.render(), "biz-save").props.onClick();
  const last = m.flashes.at(-1);
  assert.equal(last.tone ?? "ok", "ok", "REGRESSION: 'Saved.' wore the danger tone");
  assert.equal(say(last.msg), "Saved. The carriers see this when you file.");
});

test("a save the route refuses marks each field it names under its box, and the toast says it was not saved", async () => {
  const why = "A tax ID is nine digits, like 12-3456789.";
  const m = await mountBiz(bizApi({ save: async () => ({ ok: false, message: why, problems: { ein: why } }) }));
  await byTestId(m.render(), "biz-save").props.onClick();
  const tree = m.render();
  const last = m.flashes.at(-1);
  assert.equal(last.tone, "danger");
  assert.equal(say(last.msg), `Not saved — ${why}`);
  const field = byTestId(tree, "biz-ein-problem");
  assert.ok(field, "the refusal marks the box it belongs to");
  assert.equal(field.props.role, "alert");
  assert.ok(say(field).includes("nine digits"));
  assert.equal(inlineDanger(tree), 0);
});

test("problems found before saving: nothing is sent, each box says what it needs, and the toast counts them in the warn tone", async () => {
  let sent = 0;
  const m = await mountBiz(bizApi({
    problems: () => ({ legal_name: "Legal name is needed.", ein: "A tax ID is nine digits, like 12-3456789." }),
    save: async () => { sent += 1; return { ok: true, message: "Saved." }; },
  }));
  await byTestId(m.render(), "biz-save").props.onClick();
  const tree = m.render();
  assert.equal(sent, 0, "nothing sent");
  assert.equal(m.flashes.at(-1).tone, "warn");
  assert.equal(say(m.flashes.at(-1).msg), "Not saved — 2 fields need a look.");
  assert.ok(byTestId(tree, "biz-legal_name-problem") && byTestId(tree, "biz-ein-problem"), "both boxes say it");
});

/* ------------------------- Today: a refusal wears its tone ------------------------- */

await import("../../../apps/dashboard/src/legacy/pages/dashboard-a-command.jsx");

const NOW = new Date("2026-09-06T14:00:00Z");
const metrics = (oldest) => ({
  workspace: { name: "Melany's Beauty Salon", timezone: "America/New_York", status: "active" },
  channels: [{ kind: "whatsapp", status: "active", number: "+1 305" }],
  window: { days: 1, since: "2026-09-06T04:00:00Z", since_local: "2026-09-06T00:00:00", now_local: "2026-09-06T10:00:00" },
  now: { escalations_open: 1, oldest_open_escalation_at: oldest, threads_needing_human: 1, threads_snoozed: 0, threads_awaiting_reply: 0, last_inbound_at: "2026-09-06T13:00:00Z", last_outbound_at: "2026-09-06T13:01:00Z" },
  period: { messages_in: 5, messages_out_ai: 4, messages_out_you: 0, conversations_active: 3, answered_by_ai: 4, answered_by_you: 0, unanswered_in_window: 1, median_reply_seconds_ai: 40, send_failures: 0, escalations_new: 1, escalation_reasons: {}, calls: 0, call_seconds: 0, call_sentiments: {}, calls_voicemail: 0, new_contacts: 0 },
});
const conversation = (id, name) => ({
  id, state: "needs_human", paused_until: null, last_wa_inbound_at: null, last_message_at: "2026-09-06T12:00:00Z",
  contact: { id: `c-${id}`, display_name: name, wa_profile_name: null, phone_e164: "+17865550181", consent: "opted_in", dnc: false },
  messages: [{ id: `m-${id}`, conversation_id: id, direction: "inbound", sender: "customer", type: "text", body: "Can I move Saturday?", media: null, meta: null, status: "received", created_at: "2026-09-06T12:00:00Z" }],
});

test("REGRESSION (A13): a refused snooze or approve on Today toasts in the danger tone, saying what did not happen -- they wore the green check", async () => {
  const flashes = [];
  const rows = [];
  Object.assign(globalThis.window, {
    usePPToast: () => [null, (p) => flashes.push(p)],
    AttnRow: (p) => { rows.push(p); return null; },
    __inboxVerb: async () => refused("Too many conversation changes in a short time — try again in 20 seconds.", "rate_limited", 429, { retry_after_s: 20 }),
    __BROADCASTS: { rows: [{ id: "b1", state: "pending_approval", recipient_count: 3, audience: { label: "Win-back" }, playbook_id: "p1", scheduled_for: null }] },
    __broadcasts: { approve: async () => refused("That run was already approved."), cancel: async () => refused("That run has already sent.") },
  });
  globalThis.window.TODAY_DATA = toTodayVM(metrics("2026-09-06T12:00:00Z"), [conversation("cv1", "Zoe Martin")], [{ id: "e1", reason: "human_token", details: null, state: "open", created_at: "2026-09-06T12:00:00Z", conversation_id: "cv1" }], [], NOW);
  cells = []; seq = 0;
  globalThis.window.AgentCommand();
  const handoff = rows.find((p) => p.also && p.also.testid === "queue-snooze");
  assert.ok(handoff, "a handoff row offers Snooze");
  await handoff.also.onClick();
  assert.equal(flashes.at(-1).tone, "danger", "REGRESSION: the refusal wore the green check");
  assert.equal(say(flashes.at(-1).msg), "Not snoozed — Too many conversation changes in a short time — try again in 20 seconds.");
  const run = rows.find((p) => p.testid === "brief-run-row");
  assert.ok(run, "the run waiting for approval");
  await run.cta.onClick();
  assert.equal(flashes.at(-1).tone, "danger");
  assert.equal(say(flashes.at(-1).msg), "Not approved — That run was already approved.");
});

/* ------------------------------ People and Lists ------------------------------ */

await import("../../../apps/dashboard/src/legacy/pages/clients-a.jsx");
await import("../../../apps/dashboard/src/legacy/pages/client-profile.jsx");

test("REGRESSION (B5): a refused list delete keeps the question open and says why -- it closed with no word", async () => {
  const DeleteListButton = globalThis.window.DeleteListButton;
  assert.equal(typeof DeleteListButton, "function", "the delete can be drawn on its own");
  let deleted = 0;
  globalThis.window.__lists = { remove: async () => refused("Only an owner or operator can change lists.", "forbidden", 403, { needs: "operator" }) };
  cells = [];
  const render = () => { seq = 0; return DeleteListButton({ list: { id: "l1", name: "VIP regulars" }, onDeleted: () => { deleted += 1; } }); };
  byTestId(render(), "delete-list").props.onClick();
  await byTestId(render(), "delete-list-yes").props.onClick();
  const tree = render();
  assert.equal(deleted, 0);
  const question = byTestId(tree, "delete-list-confirm");
  assert.ok(question, "REGRESSION: the question closed on a refusal, with no word");
  assert.ok(say(question).includes("Only an owner or operator can change lists."), say(question));
});

test("REGRESSION: the forms that coloured their own error red -- a new list, adding a person, recording consent -- say it as a field error the box points at", async () => {
  const taken = () => refused("A list called VIP regulars already exists.");

  // People: New list in the rail.
  const NewListRow = globalThis.window.NewListRow;
  assert.equal(typeof NewListRow, "function");
  cells = [];
  const row = () => { seq = 0; return NewListRow({ onCreate: async () => taken() }); };
  byTestId(row(), "new-list").props.onClick();
  byTestId(row(), "new-list-name").props.onChange({ target: { value: "VIP regulars" } });
  await byTestId(row(), "new-list-add").props.onClick();
  let tree = row();
  assert.equal(byTestId(tree, "new-list-error")?.props.role, "alert");
  assert.equal(byTestId(tree, "new-list-name").props["aria-describedby"], "new-list-error");
  assert.equal(inlineDanger(tree), 0);

  // People: Add a person.
  const AddPersonButton = globalThis.window.AddPersonButton;
  assert.equal(typeof AddPersonButton, "function");
  globalThis.window.__addPerson = async () => refused("contact_phone: Write it with the country code, like +1 646 555 0123.", "validation", 400, { fields: { phone: "Write it with the country code, like +1 646 555 0123." } });
  cells = [];
  const add = () => { seq = 0; return AddPersonButton({ onAdded() {}, flash() {} }); };
  byTestId(add(), "add-person").props.onClick();
  byTestId(add(), "add-person-phone").props.onChange({ target: { value: "646 555" } });
  await byTestId(add(), "add-person-save").props.onClick();
  tree = add();
  const personError = byTestId(tree, "add-person-error");
  assert.equal(personError?.props.role, "alert");
  assert.ok(say(personError).includes("country code"), "the field's own sentence where the route named the field");
  assert.equal(byTestId(tree, "add-person-phone").props["aria-describedby"], "add-person-error");
  assert.equal(inlineDanger(tree), 0);

  // The profile: a consent the route would not record.
  const ConsentAsk = globalThis.window.ConsentAsk;
  cells = [];
  const ask = () => { seq = 0; return ConsentAsk({ label: "Messages", value: "opted_in", sources: [], canRecord: true, hint: "", onRecord: async () => refused("Consent cannot be changed for a person who asked to stop."), testid: "consent-messages" }); };
  await buttonSaying(ask(), "Not asked").props.onClick();
  tree = ask();
  assert.equal(byTestId(tree, "consent-messages-error")?.props.role, "alert");
  assert.equal(inlineDanger(tree), 0);
});

/* ---------------------------------- Ask ---------------------------------- */

await import("../../../apps/dashboard/src/legacy/pages/ask-turn.jsx");

test("REGRESSION (N20): a failed Ask turn offers Try again on the latest answer, and only there -- it offered nothing", () => {
  const AskTurn = globalThis.window.AskTurn;
  const t = { tryAgain: "Try again", from: "From", next: "Next", unverified: "Not checked" };
  const failed = { id: "e-1", role: "assistant", text: "Too many questions in a short time — try again in 30 seconds.", failed: true, citations: [], followups: [], proposals: [] };
  const props = { t, lang: "en", onFollow() {}, onNav() {}, speech: { canSpeak: false }, flash() {} };
  globalThis.window.__ask = undefined;
  let retried = 0;
  cells = []; seq = 0;
  const latest = AskTurn({ ...props, m: failed, latest: true, onRetry: () => { retried += 1; } });
  const again = byTestId(latest, "ask-retry");
  assert.ok(again, "REGRESSION: a failed turn had no way to ask again");
  assert.equal(say(again).trim(), "Try again");
  again.props.onClick();
  assert.equal(retried, 1);
  cells = []; seq = 0;
  assert.equal(byTestId(AskTurn({ ...props, m: failed, latest: false, onRetry() {} }), "ask-retry"), null, "an older failure is history, not a button");
  cells = []; seq = 0;
  assert.equal(byTestId(AskTurn({ ...props, m: { ...failed, failed: false }, latest: true, onRetry() {} }), "ask-retry"), null, "an answer that landed needs none");
});

test("REGRESSION: a refused question says why -- a gateway's page read 'Ask failed (502).'", async () => {
  const { createApi } = await import("../../../apps/dashboard/src/client/api.ts");
  const { askApi } = await import("../../../apps/dashboard/src/legacy-bridge/ask/api.ts");
  const said = async (answer) => {
    const client = createApi({ fetch: async () => (typeof answer === "function" ? answer() : answer), workspace: () => "w1", onSignedOut() {}, refresh: async () => {} });
    const events = [];
    await askApi(client).send({ text: "Who booked this week?", threadId: null, scope: null, surface: "today" }, (ev) => events.push(ev));
    return events;
  };
  assert.deepEqual(await said(new Response("<html>", { status: 502 })), [{ t: "error", text: "Chanlytics didn't answer — ask again in a moment." }], "REGRESSION: 'Ask failed (502).'");
  const limited = new Response(JSON.stringify({ ok: false, error: { code: "rate_limited", message: "Too many questions in a short time — try again in 30 seconds.", details: { retry_after_s: 30 } } }), { status: 429 });
  assert.deepEqual(await said(limited), [{ t: "error", text: "Too many questions in a short time — try again in 30 seconds." }], "the server's sentence, when it sent one");
  const slow = () => { const e = new Error("The operation was aborted due to timeout"); e.name = "TimeoutError"; throw e; };
  assert.deepEqual(await said(slow), [{ t: "error", text: "Chanlytics took too long to answer — ask again in a moment." }], "a timeout is not 'nothing was asked'");
  assert.deepEqual(await said(() => { throw new TypeError("fetch failed"); }), [{ t: "error", text: "Network error — nothing was asked." }]);
});
