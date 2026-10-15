/**
 * A workspace that stopped stops inviting customers (the wiring's second audit, lane R12: X4-1 and X4-7).
 *
 * A paused workspace -- billing stopped it, or a person did, or its Stripe plan is in a state that stops the receptionist
 * -- kept every way to say yes on its public pages: the sign-up page's buttons and code, the paper form, the desk sign,
 * and a business page saying it "answers its customers by phone, on WhatsApp and by text". Nobody answers on its behalf,
 * and a yes taken then is refused its confirmation. Now one rule (contracts openToCustomersOf) says whether it is open,
 * paused or ended: a paused workspace's pages stay readable, for the carriers' re-vet of the filing that names them, and
 * ask nobody for a yes; an ended one's are Not found (X4-2).
 *
 * And one load reads a workspace's public facts (packages/db publicWorkspaceBySlug): every read that fails throws, where a
 * failed read of the business on record used to point the sign-up page's policy links at Chanlytics' own pages, and a
 * failed read of the configuration or the channels published /b with no services or no phone.
 *
 * And what the business's own page shows of the record is its published columns (contracts published-facts.ts, X4-4),
 * each one drawn and none other.
 *
 * The real readers run over a database in memory, and the real pages are drawn from their view models.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
// tsx compiles the dashboard's JSX to React.createElement; each test file runs in its own process.
globalThis.React ??= (await import("react")).default;
const C = await import("@chanlytics/contracts");
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const { consentPageFor } = await import(at("apps/dashboard/src/server/public/consent-page.ts"));
const { businessPageFor } = await import(at("apps/dashboard/src/server/public/business-page.ts"));
const { SignUpPage } = await import(at("apps/dashboard/src/yes/SignUpPage.tsx"));
const { PaperForm } = await import(at("apps/dashboard/src/yes/PaperForm.tsx"));
const { DeskSign } = await import(at("apps/dashboard/src/yes/DeskSign.tsx"));
const { BusinessPublicPage } = await import(at("apps/dashboard/src/yes/BusinessPublicPage.tsx"));
const { TextingTerms } = await import(at("apps/dashboard/src/yes/TextingTerms.tsx"));

/** Every element of a drawn page, function components called through. */
const nodes = (n, out = []) => {
  if (Array.isArray(n)) {
    for (const k of n) nodes(k, out);
    return out;
  }
  if (n == null || typeof n !== "object") return out;
  if (typeof n.type === "function") return nodes(n.type(n.props), out);
  out.push(n);
  nodes(n.props?.children, out);
  return out;
};
const textOf = (n) =>
  n == null || typeof n === "boolean"
    ? ""
    : typeof n !== "object"
      ? String(n)
      : Array.isArray(n)
        ? n.map(textOf).join("")
        : typeof n.type === "function"
          ? textOf(n.type(n.props))
          : textOf(n.props?.children);
const byTestId = (tree, id) => nodes(tree).find((n) => n.props?.["data-testid"] === id) ?? null;
const ids = (tree) => nodes(tree).flatMap((n) => (n.props?.["data-testid"] ? [n.props["data-testid"]] : []));

const NAME = "Harbor Moving";
/** The business on record, every column the table has. */
const RECORD = (tenant_id) => ({
  tenant_id,
  legal_name: "Harbor Moving LLC",
  trade_name: null,
  street: "1 Example Street",
  street_secondary: null,
  city: "Miami",
  region: "FL",
  postal_code: "33101",
  country: "US",
  contact_email: "owner@example.com",
  contact_first_name: "Ada",
  contact_last_name: "Lovelace",
  contact_phone: "+13055550199",
  contact_title: "Owner",
  contact_job_position: "CEO",
  website_url: "",
  about: "Moves homes and offices across Miami.",
  industry: "PROFESSIONAL_SERVICES",
  business_type: "Limited Liability Corporation",
  company_type: "private",
  ein: "12-3456789",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
});

/** A receptionist whole enough to parse (a config the schema rejects reads as none), listing one service. */
const BRAIN = {
  business_name: NAME,
  booking_link: "https://book.example.com/harbor",
  system_prompt: "Answer as the front desk: brief, warm, and never a price or a booking over text.",
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
  profile: { services: [{ name: "Local move", duration_min: 240 }] },
};

let made = 0;
/** One workspace's world, under a slug of its own (the reader is a request cache's). */
function world({
  status = "active",
  left_empty_at = null,
  billing = { mode: "stripe", status: "active" },
  record = true,
} = {}) {
  const id = `aaaaaaaa-0000-4000-8000-${String(++made).padStart(12, "0")}`;
  const slug = `harbor-${made}`;
  const tables = {
    tenants: [{ id, name: NAME, slug, status, left_empty_at }],
    billing_accounts: billing ? [{ tenant_id: id, ...billing }] : [],
    // `record`: the business on record, or columns over it (true is it as written above).
    business_records: record ? [{ ...RECORD(id), ...(record === true ? {} : record) }] : [],
    tenant_config: [{ tenant_id: id, config: { brain: BRAIN } }],
    tenant_channels: [
      {
        tenant_id: id,
        kind: "whatsapp",
        status: "active",
        number_e164: "+13055550100",
        created_at: "2026-10-01T00:00:00Z",
      },
      { tenant_id: id, kind: "sms", status: "active", number_e164: "+13055550101", created_at: "2026-10-01T00:00:00Z" },
      {
        tenant_id: id,
        kind: "voice",
        status: "active",
        number_e164: "+13055550102",
        created_at: "2026-10-01T00:00:00Z",
      },
    ],
  };
  const db = fakeDb(tables);
  setServiceClient(db);
  return { slug, db };
}

/** Every page of a world, drawn as each route draws it. */
async function pagesOf(slug) {
  const facts = await consentPageFor(slug);
  const record = await businessPageFor(slug);
  if (!facts) return null;
  const vm = C.consentPageVM(facts);
  const who = record ? C.businessPageVM(record) : null;
  return {
    facts,
    record,
    yes: SignUpPage({
      vm,
      business: who && !who.empty ? who : null,
      qr: vm.qrLink ? "<svg/>" : null,
      slug,
      businessName: facts.businessName,
    }),
    form: PaperForm({
      vm: C.consentFormVM(facts),
      origin: "https://app.chanlytics.com",
      slug,
      businessName: facts.businessName,
    }),
    sign: DeskSign({
      vm: C.deskSignVM(facts),
      qr: C.deskSignVM(facts).qrLink ? "<svg/>" : null,
      host: "app.chanlytics.com",
    }),
    b: record ? BusinessPublicPage({ vm: C.businessPageVM(record) }) : null,
    terms: record ? TextingTerms({ vm: C.textingTermsVM(record) }) : null,
  };
}

test("the one rule: open, paused or ended, by the workspace's own standing and its plan; the model's spend and the public pages read it", () => {
  const { openToCustomersOf, takesSignUps, hasPublicPages, mayUseModels } = C;
  const stripe = (status) => ({ mode: "stripe", status });
  const of = (paused, ended, billing) => openToCustomersOf({ paused, ended, billing });
  assert.equal(of(false, false, stripe("active")), "open");
  assert.equal(of(true, false, stripe("active")), "paused");
  assert.equal(of(false, true, stripe("active")), "ended");
  assert.equal(of(true, true, stripe("active")), "ended", "ended outranks paused");
  for (const s of ["canceled", "unpaid", "incomplete_expired"]) assert.equal(of(false, false, stripe(s)), "paused", s);
  for (const s of ["trialing", "past_due"]) assert.equal(of(false, false, stripe(s)), "open", s);
  assert.equal(of(false, false, { mode: "direct", status: "none" }), "open", "invoiced by hand");
  assert.equal(of(false, false, null), "open", "no plan on record: its own standing alone");
  // The model's spend is the same rule, its table unchanged.
  for (const [mode, status, ws, want] of [
    ["stripe", "active", { paused: false, ended: false }, true],
    ["stripe", "trialing", { paused: false, ended: false }, true],
    ["stripe", "canceled", { paused: false, ended: false }, false],
    ["direct", "none", { paused: false, ended: false }, true],
    ["stripe", "active", { paused: true, ended: false }, false],
    ["stripe", "active", { paused: false, ended: true }, false],
  ])
    assert.equal(mayUseModels(mode, status, ws), want, `${mode} ${status} ${JSON.stringify(ws)}`);
  assert.equal(takesSignUps(null), true, "not read: the page as it was");
  assert.equal(takesSignUps(undefined), true);
  assert.equal(takesSignUps("paused"), false);
  assert.equal(hasPublicPages("test", "open"), false, "a fixture has no pages");
  assert.equal(hasPublicPages("active", "ended"), false, "an ended workspace has none");
  assert.equal(hasPublicPages("paused", "paused"), true, "a paused one keeps them, for the carriers' re-vet");
});

test("an open workspace's pages ask for a yes: every way, the code, the paper form and the desk sign, and its page says it answers its customers", async (t) => {
  t.after(() => setServiceClient(null));
  const { slug } = world();
  const p = await pagesOf(slug);
  assert.equal(p.facts.open, "open");
  const shown = ids(p.yes);
  for (const id of ["yes-way-conversational-sms", "yes-way-marketing-whatsapp", "yes-qr", "yes-paper-link"])
    assert.ok(shown.includes(id), id);
  assert.ok(byTestId(p.form, "form-print-foot"));
  assert.ok(byTestId(p.sign, "desk-sign"));
  assert.match(textOf(byTestId(p.b, "bp-lead")), /answers its customers/);
  assert.equal(byTestId(p.b, "bp-closed"), null);
  assert.equal(byTestId(p.terms, "bt-closed"), null);
  // Who is asking, as a reviewer reads it: the operator and the business, on the page they land on.
  const yes = textOf(p.yes);
  assert.ok(yes.includes("RJ Capital LLC") && yes.includes("193 Jamaica Ave"), "the operator");
  assert.ok(yes.includes(`on behalf of ${NAME}`), "and the business the customer is agreeing to hear from");
  // Nothing to fill in on any of them: a number typed into a box is not consent.
  for (const page of [p.yes, p.form, p.sign, p.b, p.terms])
    assert.ok(!nodes(page).some((n) => n.type === "form" || n.type === "input"), "no field");
});

test("REGRESSION (X4-1): a paused workspace's pages stay readable for the carriers and ask nobody for a yes -- no way to answer, no code, no paper form in use, no sign to print -- and its page no longer says it answers its customers", async (t) => {
  t.after(() => setServiceClient(null));
  const closed = C.notTakingSignUps(NAME);
  for (const [why, over] of [
    ["paused", { status: "paused" }],
    ["its plan stopped", { billing: { mode: "stripe", status: "canceled" } }],
  ]) {
    const { slug } = world(over);
    const p = await pagesOf(slug);
    assert.equal(p.facts.open, "paused", why);
    const shown = ids(p.yes);
    assert.ok(
      shown.includes("yes-ask-conversational") && shown.includes("yes-terms-conversational"),
      `${why}: the asks and their terms stay`,
    );
    assert.ok(!shown.some((id) => id.startsWith("yes-way-")), `${why}: no way to answer`);
    assert.ok(!shown.includes("yes-qr") && !shown.includes("yes-paper-link"), `${why}: no code, no paper form`);
    assert.ok(!textOf(p.yes).includes("Say yes"), why);
    assert.ok(textOf(p.yes).includes(closed), why);
    assert.equal(C.consentPageVM(p.facts).qrLink, null);
    assert.ok(textOf(p.form).includes(C.notTakingSignUps(NAME, "this form is not in use")), why);
    assert.ok(byTestId(p.form, "form-conversational"), `${why}: the boxes stay, for the carriers to read`);
    assert.equal(byTestId(p.form, "form-print-foot"), null, `${why}: not offered for printing`);
    assert.ok(byTestId(p.sign, "desk-sign-empty"), why);
    // The paused sentence itself: the sign's other empty line (no WhatsApp number) ends the same way, and is false here.
    assert.ok(textOf(p.sign).includes(C.notTakingSignUps(NAME, "there is no sign to print")), why);
    assert.doesNotMatch(textOf(p.sign), /no WhatsApp number/, why);
    assert.doesNotMatch(textOf(byTestId(p.b, "bp-lead")), /answers its customers/, why);
    assert.equal(textOf(byTestId(p.b, "bp-closed")), C.notTakingSignUps("Harbor Moving LLC"), why);
    assert.equal(textOf(byTestId(p.terms, "bt-closed")), C.notTakingSignUps("Harbor Moving LLC"), why);
    assert.ok(!textOf(p.b).includes("To say yes"), `${why}: the sign-up page is offered to read`);
  }
});

test("an ended workspace and a fixture have no pages (Not found, unindexed); a workspace with no business on record has no /b, and its sign-up page links Chanlytics' own policies", async (t) => {
  t.after(() => setServiceClient(null));
  for (const over of [{ left_empty_at: "2026-10-01T00:00:00Z", status: "paused" }, { status: "test" }]) {
    const { slug } = world(over);
    assert.equal(await consentPageFor(slug), null, JSON.stringify(over));
    assert.equal(await businessPageFor(slug), null, JSON.stringify(over));
    assert.deepEqual(C.consentPageMetadata(null).robots, { index: false, follow: false });
  }
  const { slug } = world({ record: false });
  assert.equal(await businessPageFor(slug), null);
  const facts = await consentPageFor(slug);
  assert.equal(facts.businessPage, false);
  assert.deepEqual(C.consentPageVM(facts).links, { privacy: "/privacy", terms: "/terms" });
});

test("REGRESSION (X4-7): a read that fails fails the page -- the sign-up page no longer links Chanlytics' policies for want of the business on record, nor /b drops its services or its phone", async (t) => {
  t.after(() => setServiceClient(null));
  for (const [table, words] of [
    ["business_records", /reading the business on record/],
    ["tenant_config", /reading the workspace's configuration/],
    ["tenant_channels", /reading the workspace's channels/],
    ["billing_accounts", /reading the workspace's billing/],
    ["tenants", /reading the workspace/],
  ]) {
    const faulted = worldFaulted(table);
    await assert.rejects(consentPageFor(faulted), words, `the sign-up page: ${table}`);
    await assert.rejects(businessPageFor(faulted), words, `/b: ${table}`);
  }
});

/** A world whose read of one table is refused, by its slug. */
function worldFaulted(table) {
  const id = `bbbbbbbb-0000-4000-8000-${String(++made).padStart(12, "0")}`;
  const slug = `faulted-${made}`;
  const tables = {
    tenants: [{ id, name: NAME, slug, status: "active", left_empty_at: null }],
    billing_accounts: [{ tenant_id: id, mode: "stripe", status: "active" }],
    business_records: [RECORD(id)],
    tenant_config: [{ tenant_id: id, config: {} }],
    tenant_channels: [
      { tenant_id: id, kind: "sms", status: "active", number_e164: "+13055550101", created_at: "2026-10-01T00:00:00Z" },
    ],
  };
  setServiceClient(fakeDb(tables, { [`${table}.select`]: { message: "statement timeout" } }));
  return slug;
}

test("the business's own page and its terms show the published columns of the record and none other: each column a marker of its own, read by the real reader and drawn by the real pages (the wiring's second audit, X4-4)", async (t) => {
  t.after(() => setServiceClient(null));
  const columns = Object.keys(C.emptyBusinessRecord());
  const marker = (i) => `zq${i}qz`;
  const record = Object.fromEntries(
    columns.map((c, i) => [c, c === "website_url" ? `https://${marker(i)}.example` : marker(i)]),
  );
  const { slug } = world({ record });
  const pages = await pagesOf(slug);
  assert.ok(pages.record, "the page publishes");
  const said = [
    JSON.stringify(C.businessPageVM(pages.record)),
    JSON.stringify(C.textingTermsVM(pages.record)),
    textOf(pages.b),
    textOf(pages.terms),
  ]
    .join(" ")
    .toLowerCase();
  for (const [i, c] of columns.entries())
    assert.equal(
      said.includes(marker(i)),
      C.isPublishedFact(c),
      `${c} ${C.isPublishedFact(c) ? "shown" : "never shown"}`,
    );
  // And the form marks exactly those boxes, on both registrations.
  for (const p of C.REGISTRATION_PATHS)
    for (const f of C.businessFieldsFor(p)) assert.equal(f.published, C.isPublishedFact(f.name), `${p} ${f.name}`);
});

test("one load: each reader's call reads each table once, only selects, and the business on record's public columns, never the EIN or the contact's own phone; its links stay on this site", async (t) => {
  t.after(() => setServiceClient(null));
  const { slug, db } = world();
  const facts = await businessPageFor(slug);
  // And whether the business has a tax id, asked as a yes or no (00439 sole_proprietor_of): never the tax id itself.
  const asked = db.seen.map((q) => (q.rpc ? `rpc.${q.rpc}` : `${q.table}.${q.op}`));
  assert.deepEqual([...asked].sort(), [
    "billing_accounts.select",
    "business_records.select",
    "rpc.sole_proprietor_of",
    "tenant_channels.select",
    "tenant_config.select",
    "tenants.select",
  ]);
  const recordRead = db.seen.find((q) => q.table === "business_records");
  assert.ok(recordRead.columns && recordRead.columns !== "*", "not the whole row");
  assert.ok(!/ein|contact_phone|contact_first_name/.test(recordRead.columns), recordRead.columns);
  // Exactly the columns contracts says the page may show, and no others (X4-4; packages/db's type test holds the type).
  assert.deepEqual(
    recordRead.columns
      .split(",")
      .map((c) => c.trim())
      .sort(),
    Object.keys(C.emptyBusinessRecord())
      .filter((c) => C.isPublishedFact(c))
      .sort(),
  );
  assert.deepEqual(
    [facts.optInUrl, facts.privacyUrl, facts.termsUrl],
    [`/yes/${slug}`, `/b/${slug}`, `/b/${slug}/terms`],
    "relative: the same site by construction (30907)",
  );
  assert.deepEqual(
    facts.services,
    [{ name: "Local move", durationMin: 240, priceNote: null }],
    "the receptionist's own",
  );
  assert.equal(facts.publicPhoneE164, "+13055550102", "voice first, the number on their door");
});
