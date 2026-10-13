/**
 * A save of the business on record says what it moved and what the carriers hold (the wiring's second audit, X4-3).
 *
 * The record is filed with the carriers and shown on the business's own page. Before this, every save said "The carriers
 * see this when you file", whether nothing was filed, a filing was under review, or the carriers had long held the old
 * name: an owner who renamed the business after a filing was told the carriers would see the new name, and they would
 * not. Now the edge compares the save with what was on record, reads where the workspace's filing stands across its
 * lines, and keeps the name its brand was filed under; contracts turns that into the sentence, and the route passes it
 * on. What is proved here runs the rules and the dashboard's route over a stand-in edge; the edge's own door is run in
 * lines-door.test.mjs, the form in registration-path.test.mjs.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import {
  changedRecordFields,
  emptyBusinessRecord,
  isPublishedFact,
  publishesBusinessPage,
  recordFilingOf,
  recordSavedOf,
  recordSavedWords,
  SCHEMA_SETS,
} from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
// The dashboard knocks on the edge only with its secret; what answers is the stand-in below.
process.env.EDGE_URL = "https://edge.example";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const route = await import(at("apps/dashboard/app/api/v1/business-record/route.ts"));
beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RECORD = {
  ...emptyBusinessRecord({ websiteUrl: "https://harbormoving.example", email: "ada@example.com" }),
  legal_name: "Harbor Moving LLC",
  about:
    "A moving company in Brooklyn: homes and small offices across New York, packing and storage. Customers book a free estimate and pay per move.",
  ein: "12-3456789",
  street: "193 Jamaica Ave",
  city: "Brooklyn",
  region: "NY",
  postal_code: "11207",
  contact_first_name: "Ada",
  contact_last_name: "Lovelace",
  contact_email: "ada@example.com",
  contact_phone: "+19175550123",
};

/* ------------------------------------ the rules ------------------------------------ */

test("what moved is said by column, in the form's order: blank and missing are one, spaces around a value are nothing", () => {
  assert.deepEqual(changedRecordFields(RECORD, { ...RECORD }), []);
  assert.deepEqual(changedRecordFields(RECORD, { ...RECORD, legal_name: "  Harbor Moving LLC " }), []);
  assert.deepEqual(changedRecordFields({ ...RECORD, trade_name: null }, { ...RECORD, trade_name: "" }), []);
  assert.deepEqual(
    changedRecordFields(RECORD, {
      ...RECORD,
      contact_phone: "+19175550199",
      city: "Queens",
      legal_name: "Harbor Movers",
    }),
    ["legal_name", "city", "contact_phone"],
  );
  assert.equal(isPublishedFact("city"), true);
  for (const never of [
    "ein",
    "contact_phone",
    "contact_first_name",
    "contact_last_name",
    "business_type",
    "updated_at",
  ])
    assert.equal(isPublishedFact(never), false, never);
});

test("where a filing stands, for every state a line can be in: a rehearsal is none, a failed filing is what its brand says where that is known, and several lines answer their strongest", () => {
  const expected = {
    none: "none",
    needs_record: "none",
    otp_waiting: "in_review",
    registering: "in_review",
    approved: "in_review",
    hosting: "in_review",
    active: "on_file",
    rejected: "sent_back",
    failed: "stopped",
  };
  assert.deepEqual(Object.keys(expected).sort(), [...SCHEMA_SETS["lines.sms_state"]].sort(), "every state, said");
  for (const [state, filing] of Object.entries(expected))
    assert.equal(recordFilingOf([{ sms_state: state }]), filing, state);
  for (const state of SCHEMA_SETS["lines.sms_state"])
    assert.equal(recordFilingOf([{ sms_state: state, reg_mock: true }]), "none", `a rehearsal ${state} is none`);
  assert.equal(recordFilingOf([{ sms_state: "failed", brand: true }]), "on_file", "a brand made is a brand held");
  assert.equal(recordFilingOf([{ sms_state: "failed", brand: false }]), "none", "none made, nothing went to them");
  // A held campaign's filing the pre-flight refused leaves the line needs_record with its brand at the carriers (review
  // of X4-3): the brand is held, whatever the line says of the rest.
  assert.equal(recordFilingOf([{ sms_state: "needs_record", brand: true }]), "on_file");
  assert.equal(
    recordFilingOf([{ sms_state: "registering", brand: true }]),
    "in_review",
    "a brand under review is that",
  );
  assert.equal(recordFilingOf([{ sms_state: "made_up" }, { sms_state: null }]), "none");
  assert.equal(recordFilingOf([]), "none");
  assert.equal(recordFilingOf([{ sms_state: "registering" }, { sms_state: "active" }]), "on_file");
  assert.equal(recordFilingOf([{ sms_state: "rejected" }, { sms_state: "registering" }]), "sent_back");
});

test("the words a save shows, for each standing, with and without a change to what the public page shows", () => {
  const saved = (filing, changed, filed_name = null) => ({ first: false, changed, filing, filed_name });
  const pub = ["city"];
  const own = ["contact_phone"];
  const page = "Saved. Your public page shows it now";
  assert.equal(recordSavedWords(null), "Saved.");
  assert.equal(
    recordSavedWords({ first: true, changed: [], filing: "none", filed_name: null }),
    `${page}, and the carriers see it when you file.`,
  );
  assert.equal(recordSavedWords(saved("on_file", [])), "Saved. Nothing in it had changed.");
  assert.equal(recordSavedWords(saved("none", pub)), `${page}, and the carriers see it when you file.`);
  assert.equal(recordSavedWords(saved("none", own)), "Saved. The carriers see it when you file.");
  assert.equal(
    recordSavedWords(saved("in_review", pub, "Harbor Moving LLC")),
    `${page}; the carriers are still reviewing “Harbor Moving LLC” as you filed it.`,
  );
  assert.equal(recordSavedWords(saved("in_review", own)), "Saved. The carriers are still reviewing what you filed.");
  assert.equal(
    recordSavedWords(saved("on_file", pub, "Harbor Moving LLC")),
    `${page}; the carriers still hold “Harbor Moving LLC” as you filed it.`,
  );
  assert.equal(recordSavedWords(saved("on_file", own)), "Saved. The carriers still hold what you filed.");
  assert.equal(
    recordSavedWords(saved("sent_back", pub)),
    `${page}, and Chanlytics sends your corrections to the carriers for you, at no cost.`,
  );
  assert.equal(
    recordSavedWords(saved("sent_back", own)),
    "Saved. Chanlytics sends your corrections to the carriers for you, at no cost.",
  );
  assert.equal(recordSavedWords(saved("stopped", pub)), `${page}.`);
  assert.equal(recordSavedWords(saved("stopped", own)), "Saved.");
});

test("the save's answer is read off the edge's: unknown columns dropped, and nothing from an edge that does not say, or says a standing nobody declared", () => {
  assert.deepEqual(
    recordSavedOf({
      legal_name: "x",
      first: false,
      changed: ["city", "nonsense", 3],
      filing: "in_review",
      filed_name: " Harbor ",
    }),
    { first: false, changed: ["city"], filing: "in_review", filed_name: "Harbor" },
  );
  assert.equal(recordSavedOf({ legal_name: "x", path: "standard" }), null, "an edge from before it");
  assert.equal(recordSavedOf({ first: false, changed: [], filing: "filed" }), null);
  assert.equal(recordSavedOf({ first: false, changed: [], filing: null }), null, "lines that could not be read");
  assert.equal(recordSavedOf(null), null);
  assert.equal(recordSavedOf({ first: true, changed: [], filing: "none", filed_name: "  " }).filed_name, null);
});

test("the page publishes once the record names the business and where it is", () => {
  assert.equal(publishesBusinessPage(RECORD), true);
  for (const k of ["legal_name", "street", "city"]) {
    assert.equal(publishesBusinessPage({ ...RECORD, [k]: "" }), false, k);
    assert.equal(publishesBusinessPage({ ...RECORD, [k]: "   " }), false, `${k} as spaces`);
  }
  assert.equal(publishesBusinessPage(null), false);
});

/* ------------------------------------ the route ------------------------------------ */

/** The edge's answer to the record op: what the stand-in says next, and every knock it heard. */
const edge = { next: null, heard: [] };
globalThis.fetch = async (url, init = {}) => {
  edge.heard.push([String(url), JSON.parse(init.body ?? "{}")]);
  return new Response(JSON.stringify(edge.next), { status: 200, headers: { "content-type": "application/json" } });
};

const ownerCtx = () => {
  const tables = {
    memberships: [
      { user_id: "u1", tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01" },
    ],
    lines: [],
  };
  setServiceClient(fakeDb(tables));
  return { supabase: fakeDb(tables), userId: "u1", email: "ada@example.com", aal: "aal2", params: {} };
};
const put = (body) =>
  new Request(`http://localhost/api/v1/business-record?workspace=${A}`, { method: "PUT", body: JSON.stringify(body) });

test("the route passes on what the edge said of the save, and says nothing where the edge did not", async () => {
  edge.heard = [];
  edge.next = {
    ok: true,
    record: {
      legal_name: "Harbor Movers LLC",
      path: "standard",
      first: false,
      changed: ["legal_name"],
      filing: "in_review",
      filed_name: "Harbor Moving LLC",
    },
  };
  const out = await route.PUT.run(
    put({ record: { ...RECORD, legal_name: "Harbor Movers LLC" }, path: "standard" }),
    ownerCtx(),
  );
  assert.deepEqual(out.saved, {
    first: false,
    changed: ["legal_name"],
    filing: "in_review",
    filed_name: "Harbor Moving LLC",
  });
  assert.equal(out.record.legal_name, "Harbor Movers LLC");
  assert.match(edge.heard[0][0], /\/api\/admin\/lines$/);
  assert.equal(edge.heard[0][1].op, "record");

  // An edge deployed before it: the save lands, and the page says only that it did.
  edge.next = { ok: true, record: { legal_name: "Harbor Moving LLC", path: "standard" } };
  assert.equal((await route.PUT.run(put({ record: RECORD, path: "standard" }), ownerCtx())).saved, null);
});
