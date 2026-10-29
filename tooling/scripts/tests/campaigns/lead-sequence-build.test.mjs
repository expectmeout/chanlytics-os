/**
 * A sequence to leads written on its record (the lead-to-sequence canvas's Build boards, 18 Oct 2026: the draft is the
 * record, campaigns/sequences/leads/), run on the stub React over the real hook and parts with the wire answered here:
 *
 * - The chain (use-chain.ts): a change is saved through the record's own door (PUT sequences/:id/chain), the chain's body
 *   less its list and under the record's name; new steps take the ids the save gave them; the auto-add switch saves at
 *   once; a refused save says the door's words and stands failed.
 * - A step's sheet (step-sheet.tsx): the first step has no Take out and a later one says how long it waits; Take out
 *   closes the sheet and says so with Undo, which puts the step back where it stood, as new.
 * - Preview as a real lead (preview.tsx): nobody in it yet reads as the example business, said so, with the foot the send
 *   writes under it (why they hear from you, the business and its address), and none while the address is not set.
 * - Send me a test: what is typed is saved first, then the step goes to your own inbox as the lead previewed gets it.
 *
 * The composer's sheet these replace (reach-out/sheet.tsx) and its tests went with it.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, find, byTestId, textOf, press, settle, unmount } from "../_legacy-react.mjs";

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
const L = "../../../../apps/dashboard/src/legacy";
(await import(`${L}/../surfaces/frame/frame-globals.ts`)).installFrameGlobals();
const S = "../../../../apps/dashboard/src/surfaces";
const { setSurfaceValue } = await import(`${S}/surface-values.ts`);
const { sequenceVerbs } = await import(`${S}/campaigns/sequences/verbs.ts`);
const { Sheet } = await import(`${S}/kit/sheet/sheet.tsx`);
const { EmailAs } = await import(`${S}/campaigns/sequences/place/email-as.tsx`);
const { useLeadChain } = await import(`${S}/campaigns/sequences/leads/use-chain.ts`);
const { LeadStepSheet } = await import(`${S}/campaigns/sequences/leads/step-sheet.tsx`);
const { LeadPreview } = await import(`${S}/campaigns/sequences/leads/preview.tsx`);
const { LeadRunsSheet } = await import(`${S}/campaigns/sequences/leads/runs-sheet.tsx`);

const SEQ = "seq-1";
const chainOf = (over = {}) => ({
  root_id: SEQ,
  name: "Gift shops · fall",
  search: { id: "list-1", name: "Gift shops · fall" },
  state: "paused",
  include_unconfirmed: false,
  gap_minutes: 12,
  mailbox_ids: [],
  owner_sends: true,
  signed_by: "Sam",
  created_at: "2026-10-18T00:00:00Z",
  mailboxes: [],
  steps: [
    {
      id: "st-1",
      n: 0,
      after_days: null,
      subject: "A quick one for {{business}}",
      body: "{{opening}}\n\n{{your name}}",
      template_id: "t1",
      state: "paused",
    },
    { id: "st-2", n: 1, after_days: 4, subject: null, body: "Just checking in.", template_id: "t2", state: "paused" },
  ],
  next: { run_hour: 9, last_run_for: null, mode: "ask", may_spend: true, waiting_run_id: null },
  ...over,
});
/** The record as GET sequences/:id answers a sequence to leads: its row and its chain. */
const recOf = (chain = chainOf()) => ({
  sequence: { id: SEQ, name: "Gift shops · fall (renamed)", in_it: 0, needs: { held: 0 } },
  chain,
});

/** The wire: each request recorded, answered by the route it names. */
let wire = [];
let answer = () => ({ ok: true, data: {} });
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
W.fetch = async (url, init = {}) => {
  const path = new URL(String(url), "https://app.example").pathname.replace(/^.*\/api\/v1\//, "");
  const call = [init.method || "GET", path, init.body ? JSON.parse(init.body) : null];
  wire.push(call);
  const r = answer(call);
  return r.ok ? json(200, r) : json(r.status ?? 422, { ok: false, error: { code: "invalid", message: r.message } });
};
// Nobody is in it yet: its people read as none, so the preview reads as the example business.
sequenceVerbs.people = async () => ({ ok: true, status: 200, data: { rows: [] } });
sequenceVerbs.peekPeople = () => ({ ok: true, status: 200, data: { rows: [] } });

let flashes = [];
let lc = null;
function Probe({ rec }) {
  lc = useLeadChain(
    rec,
    (f) => flashes.push(f),
    () => {},
  );
  return null;
}
const drawChain = (rec = REC_CHAIN) => again(() => W.React.createElement(Probe, { rec }));
let REC_CHAIN = recOf();

beforeEach(() => {
  unmount();
  fresh();
  wire = [];
  flashes = [];
  lc = null;
  REC = recOf();
  REC_CHAIN = recOf();
  answer = ([m, p]) =>
    m === "PUT" && p === `sequences/${SEQ}/chain`
      ? { ok: true, data: { step_ids: ["st-1", "st-2", "st-3"] } }
      : { ok: true, data: {} };
  setSurfaceValue("settings", {
    settings: {
      config: { brain: { business_name: "Harbor Studio", profile: { address: "1200 Barton Springs Rd, Austin, TX" } } },
    },
  });
});

/* ------------------------------------------------------------------ the chain */

test("a change is saved through the record's chain: the chain's body less its list, under the record's name; a new step takes the id the save gave it", async () => {
  drawChain();
  lc.edit((d) => contracts.reachOutAddStep(d));
  drawChain();
  assert.equal(lc.draft.steps.length, 3);
  assert.equal(lc.draft.steps[2].id, null, "a new step has no id until it is saved");
  const ids = await lc.flush();
  const puts = wire.filter(([m]) => m === "PUT");
  assert.equal(puts.length, 1, "one save for the change");
  const [, path, body] = puts[0];
  assert.equal(path, `sequences/${SEQ}/chain`, "the record's own door, by the sequence");
  assert.equal("search_id" in body, false, "its list is the sequence's own, never sent");
  assert.equal(body.name, "Gift shops · fall (renamed)", "the record's name, never the one the draft opened with");
  assert.equal(body.steps.length, 3);
  assert.deepEqual(ids, ["st-1", "st-2", "st-3"]);
  drawChain();
  assert.equal(lc.draft.steps[2].id, "st-3", "the next save changes it rather than adding another");
  assert.equal(lc.saving, "saved");
});

test("the auto-add switch saves at once, with the search new ready leads join from, or none", async () => {
  drawChain();
  lc.setSource("s-9");
  await settle();
  lc.setSource(null);
  await settle();
  const bodies = wire.filter(([m]) => m === "PUT").map(([, , b]) => b.source_search_id);
  assert.deepEqual(bodies, ["s-9", null]);
});

test("a refused save says the door's words and stands failed, and what was typed is kept", async () => {
  answer = () => ({ ok: false, status: 422, message: "Step 2 needs words before it can go." });
  drawChain();
  lc.edit((d) => ({ ...d, steps: d.steps.map((s, i) => (i === 1 ? { ...s, body: "" } : s)) }));
  drawChain();
  assert.equal(await lc.flush(), null);
  drawChain();
  assert.equal(lc.saving, "failed");
  assert.match(textOf(flashes.at(-1).msg), /Step 2 needs words before it can go\./);
  assert.equal(lc.draft.steps[1].body, "", "the draft stands as typed");
});

/* ---------------------------------------------------------------- a step's sheet */

/** The chain's hook and a step's sheet over it, as the record draws them. */
function Build({ rec, place, onClose }) {
  lc = useLeadChain(
    rec,
    (f) => flashes.push(f),
    () => {},
  );
  if (!lc) return null;
  return W.React.createElement(LeadStepSheet, {
    open: true,
    place,
    rec,
    lc,
    flash: (f) => flashes.push(f),
    onClose,
  });
}
let closed = 0;
// One record across a test's draws: a new one is the record read again, whose chain the draft takes back.
let REC = recOf();
const drawStep = (place, rec = REC) =>
  again(() => W.React.createElement(Build, { rec, place, onClose: () => (closed += 1) }));
/** What the open sheet draws: its body and its foot, by what the record hands the kit's Sheet. */
const sheetOf = (tree) => {
  const s = find(tree, (n) => n.type === Sheet && n.props.open);
  return s ? [s.props.children, s.props.foot] : null;
};

test("the first step has no Take out; a later one says how long it waits, then only if they have not written back", () => {
  let body = sheetOf(drawStep(1));
  assert.ok(byTestId(body, "ld-subject"), "the first email's subject");
  assert.equal(byTestId(body, "ld-step-remove"), null, "the first step is the sequence's start");
  assert.equal(byTestId(body, "ld-wait-1"), null);
  fresh();
  body = sheetOf(drawStep(2));
  assert.equal(byTestId(body, "ld-subject"), null, "a later one answers in the thread");
  assert.ok(byTestId(body, "ld-wait-2"));
  assert.ok(byTestId(body, "ld-step-remove"));
});

test("Take out closes the sheet and says so with Undo, which puts the step back where it stood, as new", async () => {
  closed = 0;
  const body = sheetOf(drawStep(2));
  press(byTestId(body, "ld-step-remove"));
  drawStep(2);
  assert.equal(closed, 1, "the sheet closes");
  assert.deepEqual(
    lc.draft.steps.map((s) => s.id),
    ["st-1"],
    "the step is out of the draft",
  );
  const said = flashes.at(-1);
  assert.equal(said.msg, contracts.LEAD_BUILD_WORDS.stepOut(2));
  said.undo();
  drawStep(2);
  assert.deepEqual(
    lc.draft.steps.map((s) => [s.id, s.body]),
    [
      ["st-1", "{{opening}}\n\n{{your name}}"],
      [null, "Just checking in."],
    ],
    "back in its place with its words, saved as a new step",
  );
  await lc.flush();
});

/* ---------------------------------------------------------------- the preview */

const drawPreview = (rec = REC) => {
  let tree = null;
  again(() => {
    tree = W.React.createElement(() => {
      lc = useLeadChain(
        rec,
        (f) => flashes.push(f),
        () => {},
      );
      return lc ? W.React.createElement(LeadPreview, { rec, lc, place: 1, leads: [], at: 0, onAt: () => {} }) : null;
    });
    return tree;
  });
  return tree;
};

test("nobody in it yet: the preview reads as the example business, said so, with the foot the send writes under it", () => {
  const tree = drawPreview();
  assert.equal(textOf(byTestId(tree, "ld-preview-who")), contracts.reachOutExampleLead().business_name);
  assert.ok(textOf(tree).includes(contracts.LEAD_BUILD_WORDS.example), "said to be an example");
  const email = find(tree, (n) => n.type === EmailAs);
  assert.ok(email, "the email, drawn whole by the part the lead sheet draws it with");
  assert.match(email.props.foot, /1200 Barton Springs Rd, Austin, TX/, "the business's address, as the send writes it");
  assert.match(email.props.from, /^Sam · /, "from the name it signs with, and your own inbox");
});

test("with no business address the preview carries no foot: the send refuses then, and How it runs says so", () => {
  setSurfaceValue("settings", { settings: { config: { brain: { business_name: "Harbor Studio", profile: {} } } } });
  const email = find(drawPreview(), (n) => n.type === EmailAs);
  assert.equal(email.props.foot, null);
});

/* ------------------------------------------------------------ Send me a test */

test("Send me a test saves what is typed first, then sends the step to your own inbox as the lead previewed gets it", async () => {
  answer = ([m, p]) =>
    m === "PUT"
      ? { ok: true, data: { step_ids: ["st-1", "st-2"] } }
      : p === `sequences/${SEQ}/steps/st-1/test`
        ? { ok: true, data: { to: "sam@harbor.example" } }
        : { ok: true, data: {} };
  drawStep(1);
  lc.edit((d) => ({ ...d, steps: d.steps.map((s, i) => (i === 0 ? { ...s, subject: "Hello {{business}}" } : s)) }));
  let body = sheetOf(drawStep(1));
  press(byTestId(body, "ld-preview-open"));
  await settle();
  body = sheetOf(drawStep(1));
  press(byTestId(body, "ld-step-test"));
  // The press lands, then says its receipt: on the clock, as the client reads the wire's answer.
  for (let n = 0; n < 100 && flashes.length === 0; n += 1) await new Promise((r) => setTimeout(r, 5));
  const sent = wire.filter(([m]) => m !== "GET");
  assert.equal(sent.at(0)[0], "PUT", "the words as they stand are saved first");
  assert.equal(sent.at(0)[2].steps[0].subject, "Hello {{business}}");
  assert.deepEqual(
    sent.at(-1),
    ["POST", `sequences/${SEQ}/steps/st-1/test`, null],
    "nobody previewed: the example, no lead named",
  );
  assert.deepEqual(
    [flashes.at(-1).tone, flashes.at(-1).msg],
    ["ok", contracts.SEQUENCE_TEST_WORDS.sent("sam@harbor.example")],
  );
});

/* ------------------------------------------------------------ how it runs */

/** The chain's hook and its How it runs sheet over it, as the record draws them. */
function Runs({ rec }) {
  lc = useLeadChain(
    rec,
    (f) => flashes.push(f),
    () => {},
  );
  if (!lc) return null;
  return W.React.createElement(LeadRunsSheet, {
    open: true,
    rec,
    lc,
    flash: (f) => flashes.push(f),
    moved: () => {},
    onClose: () => {},
  });
}

test("Before each batch, picked, reaches the change door as the sequence's own mode, beside its name and nothing else (decision 0064)", async () => {
  // The picker once sent the payload's `mode`, which the change's spec reads as a card's reading of how its runs go, so
  // nothing was written; the door reads a sequence's under `sequence_mode` (contracts playbookChangeSpec).
  const rec = { ...REC, sequence: { ...REC.sequence, starts: "leads", mode: "veto", evidence: null } };
  const pick = byTestId(sheetOf(again(() => W.React.createElement(Runs, { rec }))), "ld-runs-approves-pick");
  assert.equal(pick.props.value, "veto", "it opens on the sequence's own mode");
  pick.props.onValueChange("ask");
  const put = () => wire.find(([m, p]) => m === "PUT" && p === `playbooks/${SEQ}`);
  for (let i = 0; i < 200 && !put(); i += 1) await new Promise((r) => setTimeout(r, 5));
  assert.ok(put(), "one change, at the campaign's own door");
  assert.deepEqual(put()[2], { name: rec.sequence.name, mode: "ask" });
});

test("Sends from says what is saved: the mailboxes kept in sight while chosen with none sending, and a mailbox offered once one is", () => {
  const pickOf = (chain) => {
    // Each case its own tree: a chain read again is taken on the next draw, never the one drawn now.
    unmount();
    fresh();
    const rec = recOf(chainOf(chain));
    const tree = sheetOf(again(() => W.React.createElement(Runs, { rec })));
    return {
      pick: byTestId(tree, "ld-runs-from-pick"),
      note: byTestId(tree, "ld-runs-from-note"),
      day: byTestId(tree, "ld-runs-day"),
      tree,
    };
  };
  // Saved to send from the mailboxes, none connected: not shown as the inbox it is not; nothing goes, and it says so.
  const none = pickOf({ owner_sends: false, mailboxes: [] });
  assert.equal(none.pick.props.value, "mailboxes");
  assert.deepEqual(
    none.pick.props.groups[0].options.map((o) => o.label),
    ["Your inbox · you send", "Your mailboxes · none yet"],
  );
  assert.match(textOf(none.note), /No mailbox sends now, so nothing goes/);
  assert.match(textOf(none.day), /None until a mailbox sends/);
  assert.doesNotMatch(textOf(none.day), /You send each/, "never the owner's pace for a chain they do not send");
  // The owner sends, and a mailbox is connected now: it is offered, and said once.
  const box = { address: "sam@getharbor.example", sent_days: 9, daily_cap: 40, customer_domain: false };
  const switchable = pickOf({ owner_sends: true, mailboxes: [box] });
  assert.equal(switchable.pick.props.value, "inbox");
  assert.match(textOf(switchable.note), /Your mailbox is connected: choose it to send these for you/);
  // The owner sends, with none connected: one choice, nothing to say.
  const plain = pickOf({ owner_sends: true, mailboxes: [] });
  assert.deepEqual(
    plain.pick.props.groups[0].options.map((o) => o.value),
    ["inbox"],
  );
  assert.equal(plain.note ?? null, null);
});

test("A day, at most keeps the slowest spacing for each count, and the saved spacing is always one of the choices (0077)", () => {
  const pace = (mailboxes, saved) => contracts.leadPaceChoicesOf(mailboxes, saved).map((p) => [p.share, p.gap]);
  const fresh = { address: "sam@getharbor.example", sent_days: 0, daily_cap: 40, customer_domain: false };
  const settled = { ...fresh, sent_days: 30 };
  // A new mailbox sends ten a day at any spacing up to 30 minutes: the slowest of them is offered, never one every 5.
  assert.deepEqual(pace([fresh]), [
    [10, 30],
    [9, 60],
  ]);
  assert.deepEqual(pace([fresh, { ...fresh, address: "lee@getharbor.example" }]), [
    [20, 30],
    [18, 60],
  ]);
  // A settled one's forty a day fits from 12 minutes apart; the wider spacings each give a smaller day.
  assert.deepEqual(pace([settled]), [
    [40, 12],
    [25, 20],
    [17, 30],
    [9, 60],
  ]);
  // Saved at a spacing no count keeps (12, as New once wrote it): it is a choice of its own, beside its count's.
  assert.deepEqual(pace([fresh], 12), [
    [10, 30],
    [10, 12],
    [9, 60],
  ]);
  assert.equal(
    contracts.leadPaceChoicesOf([fresh], 12).find((p) => p.gap === 12).hint,
    "one every 12 min or so",
    "it says its own spacing",
  );
  // Saved at one that is kept: nothing is added.
  assert.deepEqual(pace([fresh], 30), [
    [10, 30],
    [9, 60],
  ]);
});

/** A mailbox as the chain's read offers it (0077): its tick, its standing, its DNS and its signature's words. */
const choiceOf = (id, over = {}) => ({
  id,
  address: `${id}@getharbor.example`,
  state: "connected",
  sends_now: true,
  picked: true,
  dns: { spf: "found", dkim: "found", dmarc: "found" },
  facts: { address: `${id}@getharbor.example`, sent_days: 30, daily_cap: 40, customer_domain: false },
  signature: { words: "Sam Lee\nHarbor Studio", has_link: false },
  connected_at: "2026-10-01T00:00:00Z",
  ...over,
});

test("Each mailbox is a row: its day, why it does not send now, the records DNS is missing, New, and the last tick kept (0077)", () => {
  const sam = choiceOf("sam", { facts: { ...choiceOf("sam").facts, sent_days: 0 } });
  const lee = choiceOf("lee", {
    state: "paused",
    sends_now: false,
    dns: { spf: "missing", dkim: "missing", dmarc: "found" },
    connected_at: "2026-10-20T00:00:00Z",
  });
  const tired = choiceOf("ann", { sends_now: false });
  // Connected since the sequence was made, and still ramping: "New" once, before its day, never "new" twice.
  const kim = choiceOf("kim", {
    facts: { ...choiceOf("kim").facts, sent_days: 0 },
    connected_at: "2026-10-21T00:00:00Z",
  });
  const chain = { mailbox_choices: [sam, lee, tired, kim], created_at: "2026-10-18T00:00:00Z" };
  const rows = contracts.leadMailboxRowsOf(chain, []);
  assert.deepEqual(
    rows.map((r) => [r.address, r.on, r.locked, r.sub, r.dnsMissing]),
    [
      ["sam@getharbor.example", true, false, "10 a day, rising to 40", false],
      ["lee@getharbor.example", true, false, "New · 40 a day · Paused · SPF and DKIM missing", true],
      ["ann@getharbor.example", true, false, "40 a day · Done for today", false],
      ["kim@getharbor.example", true, false, "New · 10 a day, rising to 40", false],
    ],
    "a sequence that names none writes from every one",
  );
  // One ticked: it stays, and says why.
  const one = contracts.leadMailboxRowsOf(chain, ["sam"]);
  assert.deepEqual(
    one.map((r) => [r.on, r.locked]),
    [
      [true, true],
      [false, false],
      [false, false],
      [false, false],
    ],
  );
  assert.match(one[0].sub, /One has to send\. To stop them all, choose Your inbox · you send\.$/);
  // A tick names its own list from then on, and the last one is never taken off.
  assert.deepEqual(contracts.leadMailboxesTicked(chain, [], "lee", false), ["sam", "ann", "kim"]);
  assert.deepEqual(contracts.leadMailboxesTicked(chain, ["sam"], "sam", false), ["sam"]);
  assert.deepEqual(contracts.leadMailboxesTicked(chain, ["sam"], "lee", true), ["sam", "lee"]);
  // The day is made of the ticked ones that send now.
  assert.deepEqual(
    contracts.leadSendingFactsOf(chain, ["sam", "lee"]).map((f) => f.address),
    ["sam@getharbor.example"],
  );
});

test("Ends with offers the name and the first ticked mailbox's signature, and says what it will not do (0077, D10)", () => {
  const draft = { mailbox_ids: [], signs_with: "name", signed_by: "Sam", owner_sends: false };
  const linked = choiceOf("lee", { signature: { words: "Lee\nharbor.example", has_link: true } });
  const chain = { mailbox_choices: [choiceOf("sam", { sends_now: false }), linked] };
  const ends = contracts.leadEndingOf(chain, draft);
  assert.equal(ends.value, "name");
  assert.deepEqual(
    ends.options.map((o) => [o.value, o.label]),
    [
      ["name", "“Sam”"],
      ["mailbox", "lee@getharbor.example's signature"],
    ],
    "the first ticked that sends now is the one first emails leave from",
  );
  assert.equal(ends.note, null);
  assert.equal(
    contracts.leadEndingOf(chain, { ...draft, signs_with: "mailbox" }).note,
    "Its signature has a link, so first emails from it end with your name.",
  );
  // The owner sends: their own mail app signs, so the name alone.
  const owner = contracts.leadEndingOf(chain, { ...draft, owner_sends: true, signs_with: "mailbox" });
  assert.deepEqual([owner.value, owner.options.length], ["name", 1]);
  // No mailbox signature: the name alone; no name: asked for.
  const bare = { mailbox_choices: [choiceOf("sam", { signature: null })] };
  assert.equal(contracts.leadEndingOf(bare, draft).options.length, 1);
  assert.equal(contracts.leadEndingOf(bare, { ...draft, signed_by: " " }).note, "Write the name it ends with.");
});

test("How it runs draws the mailboxes' ticks, every batch of first emails waiting, Follow-ups and Ends with, each saved as the sheet saves", async () => {
  const lee = choiceOf("lee", { dns: { spf: "missing", dkim: "found", dmarc: "found" } });
  const rec = {
    ...recOf(
      chainOf({
        owner_sends: false,
        mailboxes: [choiceOf("sam").facts, lee.facts],
        mailbox_choices: [choiceOf("sam"), lee],
      }),
    ),
  };
  rec.sequence = { ...rec.sequence, starts: "leads", mode: "veto", evidence: null };
  const draw = () => sheetOf(again(() => W.React.createElement(Runs, { rec })));
  let tree = draw();
  assert.equal(textOf(byTestId(tree, "ld-runs-every-mailbox")), "Every mailbox, and any you connect later");
  assert.match(textOf(byTestId(tree, "ld-runs-mailbox-lee")), /SPF missing/);
  assert.ok(byTestId(tree, "ld-runs-mailbox-lee-dns"), "a missing record offers Set up DNS");
  assert.equal(byTestId(tree, "ld-runs-mailbox-sam-dns") ?? null, null);
  // Taking one off names the rest; the last one left cannot be.
  byTestId(tree, "ld-runs-mailbox-lee-switch").props.onCheckedChange(false);
  tree = draw();
  assert.deepEqual(lc.draft.mailbox_ids, ["sam"]);
  assert.equal(byTestId(tree, "ld-runs-every-mailbox") ?? null, null, "a list of its own now");
  assert.equal(byTestId(tree, "ld-runs-mailbox-sam-switch").props.readOnly, true);
  // The batch rule as a fact, the choice for the follow-ups.
  assert.equal(textOf(byTestId(tree, "ld-runs-first-emails")), "Every batch of first emails waits for your OK");
  const follow = byTestId(tree, "ld-runs-approves-pick");
  assert.deepEqual(
    follow.props.groups[0].options.map((o) => o.label),
    ["Your OK first, then 30 minutes to stop", "Each waits for your OK"],
  );
  // Ends with: the signature, saved with the chain.
  const ends = byTestId(tree, "ld-runs-ends-pick");
  assert.deepEqual(
    ends.props.groups[0].options.map((o) => o.value),
    ["name", "mailbox"],
  );
  ends.props.onValueChange("mailbox");
  draw();
  assert.equal(lc.draft.signs_with, "mailbox");
  await lc.flush();
  const put = wire.filter(([m, p]) => m === "PUT" && p === `sequences/${SEQ}/chain`).at(-1);
  assert.deepEqual([put[2].signs_with, put[2].mailbox_ids], ["mailbox", ["sam"]]);
});
