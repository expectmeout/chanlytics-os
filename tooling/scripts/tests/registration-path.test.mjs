/**
 * Two registrations, one fork — run, not read.
 *
 * THE DEFECT THESE EXIST FOR. The business-record form marked the tax ID
 * required, because the only registration this product filed was the one that
 * needs one. A business without an EIN — a solo barber, a chair renter, a
 * one-person moving company — filled in fourteen fields and was stopped at the
 * fifteenth by a hint saying the other registration was "not offered yet".
 *
 * The carriers have a path for them, so now so do we. Which puts a fork in
 * three places at once: which fields are asked, what counts as complete, and
 * which bundle is filed. Three places to disagree, and a disagreement here is
 * not cosmetic — the narrow registration allows one number and about one
 * message a second, and a brand once registered CANNOT be withdrawn (the
 * carriers answer 405 to a delete, which this codebase found out by trying).
 * Filing the wrong one for somebody is permanent.
 *
 * So these ask the questions no source-scan can: does what the form asks match
 * what the filing actually sends, does a record still read back on the path it
 * was saved on after a round trip, and does the fee stay unspent when the
 * record is not ready.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./_fake-db.mjs";
import { readCode, readRaw } from "./_source.mjs";
import {
  registrationPathOf, businessFieldsFor, businessGroupWordsFor, businessRecordProblems, businessRecordForPath,
  emptyBusinessRecord, soleProprietorLimits, SOLE_PROP_LIMITS, REGISTRATION_PATHS, REGISTRATION_QUESTION,
  REGISTRATION_PATH_WORDS, REGISTRATION_COST_WORDS, SOLE_PROP_CEILING_SENTENCE, smsStateRow, textingWords,
  businessRecordLine,
} from "@chanlytics/contracts";
import { brandTypeFor, starterEndUserRequest, soleProprietorEndUserRequest, businessEndUserRequest, addressRequest } from "@chanlytics/channels";
import { registerLine } from "../../../apps/edge/lib/a2p.ts";

const TENANT = "11111111-1111-1111-1111-111111111111";
const LINE = "22222222-2222-2222-2222-222222222222";

/** A record that could be filed either way, so a difference in the answer is the path and not the data. */
const RECORD = {
  ...emptyBusinessRecord({ websiteUrl: "https://harbormoving.example", email: "ada@example.com" }),
  legal_name: "Harbor Moving LLC",
  trade_name: "Harbor Moving",
  ein: "12-3456789",
  street: "193 Jamaica Ave", city: "Brooklyn", region: "NY", postal_code: "11207", country: "US",
  contact_first_name: "Ada", contact_last_name: "Lovelace",
  contact_email: "ada@example.com", contact_phone: "+19175550123",
};
const soleProp = (over = {}) => ({ ...RECORD, ein: null, ...over });

test("three answers, not two: nothing on file is not the same as no tax id", () => {
  // The whole reason the form asks. An empty tax-id box means BOTH "this
  // business has none" and "the owner has not typed it yet" — and inferring
  // the first from the second files the permanent, capped registration for a
  // business that did not need it.
  assert.equal(registrationPathOf(null), null, "nothing on file: nobody has answered");
  assert.equal(registrationPathOf(undefined), null);
  assert.equal(registrationPathOf({ ein: "12-3456789" }), "standard");
  assert.equal(registrationPathOf({ ein: null }), "sole_proprietor");
  assert.equal(registrationPathOf({ ein: "   " }), "sole_proprietor", "whitespace is not a tax id");
  assert.deepEqual([...REGISTRATION_PATHS], ["standard", "sole_proprietor"]);
});

test("no default path: a validator that guessed would quietly pass the wrong registration", () => {
  // This is the bug the argument exists to make impossible. With a default,
  // any caller that forgot to pass the path would validate a business as a sole
  // proprietor — the narrow, permanent one — and report nothing missing.
  assert.throws(() => businessRecordProblems(RECORD), "the path is not optional");
  assert.deepEqual(businessRecordProblems(RECORD, "standard"), {});
});

test("a record reads back on the path it was saved on, for ever", () => {
  // The invariant that lets the path be derived instead of stored. It holds
  // from both ends: a standard record cannot be saved without its tax id, and a
  // sole-proprietor record is never saved with one.
  for (const path of REGISTRATION_PATHS) {
    const stored = businessRecordForPath(path === "standard" ? RECORD : soleProp(), path);
    assert.deepEqual(businessRecordProblems(stored, path), {}, `${path}: complete`);
    assert.equal(registrationPathOf(stored), path, `${path}: round-trips`);
  }
  // The dangerous direction: a sole proprietor who once typed a tax id, or an
  // owner who switches answer with one still in the box. Storing it would make
  // the record read back as standard later while the filed brand is the narrow
  // one.
  assert.equal(businessRecordForPath({ ...RECORD }, "sole_proprietor").ein, null);
  // And a standard record with no tax id cannot be saved at all, which is what
  // closes the loop.
  assert.ok(businessRecordProblems(soleProp(), "standard").ein, "a business must give the tax id it says it has");
});

test("each path asks exactly what its own filing sends", () => {
  // The rule in business-record.ts, checked against the requests rather than
  // against a comment. A required box whose answer goes nowhere is how a form
  // loses somebody at field fifteen; a field the filing needs and the form
  // never asked is a rejection that arrives days after the fee.
  const asked = (path) => businessFieldsFor(path).map((f) => f.name);

  // STANDARD: the business end user carries the tax id, the legal form and the
  // website, so all three are asked and required.
  const std = businessEndUserRequest({
    legalName: RECORD.legal_name, ein: RECORD.ein, websiteUrl: RECORD.website_url,
    businessType: RECORD.business_type, industry: RECORD.industry,
  });
  const stdAttrs = JSON.parse(std.form.Attributes);
  assert.equal(stdAttrs.business_registration_number, RECORD.ein);
  assert.equal(stdAttrs.website_url, RECORD.website_url);
  for (const name of ["ein", "business_type", "website_url"]) {
    assert.ok(asked("standard").includes(name), `standard asks for ${name}`);
  }
  for (const name of ["ein", "business_type"]) {
    assert.ok(businessFieldsFor("standard").find((f) => f.name === name).required, `standard requires ${name}, because it sends it`);
  }
  // The website is ASKED and not REQUIRED on either path now, and that is gate
  // 8: a carrier registration needs a site that identifies the business, on a
  // domain matching the brand, and most salons have a Facebook page and a
  // Booksy link. We publish `/b/<slug>` from the facts on this very form and
  // file that instead, so a missing URL is no longer a wall at field seven.
  for (const path of ["standard", "sole_proprietor"]) {
    assert.equal(businessFieldsFor(path).find((f) => f.name === "website_url").required, false, path);
  }
  assert.match(businessFieldsFor("standard").find((f) => f.name === "website_url").hint, /we publish a page for you/);

  // SOLE PROPRIETOR: two end users and an address, and between them they send
  // one name, the person, their mobile and the vertical. Nothing else.
  const sp = soleProp();
  const sent = JSON.stringify([
    JSON.parse(starterEndUserRequest({
      contactFirstName: sp.contact_first_name, contactLastName: sp.contact_last_name,
      contactEmail: sp.contact_email, contactPhone: sp.contact_phone,
    }).form.Attributes),
    JSON.parse(soleProprietorEndUserRequest({ tradeName: null, legalName: sp.legal_name, contactPhone: sp.contact_phone }, sp.industry).form.Attributes),
    addressRequest("ACsub", { legalName: sp.legal_name, street: sp.street, city: sp.city, region: sp.region, postalCode: sp.postal_code, country: sp.country }).form,
  ]);
  for (const name of ["legal_name", "industry", "street", "city", "region", "postal_code", "contact_first_name", "contact_last_name", "contact_email", "contact_phone"]) {
    assert.ok(asked("sole_proprietor").includes(name), `sole proprietor asks for ${name}`);
    assert.ok(sent.includes(String(sp[name])), `and sends ${name}`);
  }
  // The three it must NOT ask: there is no registered entity to describe, and
  // nothing on this path sends any of them.
  for (const name of ["ein", "business_type", "company_type"]) {
    assert.ok(!asked("sole_proprietor").includes(name), `sole proprietor is never asked for ${name}`);
  }
  assert.ok(!sent.includes(RECORD.ein), "and no request on this path carries a tax id");
  assert.ok(!sent.includes(RECORD.website_url), "and nothing on this path sends the website at all");
  // One name box, because the filing sends one name.
  assert.ok(!asked("sole_proprietor").includes("trade_name"));
});

test("complete for one registration is incomplete for the other", () => {
  const sp = soleProp({ website_url: "" });
  assert.deepEqual(businessRecordProblems(sp, "sole_proprietor"), {}, "no tax id and no website: ready to file as a sole proprietor");
  const asStandard = businessRecordProblems(sp, "standard");
  assert.ok(asStandard.ein, "the same record, as a business, is missing its tax id");
  assert.equal(asStandard.website_url, undefined, "but NOT the website: we publish one for them");
  // And the words change with the path, because "as the tax authorities know
  // it" is a lie told to somebody with no filing.
  assert.notEqual(businessGroupWordsFor("sole_proprietor").business.sub, businessGroupWordsFor("standard").business.sub);
  assert.match(businessFieldsFor("sole_proprietor").find((f) => f.name === "legal_name").hint, /no filing to match/);
  assert.match(businessFieldsFor("standard").find((f) => f.name === "ein").hint, /Nine digits/);
  assert.ok(!/do not offer/i.test(JSON.stringify(businessFieldsFor("standard"))), "REGRESSION: the tax-id hint said we did not offer the other registration");
});

test("the mobile the carriers text cannot be the number we answer for them", () => {
  // The mistake a business makes without noticing: giving the number on their
  // own website, which is the line WE answer. The carriers refuse a CPaaS
  // number as a sole proprietor's handset, and the live salon's own record had
  // exactly this. Checkable, so checked — before the fee, not after.
  const ours = ["+1 917 555 0123"];
  const p = businessRecordProblems(soleProp(), "sole_proprietor", { ourNumbers: ours });
  assert.match(p.contact_phone, /YOUR handset/, "however it is punctuated");
  assert.deepEqual(businessRecordProblems(soleProp(), "sole_proprietor", { ourNumbers: ["+13055550100"] }), {}, "a number that is not ours is fine");
  // A business does not hold the handset the code goes to, so the rule is the
  // sole proprietor's alone.
  assert.deepEqual(businessRecordProblems(RECORD, "standard", { ourNumbers: ours }), {});
  // Nothing to check against is never a guess.
  assert.deepEqual(businessRecordProblems(soleProp(), "sole_proprietor"), {});
});

test("the carriers register two countries, and a refusal for that is days away", () => {
  assert.match(businessRecordProblems({ ...RECORD, country: "GB" }, "standard").country, /US and Canadian/);
  assert.deepEqual(businessRecordProblems({ ...RECORD, country: "ca" }, "standard"), {}, "either of the two, however it is cased");
});

test("brandTypeFor and the fork cannot disagree about the same tax id", () => {
  for (const ein of ["12-3456789", "123456789", null, "", "  "]) {
    const want = registrationPathOf({ ein }) === "sole_proprietor" ? "SOLE_PROPRIETOR" : "STANDARD";
    assert.equal(brandTypeFor({ ein }), want, `ein=${JSON.stringify(ein)}`);
  }
  const src = readCode("packages/channels/src/a2p.ts");
  assert.ok(src.includes("registrationPathOf(r) === \"sole_proprietor\""), "it delegates rather than deciding again");
  assert.ok(!/return r\.ein && r\.ein\.trim\(\) \? "STANDARD"/.test(src), "REGRESSION: a second place that reads the tax id its own way");
});

test("what the narrow path gives up is said before the button, with the real numbers", () => {
  const said = soleProprietorLimits().join(" ");
  for (const n of [SOLE_PROP_LIMITS.messagesPerSecond, SOLE_PROP_LIMITS.mobileUsesEver, SOLE_PROP_LIMITS.emailUsesEver, SOLE_PROP_LIMITS.perMinuteAtt]) {
    assert.ok(said.includes(String(n)), `${n} is stated`);
  }
  assert.ok(said.includes("1,000"), "a thousand a day, grouped, whatever ICU this runtime shipped with");
  assert.match(said, /cannot be withdrawn/, "the permanence is one of the limits");
  assert.match(said, /reply from that handset/, "and so is the thing nobody expects");
  // No apology and no softening: these are the carriers' numbers, stated.
  assert.doesNotMatch(said, /sorry|unfortunately|slight|minor/i);
  // The commit moment repeats the ceiling, and only the standard path names a
  // price — that one is off a real invoice.
  assert.match(REGISTRATION_COST_WORDS.standard, /\$19/);
  assert.ok(!/\$/.test(REGISTRATION_COST_WORDS.sole_proprietor), "no invented figure for a filing nobody has been billed for");
  assert.match(REGISTRATION_COST_WORDS.sole_proprietor, /one number, one campaign/);
  for (const p of REGISTRATION_PATHS) assert.match(REGISTRATION_COST_WORDS[p], /cannot be undone/);
  // The question itself, and the nudge that stops somebody choosing the narrow
  // path when they did not have to.
  assert.match(REGISTRATION_QUESTION.title, /tax ID/);
  assert.match(REGISTRATION_QUESTION.nudge, /use it/);
  assert.notEqual(REGISTRATION_PATH_WORDS.standard.choice, REGISTRATION_PATH_WORDS.sole_proprietor.choice);
});

/* -------------------------------------------------------------------------- *
 * The page itself, rendered without a browser.
 *
 * No jsdom and no React: the four hooks below are the four this page uses, so
 * the component body runs for real -- real branching, real calls into the
 * contract -- and what comes back is the element tree. surface-seam.test.mjs
 * names the tradeoff for view properties it cannot reach without a renderer;
 * this one CAN be reached, so it is, because "does the form ask before it
 * renders" is exactly the property that was broken and exactly the property a
 * source scan answers badly.
 *
 * One shared React global, so these mount one page at a time -- which node:test
 * does anyway for top-level tests.
 * -------------------------------------------------------------------------- */
globalThis.React = { Fragment: "Fragment" };
globalThis.window = {
  location: { origin: "https://app.chanlytics.com" },
  __ME: { email: "ada@example.com" },
  __WORKSPACES: [{ slug: "harbor" }],
  canDo: () => true,
};
await import("../../../apps/dashboard/src/legacy/pages/business-record.jsx");
const Page = globalThis.window.BusinessRecordForm;

function mount(props) {
  const cells = [];
  let seq = 0;
  let effects = [];
  Object.assign(globalThis.React, {
    createElement: (type, p, ...kids) => ({ type, props: { ...(p || {}), children: kids.flat(Infinity) } }),
    useMemo: (fn) => { const k = seq++; if (!(k in cells)) cells[k] = fn(); return cells[k]; },
    useState: (init) => {
      const k = seq++;
      if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init;
      return [cells[k], (v) => { cells[k] = typeof v === "function" ? v(cells[k]) : v; }];
    },
    useEffect: (fn) => { effects.push(fn); },
  });
  const draw = () => { seq = 0; effects = []; return Page(props); };
  let tree = draw();
  return {
    get tree() { return tree; },
    async flush() {
      for (const e of effects) e();
      await new Promise((r) => setImmediate(r));
      tree = draw();
    },
    async act(node) {
      node.props.onClick();
      tree = draw();
      await new Promise((r) => setImmediate(r));
      tree = draw();
    },
  };
}

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  fn(n);
  for (const k of n.props?.children ?? []) walk(k, fn);
};
const byId = (root, id) => { let hit = null; walk(root, (n) => { if (!hit && n.props?.["data-testid"] === id) hit = n; }); return hit; };
const ids = (root) => { const out = []; walk(root, (n) => { const t = n.props?.["data-testid"]; if (t) out.push(t); }); return out; };
const textOf = (n) => {
  const out = [];
  const rec = (x) => {
    if (x == null || x === false || x === true) return;
    if (typeof x === "string" || typeof x === "number") { out.push(String(x)); return; }
    if (Array.isArray(x)) { x.forEach(rec); return; }
    if (typeof x === "object") rec(x.props?.children);
  };
  rec(n);
  return out.join(" ");
};

/** The page's API: the network stubbed, every path-dependent answer the real contract's. */
function api(read, saved = []) {
  return {
    read: async () => read,
    save: async (record, path) => { saved.push({ record, path }); return { ok: true, message: "Saved." }; },
    register: async () => ({ ok: true, pending: true, message: "Filed." }),
    fieldsFor: businessFieldsFor,
    groupsFor: businessGroupWordsFor,
    paths: REGISTRATION_PATHS,
    question: REGISTRATION_QUESTION,
    pathWords: REGISTRATION_PATH_WORDS,
    costWords: REGISTRATION_COST_WORDS,
    limits: soleProprietorLimits,
    pathOf: registrationPathOf,
    forPath: businessRecordForPath,
    empty: emptyBusinessRecord,
    problems: businessRecordProblems,
    line: businessRecordLine,
    optionWords: (v) => v,
  };
}

/** The field boxes on screen, by column, in the order they are rendered. */
const boxes = (tree) => ids(tree).filter((t) => /^biz-[a-z_]+$/.test(t) && !["biz-fork", "biz-limits", "biz-answer", "biz-save", "biz-file", "biz-arm", "biz-rejected"].includes(t));

test("the form asks the question before it renders either registration", async () => {
  globalThis.window.__businessRecord = api({ ok: true, record: null, path: null, problems: {} });
  const page = mount({ line: null, flash: () => {} });
  // Frame one: nothing is known, so nothing is offered.
  assert.match(textOf(page.tree), /Reading what is on record/);
  assert.deepEqual(ids(page.tree), [], "no fields and no fork before the answer is known");

  await page.flush();
  // The fork, and ONLY the fork: no field boxes behind it.
  assert.ok(byId(page.tree, "biz-fork"), "the question");
  assert.ok(byId(page.tree, "biz-path-standard") && byId(page.tree, "biz-path-sole_proprietor"), "both answers");
  assert.equal(byId(page.tree, "biz-legal_name"), null, "and not one field yet");
  assert.equal(byId(page.tree, "biz-ein"), null);
  assert.equal(byId(page.tree, "biz-save"), null, "nothing to save before there is something to fill in");
  // What the narrow answer costs, on the screen where it is chosen.
  const limits = textOf(byId(page.tree, "biz-limits"));
  for (const l of soleProprietorLimits()) assert.ok(limits.includes(l), l);
  assert.ok(textOf(page.tree).includes(REGISTRATION_QUESTION.nudge));
});

test("answering picks the fields, and they are the contract's", async () => {
  globalThis.window.__businessRecord = api({ ok: true, record: null, path: null, problems: {} });
  const page = mount({ line: null, flash: () => {} });
  await page.flush();

  await page.act(byId(page.tree, "biz-path-sole_proprietor"));
  assert.deepEqual(boxes(page.tree), businessFieldsFor("sole_proprietor").map((f) => `biz-${f.name}`), "exactly the sole proprietor's fields, in the contract's order");
  assert.equal(byId(page.tree, "biz-ein"), null, "REGRESSION: a business with no tax id was shown a required tax-id box");
  assert.equal(byId(page.tree, "biz-business_type"), null);
  const mobile = textOf(byId(page.tree, "biz-contact_phone"));
  assert.ok(mobile.includes("Your mobile"), "and the mobile is described as what it is on this path");
  assert.ok(mobile.includes("reply from that phone"));
  assert.ok(textOf(byId(page.tree, "biz-answer")).includes(REGISTRATION_PATH_WORDS.sole_proprietor.filed), "the answer is shown");
  assert.ok(byId(page.tree, "biz-path-change"), "and changeable");

  // The other answer, from the same fork.
  globalThis.window.__businessRecord = api({ ok: true, record: null, path: null, problems: {} });
  const std = mount({ line: null, flash: () => {} });
  await std.flush();
  await std.act(byId(std.tree, "biz-path-standard"));
  assert.deepEqual(boxes(std.tree), businessFieldsFor("standard").map((f) => `biz-${f.name}`));
  assert.ok(byId(std.tree, "biz-ein"), "a business is asked for its tax id");
});

test("an empty record guesses no website: left empty, the filing names this workspace's own page", async () => {
  // Two workspaces, and the one open is not the one that sorts first. The form
  // used to pre-fill the website with `/yes/` + the FIRST workspace's slug; the
  // owner saved it without a glance, and the filing sent another business's
  // opt-in page to the carriers as this business's website.
  const was = { list: globalThis.window.__WORKSPACES, active: globalThis.window.__ACTIVE_WORKSPACE };
  globalThis.window.__WORKSPACES = [{ id: "w-a", slug: "aardvark-autos" }, { id: "w-h", slug: "harbor" }];
  globalThis.window.__ACTIVE_WORKSPACE = "w-h";
  try {
    globalThis.window.__businessRecord = api({ ok: true, record: null, path: null, problems: {} });
    const page = mount({ line: null, flash: () => {} });
    await page.flush();
    await page.act(byId(page.tree, "biz-path-standard"));
    let input = null;
    walk(byId(page.tree, "biz-website_url"), (n) => { if (!input && n.type === "input") input = n; });
    assert.ok(input, "the website is asked");
    assert.equal(input.props.value, "", "and nothing is guessed for it");
  } finally {
    globalThis.window.__WORKSPACES = was.list;
    globalThis.window.__ACTIVE_WORKSPACE = was.active;
  }
});

test("a record on file skips the question, and switching answer drops the tax id", async () => {
  // The server said which registration this is, so the owner is not asked
  // something they have already answered.
  const saved = [];
  globalThis.window.__businessRecord = api({ ok: true, record: { ...RECORD }, path: "standard", problems: {} }, saved);
  const page = mount({ line: { id: LINE, sms_state: "none" }, flash: () => {} });
  await page.flush();
  assert.equal(byId(page.tree, "biz-fork"), null, "no question");
  assert.ok(byId(page.tree, "biz-ein"), "straight to the fields it was saved with");

  // Reopening it and switching: the tax id has to leave the form, or the page
  // keeps failing a format check on a box it no longer renders -- and the row
  // would read back as a business later.
  await page.act(byId(page.tree, "biz-path-change"));
  assert.ok(byId(page.tree, "biz-fork"), "the fork again");
  await page.act(byId(page.tree, "biz-path-sole_proprietor"));
  assert.equal(byId(page.tree, "biz-ein"), null);
  await page.act(byId(page.tree, "biz-save"));
  assert.equal(saved.length, 1, "it saved");
  assert.equal(saved[0].path, "sole_proprietor", "the path travels with the record");
  assert.equal(saved[0].record.ein, null, "and the tax id is gone");
});

test("the price asked at the button is the price of the registration being filed", async () => {
  for (const path of REGISTRATION_PATHS) {
    const record = businessRecordForPath({ ...RECORD }, path);
    globalThis.window.__businessRecord = api({ ok: true, record, path, problems: {} });
    const page = mount({ line: { id: LINE, sms_state: "none" }, flash: () => {} });
    await page.flush();
    await page.act(byId(page.tree, "biz-file"));
    assert.ok(textOf(byId(page.tree, "biz-arm")).includes(REGISTRATION_COST_WORDS[path]), path);
    assert.ok(byId(page.tree, "biz-file-yes"), "and it is asked once, plainly");
  }
});

test("a filing the carriers sent back offers no button that can only be refused", async () => {
  // Resubmitting a campaign the carriers rejected is support's action (gate 6): the
  // owner's route never sends `refile: true`. So on a rejected line "File with the
  // carriers" could only be refused -- a dead button on the form an owner opens
  // straight after being told their filing came back. Saving corrections stays
  // theirs, and is what unblocks the resubmit.
  const record = businessRecordForPath({ ...RECORD }, "standard");
  globalThis.window.__businessRecord = api({ ok: true, record, path: "standard", problems: {} });
  const sentBack = mount({ line: { id: LINE, sms_state: "rejected" }, flash: () => {} });
  await sentBack.flush();
  assert.equal(byId(sentBack.tree, "biz-file"), null, "no File button on a line the carriers sent back");
  assert.match(textOf(byId(sentBack.tree, "biz-rejected")), /Chanlytics sends the registration back to the carriers for you/);
  assert.ok(byId(sentBack.tree, "biz-save"), "and saving the corrections is still theirs");

  // Every other state keeps the button it had.
  globalThis.window.__businessRecord = api({ ok: true, record, path: "standard", problems: {} });
  const fresh = mount({ line: { id: LINE, sms_state: "none" }, flash: () => {} });
  await fresh.flush();
  assert.ok(byId(fresh.tree, "biz-file"));
  assert.equal(byId(fresh.tree, "biz-rejected"), null);
});

test("a filing already with the carriers says so, because it cannot be withdrawn", async () => {
  globalThis.window.__businessRecord = api({ ok: true, record: soleProp(), path: "sole_proprietor", problems: {} });
  const page = mount({ line: { id: LINE, sms_state: "active", reg_sole_prop: true }, flash: () => {} });
  await page.flush();
  await page.act(byId(page.tree, "biz-path-change"));
  const said = textOf(byId(page.tree, "biz-fork"));
  assert.match(said, /already filed/, "an owner about to change their answer is told what that costs");
  assert.match(said, /second filing/);
  // Never said when nothing is filed: a warning that is always on is furniture.
  globalThis.window.__businessRecord = api({ ok: true, record: soleProp(), path: "sole_proprietor", problems: {} });
  const fresh = mount({ line: { id: LINE, sms_state: "none" }, flash: () => {} });
  await fresh.flush();
  await fresh.act(byId(fresh.tree, "biz-path-change"));
  assert.doesNotMatch(textOf(byId(fresh.tree, "biz-fork")), /already filed/);
});

test("only an owner answers it", async () => {
  globalThis.window.canDo = () => false;
  try {
    globalThis.window.__businessRecord = api({ ok: true, record: null, path: null, problems: {} });
    const page = mount({ line: null, flash: () => {} });
    await page.flush();
    assert.equal(byId(page.tree, "biz-path-standard"), null, "no answer to press");
    assert.match(textOf(page.tree), /An owner answers this/);
    // The limits stay visible: somebody reading the page should see what the
    // workspace is choosing between, even where they cannot choose it.
    assert.ok(byId(page.tree, "biz-limits"));
  } finally {
    globalThis.window.canDo = () => true;
  }
});

test("one validator, three writers", () => {
  // The form checks so the owner is not left guessing; the route checks because
  // the form is not the only caller; the filing checks because a fee is about
  // to be spent. Three moments, one list of what each registration needs.
  const route = readCode("apps/dashboard/app/api/v1/business-record/route.ts");
  assert.ok(route.includes("businessRecordProblems(record, path)"));
  assert.ok(route.includes('registrationPathOf(record) || "standard"'), "derived only when the caller did not say");
  assert.ok(route.includes("record, path }, 20_000)"), "and the path travels with the record to the door that writes it");

  // The door that writes it is run in lines-door.test.mjs: `record` refuses the
  // row it is about to write in the owner's words, stores a sole proprietor
  // with no tax id, and holds a caller that says "standard" to it.
  const filing = readCode("apps/edge/lib/a2p.ts");
  assert.ok(filing.includes("businessRecordProblems(o.record, path, { ourNumbers })"));
  assert.ok(filing.indexOf("businessRecordProblems(o.record") < filing.indexOf("const send = async"), "checked before a single call is made");
  assert.ok(!readRaw("packages/channels/src/a2p.ts").includes("whatSoleProprietorNeeds"), "and the second list it used to keep is gone, not deprecated");
});

test("an incomplete sole-proprietor record spends nothing", async () => {
  // Behaviour, not a source scan: the preflight has to return before the first
  // request, because the first request is the one that starts costing money.
  const env = { ...process.env };
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "token";
  process.env.TWILIO_PRIMARY_PROFILE_SID = "BUprimary";
  process.env.LEAD_TO = "platform@chanlytics.com";
  const fetched = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (...a) => { fetched.push(a[0]); throw new Error("the filing must not reach the provider"); };
  try {
    const line = { id: LINE, tenant_id: TENANT, e164: "+19296566623", sms_state: "needs_record", messaging_service_sid: "MG1", facts: {} };
    const rows = [{ ...line }];
    const db = fakeDb({ lines: rows });
    const out = await registerLine(db, {
      line,
      // Their own mobile is missing, which is the one thing this registration
      // cannot proceed without: the carriers text a code to it.
      record: soleProp({ contact_phone: "" }),
      workspaceName: "Harbor Moving", optInUrl: "https://x/yes", privacyUrl: "https://x/privacy", termsUrl: "https://x/terms", mock: false,
    });
    assert.equal(out.ok, false);
    assert.equal(out.error, "sole_proprietor_incomplete");
    assert.equal(out.smsState, "needs_record", "and it is the owner's to fix, so the row says waiting on you");
    assert.deepEqual(fetched, [], "nothing left for the provider");
    const row = rows[0];
    assert.equal(row.sms_state, "needs_record");
    assert.match(row.last_error, /Your mobile is needed/, "in the owner's words, on the row the page reads");
  } finally {
    globalThis.fetch = realFetch;
    process.env = env;
  }
});

test("which registration was filed is remembered, not re-derived", () => {
  // A sole proprietor who incorporates and types their new tax id would read
  // back as a standard brand while the carriers still hold the narrow one —
  // promising throughput the line does not have, which is worse than silence.
  const sql = readRaw("supabase/migrations/00090_which_registration_was_filed.sql");
  assert.match(sql, /add column if not exists reg_sole_prop boolean not null default false/);
  const filing = readCode("apps/edge/lib/a2p.ts");
  assert.ok(filing.includes('reg_sole_prop: brandTypeFor(record) === "SOLE_PROPRIETOR"'), "written with reg_mock, at the moment of filing");
  assert.ok(filing.indexOf("reg_sole_prop:") < filing.indexOf("const result = await runA2PSaga"), "before the saga runs, like every other filing fact");

  // And it survives BOTH mappers. Selecting it in one and not the other is
  // exactly how the campaign-status defect shipped inert.
  assert.ok(readCode("apps/edge/lib/lines.ts").includes("reg_sole_prop: r.reg_sole_prop,"));
  const dash = readCode("apps/dashboard/src/server/lines.ts");
  assert.ok(dash.includes("reg_sole_prop, whatsapp_state"), "REGRESSION: a column the page needs must be in LINE_COLUMNS or it is always undefined");
  assert.ok(dash.includes("reg_sole_prop: r.reg_sole_prop,"));
});

test("a working sole-proprietor line says what it can do, on both surfaces", () => {
  const line = { id: LINE, e164: "+19296566623", kind: "own", provider: "twilio", area_code: 929, voice_state: "answering", sms_state: "active", whatsapp_state: "none", port_state: "none", forwarding_state: "none", step: null, last_error: null, state_since: "2026-09-09T12:00:00Z", created_at: "2026-09-01T12:00:00Z" };
  // The standard line says nothing about a ceiling, because it has none.
  assert.equal(textingWords({ ...line }).sentence, "Texting is on.");
  assert.ok(!smsStateRow({ ...line }, Date.parse(line.state_since) + 1000).sentence.includes("sole-proprietor"));
  // The narrow one says it in the same breath as the good news. The moment it
  // bites is a broadcast that trickles out over minutes, and by then there is
  // nowhere in the product that explains why.
  const sp = { ...line, reg_sole_prop: true };
  assert.ok(textingWords(sp).sentence.startsWith("Texting is on."));
  assert.ok(textingWords(sp).sentence.includes(SOLE_PROP_CEILING_SENTENCE));
  assert.equal(textingWords(sp).done, true, "it IS on: there is nothing left for the owner to do");
  const row = smsStateRow(sp, Date.parse(line.state_since) + 1000);
  assert.equal(row.state, "connected");
  assert.ok(row.sentence.includes(SOLE_PROP_CEILING_SENTENCE), "the same words on Integrations as on Setup");
  // One clause, one source of numbers: what is promised before filing and what
  // is stated after cannot drift.
  assert.ok(SOLE_PROP_CEILING_SENTENCE.includes(String(SOLE_PROP_LIMITS.messagesPerSecond)));
});
