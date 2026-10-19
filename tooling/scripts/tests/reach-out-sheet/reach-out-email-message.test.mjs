/**
 * A reach-out's email as a message on the Templates page (One message, every channel, step 5), run on the stub React over
 * the page's own words (surfaces/campaigns/reach-out/email-message.tsx, templates/version-view.tsx and its editor,
 * contracts message-versions.ts and reach-out-words.ts) and its verbs stubbed on the one `templates` object the page
 * imports.
 *
 * - It opens on the same version view a campaign message's email does: its subject and its words with examples in the six
 *   slots (made up for a business, the workspace's own for the rest), and one line for what the sender adds; it has no
 *   Remove (its step is dropped in the reach-out), no Rename or Hide, and no WhatsApp or Text.
 * - It is written there, with the same editor: each slot a chip by its name, the six in the menu with their examples,
 *   the preview beside the words following each keystroke, the one check as it is typed (the reach-out's rules, in its
 *   sentences), and a first step's subject only. Save calls the version verb with the email's name, which says its step,
 *   and says what the save did; a refusal is said where the words were typed.
 * - It is a message in the list (moved here from the reach-out rows' tests): on the Email channel with what sends it, counted
 *   by the page and said so in its hover; how many it wrote is read when it opens, never before; an email-only workspace is
 *   not "nothing on file", and a reach-outs read that failed is said, with its Retry; Edit the reach-out opens its
 *   sequence's record, where a sequence to leads is written, or the chain's own address for a role that may not change it.
 * - The preview and the edge's send fill the six the same way: one fill.
 * - A role that may not approve is offered nothing to change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, find, byTestId, textOf, press, settle } from "../_legacy-react.mjs";
import { importSrc } from "../_source.mjs";

installLegacyReact({ __DEMO_MODE: false, __chrome: { state: contracts.stateOf } });
const W = globalThis;
const toasts = [];
const went = [];
Object.assign(W, {
  CHANLY: { nav: (to) => went.push(to), R: {} },
  appNavigate: (to) => went.push(to),
  // The role store's gate is data-bits.jsx's own (window.gate, canDo, gateTitle), over this role and contracts' table.
  ST_STORE: { can: (a) => !!contracts.ROLE_PERMS.owner[a], myRole: () => "owner" },
  __roleGate: contracts.roleGate,
  __surfaceState: () => "live",
  useHotkey: () => {},
});
const L = "../../../../apps/dashboard/src/legacy";
await import(`${L}/components/data-bits.jsx`);
W.usePPToast = () => [null, (t) => toasts.push(t)];
const S = "../../../../apps/dashboard/src/surfaces";
const { TemplatesPage } = await import(`${S}/campaigns/templates/templates-page.tsx`);
const { templates: verbs } = await import(`${S}/campaigns/templates/verbs.ts`);
const { reachOuts } = await import(`${S}/campaigns/reach-out/surface.ts`);
const { setSurfaceValue } = await import(`${S}/surface-values.ts`);
const { Menu } = await import(`${S}/kit/menu/menu.tsx`);
const { standingSaid } = await import(`${S}/kit/head/standing.ts`);
const { FieldError } = await import(`${S}/kit/field-error/field-error.tsx`);
const { SlotBox } = await import(`${S}/campaigns/templates/slots/slot-box.tsx`);
const { SlotName } = await import(`${S}/campaigns/parts/slot.tsx`);

const { REACH_OUT_SLOT_SET, reachOutRowName, reachOutRules, reachOutEditedWords, wordsIssueWords, renderOwnVersion } =
  contracts;
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { reachOutRequest } = await import(pathToFileURL(path.join(ROOT_DIR, "apps/edge/lib/reach-out/request.ts")).href);

const BIZ = "Harbor Moving Co";
const LINK = "https://example.com/book";
const ROOT = "0f1e2d3c-4b5a-4968-8776-655443322110";
const NUDGE = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const FIRST = reachOutRowName(ROOT);
const LATER = reachOutRowName(NUDGE);

const chain = () => ({
  root_id: ROOT,
  name: "Reach out · Personal trainers",
  search: { id: "s1", name: "Personal trainers · Austin" },
  state: "running",
  include_unconfirmed: false,
  gap_minutes: 12,
  mailbox_ids: [],
  signed_by: "Sam",
  created_at: "2026-09-20T00:00:00Z",
  mailboxes: [],
  steps: [
    {
      id: ROOT,
      n: 0,
      after_days: null,
      subject: "Quick one for {{business}}",
      body: "{{opening}}\n\nI run {{your business}}.\n\n{{your name}}",
      template_id: "t1",
      hand: null,
      state: "running",
    },
    {
      id: NUDGE,
      n: 1,
      after_days: 4,
      subject: null,
      body: "Just checking in, {{business}}. {{booking link}}",
      template_id: "t2",
      hand: null,
      state: "running",
    },
  ],
  next: { run_hour: 9, last_run_for: null, mode: "ask", may_spend: true, waiting_run_id: null },
});

const draw = () => W.React.createElement(TemplatesPage, {});
/** The ids a chain's report was asked for: it is read as a row opens (R23), never before. */
const reported = [];
/**
 * Templates over a workspace: its chains (as the reach_outs surface holds them: a key given as undefined is a read not
 * landed, null one that failed), the WhatsApp rows and numbers it has (none: a workspace that has only reach-outs), its
 * business's words, who is acting, and what a chain's report answers (a read that failed, unless the test says).
 */
const page = (opts = {}) => {
  const { role = "owner", brain = { business_name: BIZ, booking_link: LINK }, rows = [], channels = [] } = opts;
  const { report = { ok: false, message: "down" } } = opts;
  const chains = "chains" in opts ? opts.chains : [chain()];
  W.ST_STORE.can = (a) => !!contracts.ROLE_PERMS[role][a];
  W.ST_STORE.myRole = () => role;
  setSurfaceValue("settings", {
    settings: { config: { brain } },
    facts: null,
    channels,
    templatesAll: rows,
    templateVersions: [],
    messages: contracts.campaignMessagesOf(rows),
    templateUse: null,
    templateSent: null,
  });
  setSurfaceValue("reach_outs", chains);
  setSurfaceValue("playbooks", undefined);
  Object.assign(reachOuts, { report: async (id) => (reported.push(id), report), reach: async () => null });
  fresh();
  toasts.length = 0;
  went.length = 0;
  reported.length = 0;
  return again(draw);
};
const redraw = () => again(draw);
const rowsOf = (tree) => all(tree, (n) => n.props?.["data-testid"] === "reach-out-email");
/** The email of the chain's step n, opened beside the list as a press on its row opens it. */
const opened = (tree, n = 0) => {
  press(byTestId(rowsOf(tree)[n], "template-open"));
  return redraw();
};
const paneOf = (tree) => byTestId(tree, "reach-out-email-pane");
const subjectOf = (tree) => textOf(byTestId(tree, "template-version-subject"));
const bodyOf = (tree) => textOf(byTestId(tree, "template-version-body"));
const menuOf = (tree) => find(paneOf(tree), (n) => n.type === Menu);
const boxOf = (tree, label) => find(paneOf(tree), (n) => n.type === SlotBox && n.props.label === label);
const chipsOf = (box) =>
  (box ? [...new Set(all(box, (n) => n.type === SlotName))] : []).map((c) => [c.props.label, c.props.slot]);
const problemOf = (tree) => find(paneOf(tree), (n) => n.type === FieldError)?.props.message ?? null;
const saveOf = (tree) => byTestId(tree, "template-version-save");
/** The first email's Edit chosen on its menu: the editor takes the preview's place. */
const writing = (n = 0) => {
  const tree = opened(page(), n);
  menuOf(tree)
    .props.groups.flatMap((g) => g.items)
    .find((i) => i.label === "Edit")
    .onSelect();
  return redraw();
};

/** The verbs, stubbed: each call recorded, each answer the test's. */
const REAL = { ...verbs };
const stubbed = (over = {}) => {
  const calls = [];
  Object.assign(verbs, REAL, {
    saveVersion: async (body) => (calls.push(body), { ok: true, data: { template: {}, warnings: [], rechecked: 2 } }),
    ...over,
  });
  return calls;
};

/** What the six hold in the preview: made up for a business, this workspace's own for the rest. */
const examples = () => contracts.reachOutExampleValues({ businessName: BIZ, yourName: "Sam", bookingLink: LINK });
const at = (slot) => examples()[REACH_OUT_SLOT_SET.keys.indexOf(slot)];

/* ---------------------------------- opens as a message ---------------------------------- */

test("a reach-out's email opens on the version view a message's email opens on: its words with examples in the six slots, and what the sender adds", () => {
  const tree = opened(page());
  const pane = paneOf(tree);
  assert.ok(byTestId(pane, "template-version"), "the version view, as a campaign message's email is drawn");
  assert.equal(byTestId(pane, "template-version").props["data-channel"], "email");
  const want = chain().steps[0];
  const values = examples();
  assert.equal(subjectOf(pane), contracts.fillSlots(want.subject, values, REACH_OUT_SLOT_SET));
  assert.equal(subjectOf(pane), `Quick one for ${at("business")}`);
  assert.equal(bodyOf(pane), contracts.fillSlots(want.body, values, REACH_OUT_SLOT_SET));
  assert.ok(bodyOf(pane).includes(`I run ${BIZ}.`), "the workspace's own name where its own slot is");
  assert.ok(bodyOf(pane).endsWith("Sam"), "and the name its chain signs with");
  assert.ok(!bodyOf(pane).includes("{{"), "no braces: every slot has its example here");
  assert.equal(
    textOf(byTestId(pane, "template-version-note")),
    reachOutRules(true).foot,
    "the cold email's own foot, said once",
  );
  // What it is not: no Remove (its step is dropped in the reach-out), no switch of channels, no Rename or Hide.
  assert.deepEqual(
    menuOf(tree)
      .props.groups.flatMap((g) => g.items)
      .map((i) => i.label),
    ["Edit"],
  );
  assert.equal(all(pane, (n) => n.props?.role === "radiogroup").length, 0, "no WhatsApp or Text switch");
  assert.equal(byTestId(pane, "template-version-remove"), null);
});

test("a hole in the preview is a slot the workspace has not filled, drawn by its name as the send would hold it", () => {
  const tree = opened(page({ brain: { business_name: BIZ } }), 1);
  // The later step names {{booking link}} and the workspace has none on file: said by name, never as braces.
  const tinted = all(byTestId(tree, "template-version-body"), (n) => n.props?.className === "mp-slot");
  assert.deepEqual(
    tinted.map((n) => textOf(n)),
    ["Lakeside Bakery", "Booking link"],
  );
  assert.equal(bodyOf(tree).includes("{{"), false);
});

test("a later step has no subject: its pane shows its words alone, and its editor one box", () => {
  const tree = opened(page(), 1);
  assert.equal(byTestId(tree, "template-version-subject"), null, "a step after the first answers the one before");
  assert.ok(bodyOf(tree).startsWith("Just checking in, "));
  menuOf(tree)
    .props.groups.flatMap((g) => g.items)
    .find((i) => i.label === "Edit")
    .onSelect();
  const edit = redraw();
  assert.equal(boxOf(edit, "Subject"), null);
  assert.ok(boxOf(edit, "Message"));
  assert.equal(boxOf(edit, "Message").props.value, chain().steps[1].body);
});

/* ---------------------------------- written with the one editor ---------------------------------- */

test("the editor is the one every email is written in: its slots are chips by their names, over the reach-out's six", () => {
  const tree = writing();
  assert.ok(byTestId(tree, "template-version-editor"), "the editor takes the preview's place");
  const subject = boxOf(tree, "Subject");
  const message = boxOf(tree, "Message");
  assert.equal(subject.props.value, chain().steps[0].subject, "the stored words, with their named slots, as they were");
  assert.equal(message.props.value, chain().steps[0].body);
  assert.deepEqual(subject.props.slots, REACH_OUT_SLOT_SET, "the slots are the reach-out's six: named");
  assert.equal(message.props.slots.kind, "named");
  assert.equal(subject.props.maxLength, contracts.REACH_OUT_SUBJECT_MAX, "the reach-out's own subject limit");
  assert.deepEqual(chipsOf(subject), [["Their business", "business"]]);
  assert.deepEqual(chipsOf(message), [
    ["Opening", "opening"],
    ["Your business", "your business"],
    ["Your name", "your name"],
  ]);
  for (const box of [subject, message]) assert.ok(!textOf(box).includes("{{"), "never a brace in what is drawn");
  assert.equal(problemOf(tree), null, "what it starts from passes the reach-out's check");
  assert.equal(saveOf(tree).props.disabled, false);
});

test("a slot goes in by its name: the menu offers the six with their examples, and the one chosen is put in whole at the caret", () => {
  let tree = writing();
  const items = find(
    paneOf(tree),
    (n) => n.type === Menu && n.props.label?.startsWith("Add a value"),
  ).props.groups.flatMap((g) => g.items);
  assert.deepEqual(
    items.map((i) => [i.label, i.meta]),
    REACH_OUT_SLOT_SET.keys.map((key, i) => [REACH_OUT_SLOT_SET.labels[i], examples()[i]]),
  );
  items.find((i) => i.label === "Their city").onSelect();
  tree = redraw();
  assert.ok(boxOf(tree, "Message").props.value.endsWith("{{city}}"), "put in at the end, where no caret was");
  assert.equal(problemOf(tree), null);
});

test("the preview beside the words follows each keystroke, with the same examples", () => {
  let tree = writing();
  boxOf(tree, "Subject").props.onValueChange("Hello {{business}} in {{city}}");
  boxOf(redraw(), "Message").props.onValueChange("{{opening}} Sign: {{ Your Name }}");
  tree = redraw();
  assert.equal(subjectOf(tree), `Hello ${at("business")} in ${at("city")}`);
  assert.equal(bodyOf(tree), `${at("opening")} Sign: Sam`, "a name in any case and spacing is read as the slot it is");
  boxOf(tree, "Message").props.onValueChange("Hi {{nickname}}");
  tree = redraw();
  // A name the six do not have is a hole: drawn by its name, as a problem, never as braces.
  assert.equal(bodyOf(tree), "Hi nickname");
  const hole = all(byTestId(tree, "template-version-body"), (n) => n.props?.className === "mp-slot");
  assert.deepEqual(
    hole.map((n) => [textOf(n), n.props["data-unknown"]]),
    [["nickname", "true"]],
  );
});

test("the one check, in the reach-out's rules and sentences: what is wrong is the kit's FieldError and Save waits", () => {
  let tree = writing();
  const typed = (label, words) => {
    boxOf(tree, label).props.onValueChange(words);
    tree = redraw();
  };
  const said = (problem, field = "body", slot) => wordsIssueWords({ field, problem, ...(slot ? { slot } : {}) });
  typed("Subject", "");
  assert.equal(problemOf(tree), "Give your email a subject.");
  assert.equal(saveOf(tree).props.disabled, true, "held until it passes");
  typed("Subject", "Re: your studio");
  assert.equal(problemOf(tree), said("subject_poses_as_reply", "subject"));
  typed("Subject", "x".repeat(contracts.REACH_OUT_SUBJECT_MAX + 1));
  assert.equal(problemOf(tree), said("subject_too_long", "subject"));
  typed("Subject", "Fine");
  typed("Message", "Hi {{nickname}}");
  assert.equal(problemOf(tree), said("unknown_slot", "body", "nickname"));
  typed("Message", "SEE THIS NOW\n{{opening}}");
  assert.equal(problemOf(tree), said("shouting"));
  typed("Message", "See https://a.example and https://b.example");
  assert.equal(problemOf(tree), said("too_many_links"));
  typed("Message", "word ".repeat(121));
  assert.equal(problemOf(tree), said("too_many_words"));
  assert.equal(saveOf(tree).props.disabled, true);
  // A campaign message's two-slot numbered rules are not asked of it: {{1}} is no slot of a reach-out's.
  typed("Message", "Hi {{1}}");
  assert.equal(problemOf(tree), said("unknown_slot", "body", "1"));
  typed("Message", "{{opening}}\n\nBest, {{your name}}");
  assert.equal(problemOf(tree), null);
  assert.equal(saveOf(tree).props.disabled, false);
});

/* ---------------------------------- saved in place ---------------------------------- */

test("Save calls the version verb with the email's name, which says its step, and says what the save did", async () => {
  const calls = stubbed();
  let tree = writing();
  boxOf(tree, "Subject").props.onValueChange("  A  quick one for {{business}} ");
  boxOf(redraw(), "Message").props.onValueChange("{{opening}}\r\n\r\nSam");
  press(saveOf(redraw()));
  await settle();
  assert.deepEqual(calls, [
    {
      name: FIRST,
      language: "en",
      channel: "email",
      subject: "A quick one for {{business}}",
      body: "{{opening}}\n\nSam",
    },
  ]);
  tree = redraw();
  assert.equal(byTestId(tree, "template-version-editor"), null, "the editor closes once it landed");
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].tone, "ok");
  assert.equal(toasts[0].msg, reachOutEditedWords(2), "says that what waited for its step is checked again");
  assert.equal(toasts[0].msg, "Saved. 2 emails waiting to go are checked again against these words.");
});

test("a later step is saved under its own name with no subject", async () => {
  const calls = stubbed();
  let tree = writing(1);
  boxOf(tree, "Message").props.onValueChange("Bumping this. {{booking link}}");
  press(saveOf(redraw()));
  await settle();
  assert.deepEqual(calls, [{ name: LATER, language: "en", channel: "email", body: "Bumping this. {{booking link}}" }]);
});

test("a refusal is said in the server's words, where the words were typed: the editor stays open", async () => {
  const refusal = "Your words name {{booking link}}. Add your booking link in Settings › Hours & booking first.";
  const calls = stubbed({
    saveVersion: async (body) => (calls.push(body), { ok: false, code: "validation", status: 422, message: refusal }),
  });
  let tree = writing();
  press(saveOf(tree));
  await settle();
  tree = redraw();
  assert.equal(calls.length, 1);
  assert.ok(byTestId(tree, "template-version-editor"), "the editor stays, with what was written");
  assert.equal(problemOf(tree), refusal);
  assert.equal(toasts.length, 0, "not a toast: it is said where it was typed");
  assert.equal(saveOf(tree).props.disabled, false, "and it can be tried again");
});

test("a role that may not approve reads the email and is offered nothing to change", () => {
  const tree = opened(page({ role: "viewer" }));
  assert.ok(byTestId(paneOf(tree), "template-version-preview"), "a viewer reads it");
  assert.equal(menuOf(tree), null, "with no Edit");
});

/* ---------------------------------- in the list ---------------------------------- */

const WHATSAPP_ROW = {
  id: "w1",
  channel: "whatsapp",
  name: "offer",
  language: "en_US",
  meta_status: "approved",
  category: "marketing",
  source: "chanlytics",
  hidden_at: null,
  title: null,
  body_preview: "Our offer.",
  variables: [],
};
/** What a chain's report says each step wrote. */
const REPORT = {
  steps: [
    { id: ROOT, n: 0, written: 44, delivered: 42, wrote_back: 5, said_no: 3, bounced: 2, waiting: 0, held: 0 },
    { id: NUDGE, n: 1, written: 28, delivered: 28, wrote_back: 3, said_no: 1, bounced: 0, waiting: 5, held: 2 },
  ],
  runs: [],
  can_remove: false,
};

test("Templates: a chain's emails are messages in the list, on the Email channel with what sends them; the page counts them, and its hover says so", () => {
  const tree = page({ rows: [WHATSAPP_ROW], channels: [{ kind: "whatsapp" }] });
  const rows = rowsOf(tree);
  assert.equal(rows.length, 2);
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "custom-row").length, 1, "the WhatsApp row is unchanged");
  // The page's line is the frame's head's (CmHead says it to the standing): the count, and its hover.
  const line = standingSaid()?.sentence ?? null;
  assert.ok(textOf(line).includes("3 templates"), "the page counts both");
  const tip = find(line, (n) => n.props?.["data-testid"] === "messages-count").props["data-tip"];
  assert.ok(
    tip.endsWith("The count takes 2 emails of your reach-outs too: their own words, sent by email, with no review."),
    tip,
  );
  const nudge = rows[1];
  assert.equal(textOf(byTestId(nudge, "template-channels")), "Email", "the channel a message's row says");
  assert.equal(textOf(byTestId(nudge, "template-users")), "Reach out · Personal trainers");
  assert.ok(textOf(nudge).includes("step 2 · after 4 days with nothing back"));
  // The words as a message's row says them: the slots by their names, never as braces.
  assert.ok(textOf(nudge).includes("Just checking in, {their business}."), textOf(nudge));
  assert.equal(textOf(nudge).includes("{{"), false);
  for (const r of rows) assert.equal(textOf(byTestId(r, "template-sent")), "", "closed, no count");
  assert.deepEqual(reported, [], "the list reads no report (R23)");
  press(byTestId(nudge, "template-users"));
  // What sends it opens: its sequence, on Sequences (where the retired outbound/<id> moved, #1644).
  assert.deepEqual(went, [`campaigns/sequences/${ROOT}`]);
});

test("an email row says how many it wrote once it opens and its chain's report reads, and nothing when it cannot", async () => {
  let tree = page({ report: { ok: true, data: { report: REPORT, reach: null } } });
  press(byTestId(rowsOf(tree)[1], "template-open"));
  redraw();
  await settle();
  tree = redraw();
  assert.deepEqual(reported, [ROOT], "its chain's report, read as it opens");
  assert.equal(textOf(byTestId(rowsOf(tree)[1], "template-sent")), "28 sent", "the report's own count for its step");

  tree = page();
  press(byTestId(rowsOf(tree)[1], "template-open"));
  redraw();
  await settle();
  tree = redraw();
  assert.deepEqual(reported, [ROOT]);
  assert.equal(textOf(byTestId(rowsOf(tree)[1], "template-sent")), "", "not read, not counted: never a 0");
});

test("Templates: an email-only workspace is not 'nothing on file'; unread says nothing; a reach-outs read that failed is said, with its Retry", () => {
  let tree = page();
  assert.equal(rowsOf(tree).length, 2);
  assert.equal(byTestId(tree, "templates-nothing"), null, "its email rows are on file");
  // Read, and nothing of any kind, with no WhatsApp number: the list is never bare, for the starter set is offered (its
  // email and text versions are written without a number), so "Nothing on file yet." has nothing left to say.
  tree = page({ chains: [] });
  assert.equal(byTestId(tree, "templates-nothing"), null, 'the starter set stands where "nothing" was said');
  assert.ok(byTestId(tree, "starters"), "and the set is offered");
  tree = page({ chains: undefined });
  assert.equal(byTestId(tree, "templates-nothing"), null, "the chains not read yet: no claim");
  const refreshed = [];
  W.__refreshSurface = (k) => refreshed.push(k);
  tree = page({ chains: null });
  assert.equal(byTestId(tree, "templates-nothing"), null);
  assert.ok(textOf(byTestId(tree, "templates-email-failed")).includes("Couldn't read your reach-outs' emails"));
  press(byTestId(tree, "templates-email-failed-retry"));
  assert.deepEqual(refreshed, ["reach_outs"]);
});

test("an open email has nothing of a WhatsApp message's to rename, hide or delete, and Edit the reach-out opens its sequence's record", () => {
  const tree = opened(page());
  const body = byTestId(tree, "reach-out-email-body");
  assert.ok(byTestId(body, "template-version"), "its email, as any message's version is drawn");
  assert.ok(textOf(byTestId(body, "reach-out-email-check")).startsWith("Checked before each send"));
  assert.equal(
    all(body, (n) => /Delete|Rename|Hide|Remove/.test(textOf(n)) && n.type === "button").length,
    0,
    "no delete of its own: its step is dropped in the reach-out",
  );
  press(byTestId(body, "reach-out-email-edit"));
  // The composer's sheet over the list went (the lead-to-sequence canvas, 18 Oct 2026): a sequence to leads is written
  // on its record, so its Edit goes there, on a desk and on a phone alike.
  assert.deepEqual(went, [contracts.sequenceRoute(ROOT)]);
});

test("an email's Edit the reach-out, for a role that may not change the chain, opens the chain's own address instead", () => {
  const tree = opened(page({ role: "viewer" }));
  press(byTestId(byTestId(tree, "reach-out-email-body"), "reach-out-email-edit"));
  // Its own address, by the one writer (contracts addressOf), where the retired outbound/<id> moved.
  assert.deepEqual(went, [`campaigns/moment:${ROOT}`]);
});

/* ---------------------------------- one fill ---------------------------------- */

test("the page's preview and the edge's send fill the six the same way: the same subject and the same words", () => {
  const tree = opened(page());
  const want = chain().steps[0];
  // The edge builds the email for a business with exactly the values the preview was made from.
  const sent = reachOutRequest({
    tenantId: "22222222-2222-4222-8222-222222222222",
    messageId: "11111111-1111-4111-8111-111111111111",
    contactId: "33333333-3333-4333-8333-333333333333",
    to: "owner@example.com",
    words: { subject: want.subject, body: want.body },
    lead: { business_name: at("business"), city: at("city") },
    workspace: { businessName: BIZ, yourName: "Sam", bookingLink: LINK, address: "100 Example St, Austin, TX 78701" },
    opening: at("opening"),
    from: { address: "sam@getharbor.example", from_name: "Sam at Harbor", signature: null },
    unsubscribe: { secret: "a-secret-only-this-file-holds", origin: "https://app.chanlytics.com" },
    parent: null,
  });
  assert.equal(sent.ok, true);
  assert.equal(subjectOf(tree), sent.subject);
  assert.equal(bodyOf(tree), sent.body);
  // And both are the one fill: renderOwnVersion over the six.
  assert.deepEqual(
    renderOwnVersion("email", { subject: want.subject, body: want.body }, examples(), "en", REACH_OUT_SLOT_SET),
    { subject: sent.subject, body: sent.body },
  );
});

/* ---------------------------------- what a save re-reads ---------------------------------- */

test("a saved email re-reads what a chain's edit moves: its words, the playbooks' counts, and the settings that hold the rows; no lead, whose row carries nothing of a chain", async () => {
  const { AFTER } = await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts");
  const keys = AFTER["POST templates/versions"]().map((o) => o.key);
  // The reach-outs surface is the pane's own source: a save that left it stale would show the words as they were. The runs its held
  // sends are in read no template (Sent's rows are the broadcasts table's, and the sheet that shows a run's words draws them from the
  // settings read), so Sent is not read again for it.
  for (const key of ["settings", "reach_outs", "playbooks"])
    assert.ok(keys.includes(key), `${key} is read again: ${keys.join(", ")}`);
  assert.equal(keys.includes("broadcasts"), false, `Sent reads no template: ${keys.join(", ")}`);
  // A lead's stage is its own write; the chain's words and its held sends are not on a lead's row (the Leads page reads leads,
  // searches, rounds and members, and the save writes none of them).
  assert.equal(keys.includes("leads"), false, `Leads is not read for a message: ${keys.join(", ")}`);
});
