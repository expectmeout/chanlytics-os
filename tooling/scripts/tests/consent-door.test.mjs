/**
 * Consent as a recorded fact.
 *
 * A marketing message on WhatsApp needs the customer's yes, and the only yes
 * the product could record was a customer texting START. Now the person who
 * heard it at the desk or on the phone can record it: one definer door, a
 * ledger verb, a source that says how, the "Can receive offers" list, and a
 * profile control that will not write a yes until it knows how it was given.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONSENT_RESET_SOURCE, CONSENT_SOURCES, DECISION_VERBS, PEOPLE_LISTS, consentSourceLabel } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

test("the door: owner or operator, the three columns together, the ingest's own event, nothing for anon", () => {
  const m = readRaw("supabase/migrations/00043_consent_door.sql");
  assert.ok(m.includes("create or replace function public.set_contact_consent("));
  assert.ok(m.includes("security definer"));
  assert.ok(m.includes("v_user   uuid := auth.uid();"), "the caller is auth.uid(), never a parameter");
  assert.ok(m.includes("if v_tenant is null or not public.is_acting_member(v_tenant) then"), "viewers and strangers read as not found");
  assert.ok(m.includes("set consent = p_consent, dnc = v_dnc,"), "consent and dnc move together, as the ingest moves them");
  assert.ok(m.includes("'contact.consent_changed'"), "the same event the ingest writes");
  assert.ok(m.includes("revoke execute on function public.set_contact_consent(uuid, text, text, text) from public, anon;"));
  assert.ok(m.includes("grant execute on function public.set_contact_consent(uuid, text, text, text) to authenticated;"));
  assert.ok(m.includes("'consent_change'") && DECISION_VERBS.includes("consent_change"), "the ledger knows the verb on both sides");
});

test("sources: four a person can pick, one reset that is never offered, words for each", () => {
  assert.deepEqual(CONSENT_SOURCES.map((s) => s.id), ["in_person", "phone", "form", "customer_message"]);
  assert.equal(CONSENT_RESET_SOURCE, "operator");
  assert.equal(consentSourceLabel("in_person"), "In person");
  assert.equal(consentSourceLabel("customer_message"), "Their own message");
  assert.equal(consentSourceLabel("operator"), null, "the reset is not a way of hearing an answer");
  assert.equal(consentSourceLabel(null), null);
  assert.equal(consentSourceLabel("import"), "import", "an unknown source is shown as itself, never hidden");
});

test("the offers list is exactly the people who said yes, and sits beside the opted-out", () => {
  const offers = PEOPLE_LISTS.find((l) => l.id === "opted_in");
  assert.equal(offers.label, "Can receive offers");
  assert.equal(offers.test({ consent: { state: "opted_in" } }), true);
  assert.equal(offers.test({ consent: { state: "unknown" } }), false, "not asked is not a yes");
  assert.equal(offers.test({ consent: { state: "opted_out" } }), false);
  assert.ok(PEOPLE_LISTS.findIndex((l) => l.id === "opted_in") < PEOPLE_LISTS.findIndex((l) => l.id === "opted_out"));
  assert.ok(readCode("apps/dashboard/src/legacy/pages/clients-a.jsx").includes('opted_in: "Said yes to offers by WhatsApp'), "the rail explains the list");
});

test("the route: operator or owner, a yes or a no needs its source, the reset needs none, the ledger keeps who and how", () => {
  const r = readCode("apps/dashboard/app/api/v1/contacts/[id]/consent/route.ts");
  assert.ok(r.includes('requireRole(member, "operator");'), "the front desk records answers");
  assert.ok(r.includes('takeRate(ctx.userId, "consent");'));
  assert.ok(r.includes('const source = consent === "unknown" ? CONSENT_RESET_SOURCE : body?.source;'));
  assert.ok(r.includes('ctx.supabase.rpc("set_contact_consent", {'), "the session client, so auth.uid() inside the door is the caller");
  assert.ok(r.includes('recordDecision(ctx, contact.tenant_id, "contact", id, "consent_change", {'));
  assert.ok(readCode("apps/dashboard/src/server/rate-limit.ts").includes('consent: { limit: 60, windowMs: 60_000, noun: "consent changes" }'));
});

test("the page: the control asks how before it writes, the bridge carries it, a STOP is not undone by the desk", () => {
  const b = readCode("apps/dashboard/src/legacy-bridge/people-detail.ts");
  assert.ok(b.includes("window.__setPersonConsent = setPersonConsent;") && b.includes("window.__consentSources = CONSENT_SOURCES;"));
  assert.ok(b.includes("/consent`"));
  const p = readCode("apps/dashboard/src/legacy/pages/client-profile.jsx");
  assert.ok(p.includes('data-testid="consent-control"') && p.includes('data-testid="consent-how"'));
  assert.ok(p.includes('window.__ME.role === "operator"'), "operators record answers too");
  assert.ok(p.includes('if (p.consent.state !== "unknown") recordConsent("unknown", null);'), "the reset writes nothing when there is nothing to reset");
  assert.ok(p.includes("Record a yes only if they have asked again themselves."), "a STOP is not undone by the desk");
});
