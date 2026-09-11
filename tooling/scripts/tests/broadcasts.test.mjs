/**
 * Broadcasts: one approved template to the people who said yes.
 *
 * The first honest campaign. A broadcast names a template Meta approved,
 * the values for its variables and an audience crossed with who said yes;
 * the recipients are enrolled when it is made, the job sends in batches and
 * re-checks each person at the wire, and its numbers are its messages'
 * statuses. This file pins the rules by execution (contracts) and by source
 * (the door, the job, the routes, the page).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  BROADCAST_CHUNK, DECISION_SUBJECTS, DECISION_VERBS, EVERYONE_LABEL, PEOPLE_LISTS,
  broadcastName, cleanParam, eligibleFor, emptyAudienceRefusal, mayReceive, renderTemplate, toBroadcastVM, whenLabel,
} from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

const person = (over = {}) => ({
  id: over.id ?? "p1", state: "active", hasChat: true, calls: 0, phone: "+15551230001",
  consent: { state: "opted_in", dnc: false, label: "Opted in", sub: "", source: "in_person", marketing: "opted_in", marketingSource: "in_person", marketingSub: "" },
  ...over,
});

test("the tables: the workspace's, members read, acting members enrol, only the state moves by session, nobody deletes; the ledger knows the verbs", () => {
  const m = readRaw("supabase/migrations/00046_broadcasts.sql");
  assert.ok(m.includes("create table public.broadcasts (") && m.includes("create table public.broadcast_recipients ("));
  assert.ok(m.includes("check (state in ('scheduled', 'sending', 'sent', 'canceled', 'failed'))"));
  assert.ok(m.includes("check (state in ('queued', 'sent', 'skipped', 'failed'))"));
  assert.ok(m.includes("grant update (state) on public.broadcasts to authenticated;"), "a session client cancels and changes nothing else");
  assert.ok(!/grant delete|for delete/.test(m), "a sent broadcast is a record");
  assert.ok(m.includes("and exists (select 1 from public.contacts c where c.id = contact_id and c.tenant_id = broadcast_recipients.tenant_id and c.erased_at is null)"));
  assert.ok(m.includes("'send_broadcast', 'cancel_broadcast'") && m.includes("'channel', 'broadcast'"));
  assert.ok(DECISION_VERBS.includes("send_broadcast") && DECISION_VERBS.includes("cancel_broadcast") && DECISION_SUBJECTS.includes("broadcast"));
});

test("the one predicate: the yes THIS message needs, no do-not-contact, a number", () => {
  assert.equal(mayReceive(person(), "marketing"), true);
  assert.equal(mayReceive(person({ consent: { state: "unknown", dnc: false } }), "marketing"), false, "not asked is not a yes");
  assert.equal(mayReceive(person({ consent: { state: "opted_in", dnc: true } }), "marketing"), false, "the operator's block outranks a yes");
  assert.equal(mayReceive(person({ phone: null }), "marketing"), false, "nowhere to send");
});

test("ONE rule, not a second copy of it: the VM predicate delegates to mayMessageFor", async () => {
  // This function used to restate mayMessageFor's logic by hand, because the two
  // halves of one pipeline hold the person in two different shapes. It duly
  // drifted. This read the source for that reason: two implementations that agree
  // on today's fixtures is exactly the state that produced the defect. So it is
  // run over the rule's WHOLE domain instead -- every consent, every offers answer,
  // do-not-contact either way, both purposes (a missing number is the case above).
  // An implementation that agrees on every input the rule can be given IS the rule,
  // which a sample never shows and a text scan cannot.
  const { mayMessageFor } = await import("@chanlytics/contracts");
  for (const state of ["unknown", "opted_in", "opted_out"]) {
    for (const marketing of ["unknown", "opted_in", "opted_out"]) {
      for (const dnc of [false, true]) {
        for (const purpose of ["conversational", "marketing"]) {
          const vm = person({ consent: { state, dnc, marketing } });
          assert.equal(
            mayReceive(vm, purpose),
            mayMessageFor({ consent: state, dnc, marketing_consent: marketing }, purpose, { proactive: true }).ok,
            `${state}/${marketing}/dnc:${dnc}/${purpose}`,
          );
        }
      }
    }
  }
});

test("THE PURPOSE IS REQUIRED, because a default is what broke this", () => {
  // It defaulted to marketing, described as "the safe answer for a caller that has
  // not thought about it". Every caller but one then failed to think about it, so a
  // `utility` broadcast demanded marketing consent and the live workspace's seven
  // recorded yeses became an audience of zero. A required argument is checked by
  // the compiler at every call site; a default cannot be audited.
  assert.equal(eligibleFor.length, 5, "REGRESSION: a defaulted parameter is not counted in .length");
  assert.equal(mayReceive.length, 2, "REGRESSION: the purpose went back to being optional");
});

test("the refusal names the yes that was actually missing", () => {
  assert.match(emptyAudienceRefusal("marketing"), /offers/i);
  assert.match(emptyAudienceRefusal("conversational"), /yes to messages/i);
  assert.doesNotMatch(emptyAudienceRefusal("conversational"), /said yes to offers/i,
    "a utility refusal must not send the owner to record a consent this message does not need");
});

test("a yes about appointments is not a yes about offers, which is what error 30913 says", () => {
  // THE CHANGE. This file used to state the opposite as doctrine: "the category
  // of the template changes Meta's price and its rules, never ours". The
  // carriers refused a live campaign over it -- "marketing consent was combined
  // with other consents. Marketing consent must be collected separately."
  const appointmentsOnly = person({ consent: { state: "opted_in", dnc: false, marketing: "unknown" } });
  assert.equal(mayReceive(appointmentsOnly, "marketing"), false, "no offer without a yes about offers");
  assert.equal(mayReceive(appointmentsOnly, "conversational"), true, "but their own appointment still reaches them");

  const offersToo = person();
  assert.equal(mayReceive(offersToo, "marketing"), true);
  assert.equal(mayReceive(offersToo, "conversational"), true);

  // Declining offers is not a request to stop hearing about your own visit.
  const noOffers = person({ consent: { state: "opted_in", dnc: false, marketing: "opted_out" } });
  assert.equal(mayReceive(noOffers, "marketing"), false);
  assert.equal(mayReceive(noOffers, "conversational"), true);

  // STOP is not symmetric with that: it stops everything.
  const stopped = person({ consent: { state: "opted_out", dnc: false, marketing: "opted_in" } });
  assert.equal(mayReceive(stopped, "marketing"), false);
  assert.equal(mayReceive(stopped, "conversational"), false);

});

test("an audience is a People list, a list kept by hand, or everyone — each crossed with the predicate", () => {
  const rows = [
    person({ id: "a" }),
    person({ id: "b", state: "quiet" }),
    person({ id: "c", state: "quiet", consent: { state: "unknown", dnc: false, marketing: "unknown" } }),
    person({ id: "d", hasChat: false, calls: 2 }),
  ];
  assert.deepEqual(eligibleFor(rows, "everyone", null, null).map((r) => r.id), ["a", "b", "d"]);
  assert.deepEqual(eligibleFor(rows, "list", "quiet", null).map((r) => r.id), ["b"], "the quiet list, of those who said yes");
  assert.deepEqual(eligibleFor(rows, "list", "phoned_only", null).map((r) => r.id), ["d"]);
  assert.deepEqual(eligibleFor(rows, "list", "no_such_list", null), []);
  assert.deepEqual(eligibleFor(rows, "saved", null, new Set(["c", "d"])).map((r) => r.id), ["d"], "a hand-kept list, of those who said yes");
  assert.deepEqual(eligibleFor(rows, "saved", null, null), []);
  assert.ok(PEOPLE_LISTS.some((l) => l.id === "quiet"));
  assert.equal(EVERYONE_LABEL, "Everyone who said yes");
});

test("the words a person will read, and the values Meta will accept", () => {
  assert.equal(renderTemplate("Hi {{1}}, {{2}} is 20% off at {{3}}.", ["Dani", "Balayage", "Melany's"]), "Hi Dani, Balayage is 20% off at Melany's.");
  assert.equal(renderTemplate("Hi {{1}}, see {{2}}.", ["Dani"]), "Hi Dani, see {{2}}.", "a missing value stays visible, never silently blank");
  assert.equal(renderTemplate(null, []), "");
  assert.equal(cleanParam("  Balayage  "), "Balayage");
  assert.equal(cleanParam("two\nlines"), null);
  assert.equal(cleanParam("tab\there"), null);
  assert.equal(cleanParam("four    spaces"), null);
  assert.equal(cleanParam(""), null);
  assert.equal(cleanParam("x".repeat(1025)), null);
  assert.equal(cleanParam(42), null);
  assert.ok(broadcastName("spring_offer", new Date("2026-09-05T15:00:00")).startsWith("Spring offer · Sep 5"));
});

test("the view model: delivered and read over sent, open while scheduled or sending, progress over enrolled", () => {
  const base = {
    id: "b1", name: "Spring", template_id: "t", template_name: "spring_offer", template_language: "en_US", params: [],
    audience: { kind: "everyone", id: null, label: EVERYONE_LABEL }, state: "sent",
    scheduled_for: "2026-09-05T13:00:00Z", started_at: "2026-09-05T13:00:00Z", finished_at: "2026-09-05T13:02:00Z",
    recipient_count: 10, failure: null, created_at: "2026-09-05T12:50:00Z",
    counts: { queued: 0, sent: 8, skipped: 2, failed: 0, delivered: 6, read: 4, replied: 1 },
  };
  const vm = toBroadcastVM(base, new Date("2026-09-06T10:00:00Z"));
  assert.equal(vm.deliveredPct, 75);
  assert.equal(vm.readPct, 50);
  assert.equal(vm.open, false);
  assert.equal(vm.progress, 1);
  assert.equal(vm.stateLabel, "Sent");
  const sending = toBroadcastVM({ ...base, state: "sending", finished_at: null, counts: { ...base.counts, sent: 3, skipped: 1, queued: 6 } });
  assert.equal(sending.open, true);
  assert.equal(sending.progress, 0.4);
  const fresh = toBroadcastVM({ ...base, state: "scheduled", started_at: null, finished_at: null, counts: { queued: 10, sent: 0, skipped: 0, failed: 0, delivered: 0, read: 0, replied: 0 } });
  assert.equal(fresh.deliveredPct, null, "nothing to divide by yet");
  const now = new Date("2026-09-05T09:00:00");
  assert.ok(whenLabel("2026-09-05T15:30:00", now).startsWith("today "));
  assert.ok(whenLabel("2026-09-06T15:30:00", now).startsWith("tomorrow "));
  assert.ok(/^Sep 12 · /.test(whenLabel("2026-09-12T15:30:00", now)));
});

test("the job: its rules are run (core-broadcast.test.mjs); the adapter still reads what the run needs and writes where it did", () => {
  const h = readCode("packages/jobs/src/handlers.ts");
  assert.ok(h.includes("broadcast_send: broadcastSend,"));
  assert.ok(h.includes(".limit(limit);") && BROADCAST_CHUNK === 25);
  assert.ok(h.includes('.select("meta_status, body_preview, category")'), "the category is selected: it decides which yes the send needs");
  assert.ok(h.includes('.select("id, phone_e164, consent, dnc, marketing_consent, erased_at'), "the person's row still carries what the run needs");
  assert.ok(h.includes('await ctx.schedule("broadcast_send", new Date(), { broadcast_id: id });'), "the next batch is one more row, as this tenant");
  assert.ok(h.includes('kind: "broadcast.sent"'));
});

test("the routes: an approved template, values Meta accepts, an audience crossed with who said yes, enrolled now, scheduled, on the ledger; cancel stops what has not finished", () => {
  const r = readCode("apps/dashboard/app/api/v1/broadcasts/route.ts");
  assert.ok(r.includes('role: "operator",') && r.includes('rate: "broadcast",'));
  // The template, the values, the audience, the number, the assembly and the ledger are run: core-campaigns.test.mjs.
  const a = readCode("apps/dashboard/src/server/campaign-ports.ts");
  assert.ok(a.includes('.select("id, name, language, meta_status, category, variables, body_preview, title")'), "category is selected, or the purpose is always marketing");
  const l = readCode("apps/dashboard/src/server/broadcasts.ts");
  assert.ok(l.includes('if (status === "delivered" || status === "read") c.delivered += 1;'), "delivered comes from the receipts, never from the send");
  assert.ok(readCode("apps/dashboard/src/server/rate-limit.ts").includes('broadcast: { limit: 10, windowMs: 60_000, noun: "broadcasts" }'));
});

test("the surface and the page: Broadcasts is real, fed by the same rules, and the seeded page keeps the demo", async () => {
  const reg = await import(pathToFileURL(path.join(here, "../../../apps/dashboard/src/legacy-bridge/surface-registry.ts")).href);
  assert.equal(reg.SURFACE_STATES.broadcasts, "real");
  assert.equal(reg.ROUTE_SURFACE.broadcasts, "broadcasts");
  const s = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  assert.ok(s.includes('key: "broadcasts",'));
  // BOTH sizes per audience, because there is no one number any more: the chip's
  // count depends on the purpose of the template the composer has selected, which
  // the surface cannot know when it loads. A single count computed here promised an
  // audience the route would then refuse.
  assert.ok(s.includes('conversational: eligibleFor(rows, kind, id, ids, "conversational").length'));
  assert.ok(s.includes('marketing: eligibleFor(rows, kind, id, ids, "marketing").length'));
  assert.ok(s.includes(".map((t) => ({ ...t, purpose: purposeOfTemplate(t.category) }))"), "the purpose is stamped by the bridge, never decided in a .jsx");
  assert.ok(s.includes('.filter((t) => t.channel === "whatsapp" && t.meta_status === "approved")'));
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx").includes("installBroadcasts();"));
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/manifest.ts").includes('import "@/legacy/pages/broadcasts-real.jsx";'));
  assert.ok(readCode("apps/dashboard/src/legacy/pages/broadcasts.jsx").includes("window.BroadcastsSeed = BroadcastsPage;"));
  const p = readCode("apps/dashboard/src/legacy/pages/broadcasts-real.jsx");
  for (const id of ["broadcasts-real", "bc-audience", "bc-template", "bc-no-template", "bc-preview", "bc-send", "bc-nobody", "bc-open", "bc-history"]) {
    assert.ok(p.includes(`data-testid="${id}"`), id);
  }
  // The empty-audience line names WHICH yes is missing and where to record it. It
  // used to say "said yes to offers" for every template, which for a `utility` one
  // sent the owner to record a consent that message does not need.
  assert.ok(p.includes('has said yes to offers yet — that is a separate answer from saying yes to messages'));
  assert.ok(p.includes('purpose === "marketing"'), "the page reads the purpose the bridge stamped, and does not decide it");
  assert.ok(p.includes("const sizeOf = (a) => (a && a.counts ? (a.counts[purpose] || 0) : 0);"), "one place reads the count, for the chosen purpose");
  assert.ok(!/active\.count\b/.test(p), "REGRESSION: a single purpose-blind count is back");
  assert.ok(!/credits|Booked from broadcasts|\$\d/.test(p), "nothing invented: no credits, no revenue");
});

test("the number's health: what WhatsApp said decides what may be sent; nothing reported is said so", async () => {
  const { numberHealth, overLimitRefusal, dailyLimit } = await import("@chanlytics/contracts");
  assert.equal(dailyLimit("TIER_1K"), 1000);
  assert.equal(dailyLimit("tier_250"), 250);
  assert.equal(dailyLimit(null), null);
  assert.equal(dailyLimit("weird"), null);
  const flagged = numberHealth({ quality: "GREEN", event: "FLAGGED", limit: "TIER_1K" });
  assert.equal(flagged.canSend, false);
  assert.equal(flagged.tone, "danger");
  assert.ok(flagged.refusal.includes("flagged"));
  assert.equal(numberHealth({ quality: "RED", event: null, limit: null }).canSend, false);
  const good = numberHealth({ quality: "GREEN", event: null, limit: "TIER_250" });
  assert.equal(good.canSend, true);
  assert.equal(good.tone, "ok");
  assert.ok(good.label.includes("up to 250 new conversations a day"));
  assert.equal(numberHealth({ quality: "YELLOW", event: null, limit: null }).tone, "warn");
  const unknown = numberHealth({ quality: null, event: null, limit: null });
  assert.equal(unknown.canSend, true);
  assert.equal(unknown.tone, "unknown");
  assert.ok(unknown.label.includes("not reported yet"), "nothing reported is said so, never assumed");
  assert.equal(overLimitRefusal(good, 250), null);
  assert.ok(overLimitRefusal(good, 251).includes("up to 250"));
  assert.equal(overLimitRefusal(unknown, 5000), null, "no limit reported means no refusal on the limit");
  assert.equal(numberHealth({ quality: null, event: null, limit: "TIER_UNLIMITED" }).limitPerDay, Infinity);
});

test("the detail: every person on a broadcast, with what happened to them; the send route refuses what the number cannot carry; the thread says which broadcast", () => {
  const d = readCode("apps/dashboard/app/api/v1/broadcasts/[id]/route.ts");
  assert.ok(d.includes("return await getBroadcast(ctx, tenantId, id);"));
  const s = readCode("apps/dashboard/src/server/broadcasts.ts");
  assert.ok(s.includes("contacts(display_name, wa_profile_name, phone_e164)"), "names come with the rows");
  assert.ok(s.includes("replied: !!(r.messages?.conversation_id && replied.has(r.messages.conversation_id)),"));
  // The number's refusals are run: core-campaigns.test.mjs.
  assert.ok(readCode("apps/dashboard/app/api/v1/channels/route.ts").includes("quality: s(\"quality_rating\"),"));
  const sd = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  assert.ok(sd.includes("health: numberHealth({ quality: wa?.quality ?? null, event: wa?.quality_event ?? null, limit: wa?.messaging_limit ?? null }),"));
  assert.ok(sd.includes("heldReasons: HELD_REASONS,"));
  const p = readCode("apps/dashboard/src/legacy/pages/broadcasts-real.jsx");
  for (const id of ["bc-number", "bc-number-refusal", "bc-over-limit", "bc-detail", "bc-person", "bc-open-who"]) assert.ok(p.includes(`data-testid="${id}"`), id);
  assert.ok(p.includes("&& numberOk && !overLimit;"), "the button follows the number too");
  const vm = readCode("packages/contracts/src/viewmodels.ts");
  assert.ok(vm.includes('{ kind: "broadcast" as const, name: String(m.meta.broadcast_name ?? "broadcast") }') && vm.includes('{ kind: "playbook" as const, name: String(m.meta.playbook_name) }'));
  assert.ok(readCode("apps/dashboard/src/legacy/pages/inbox-thread.jsx").includes("`a broadcast (${entry.via.name})`") && readCode("apps/dashboard/src/legacy/pages/inbox-thread.jsx").includes("`the ${entry.via.name} playbook`"), "the thread says which broadcast, or which playbook");
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/broadcast-verbs.ts").includes("window.__refreshBroadcasts = refreshBroadcasts;"));
});

test("getting their yes: an unambiguous phrase the ingest records, a link that opens WhatsApp with it, a QR of that link, and a receptionist that thanks them", async () => {
  const { OPT_IN_PATTERN, OFFERS_OPT_IN_PHRASES, optInLink } = await import("@chanlytics/contracts");
  assert.equal(OFFERS_OPT_IN_PHRASES.en, "YES OFFERS");
  for (const w of ["YES OFFERS", "yes offers", "Sí ofertas!", "si ofertas", "START"]) assert.ok(OPT_IN_PATTERN.test(w), w);
  for (const w of ["yes", "offers", "yes offers please", "yes to offers"]) assert.ok(!OPT_IN_PATTERN.test(w), `"${w}" must not opt in`);
  assert.equal(optInLink("+1 (917) 772-4072"), "https://wa.me/19177724072?text=YES%20OFFERS");
  assert.equal(optInLink("+19177724072", OFFERS_OPT_IN_PHRASES.es), "https://wa.me/19177724072?text=SI%20OFERTAS");
  assert.equal(optInLink(null), null);
  assert.equal(optInLink("12"), null);
  assert.ok(readCode("packages/contracts/src/config.ts").includes('If a message is only the words YES OFFERS or SI OFERTAS'), "the receptionist thanks them and asks nothing else");
  const q = readCode("apps/dashboard/app/api/v1/consent/qr/route.ts");
  assert.ok(q.includes("const link = optInLink(ch?.number_e164);") && q.includes('"content-type": "image/svg+xml; charset=utf-8"'), "the code encodes one link and nothing a caller chooses");
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/surface-data.ts").includes('qrPath: optInLink(wa?.number_e164) ? api().url("GET consent/qr") : null,'));
  const p = readCode("apps/dashboard/src/legacy/pages/broadcasts-real.jsx");
  assert.ok(p.includes('data-testid="bc-optin"') && p.includes('data-testid="bc-optin-copy"') && p.includes('download="say-yes-to-offers.svg"'));
});

test("Ask: a broadcast is read (list_audiences) and proposed (propose_broadcast) as a card, never sent; nobody without a yes is ever included", async () => {
  const { PROPOSAL_GATE, buildAskSuggestions } = await import("@chanlytics/contracts");
  assert.equal(PROPOSAL_GATE.broadcast, "approve");
  const tools = readCode("apps/dashboard/src/server/ask/tools.ts");
  assert.ok(tools.includes('name: "list_audiences"') && tools.includes('case "list_audiences": out = await listAudiences(t); break;'));
  // Both sizes, named for the yes each one counts. `said_yes` alone was the
  // marketing count under a name that did not say so, so the assistant reported
  // "nobody said yes" about a utility template that could reach everybody.
  assert.ok(tools.includes('said_yes_to_offers: eligibleFor(rows, kind, id, ids, "marketing").length'));
  assert.ok(tools.includes('said_yes_to_messages: eligibleFor(rows, kind, id, ids, "conversational").length'));
  // The note the assistant reads before it proposes anything. "Only people who said
  // yes can be on a broadcast; the counts are exactly them" was true of one number
  // and there are two, so it would have quoted whichever it happened to read.
  assert.ok(tools.includes("Two consents, two counts."));
  assert.ok(tools.includes("never quote the larger one."));
  const pr = readCode("apps/dashboard/src/server/ask/proposals.ts");
  assert.ok(pr.includes('name: "propose_broadcast"') && pr.includes('case "propose_broadcast": return await proposeBroadcast(t, input);'));
  assert.ok(pr.includes("const purpose = purposeOfTemplate(tpl.category);"), "the proposal asks for the same yes the route will");
  assert.ok(pr.includes("if (count === 0) return refuse(`nobody on \"${label}\" can receive this message: ${emptyAudienceRefusal(purpose)}"), "a broadcast to nobody is refused, not proposed");
  assert.ok(pr.includes('if (!tpl || tpl.meta_status !== "approved") return refuse('), "only an approved template");
  assert.ok(pr.includes('kind: "broadcast",') && pr.includes('needs: "operator",'));
  const c = readCode("apps/dashboard/src/legacy-bridge/ask/commit.ts");
  assert.ok(c.includes('const r = await viaAsk("POST broadcasts", {'), "the card commits through the broadcast route, the same door the page uses");
  assert.ok(c.includes('const r = await viaAsk("POST broadcasts/[id]/cancel", { params: { id: s(u.broadcast_id) } });'), "undo is the cancel route");
  const prompt = readCode("apps/dashboard/src/server/ask/prompt.ts");
  assert.ok(prompt.includes('"said yes":') && prompt.includes('"broadcast":') && prompt.includes('"held back":'));
  assert.ok(prompt.includes("never propose a broadcast to nobody"));
  assert.ok(readCode("apps/dashboard/src/legacy/pages/ask-turn.jsx").includes('broadcast: "wave"'));
  assert.ok(readCode("apps/dashboard/src/legacy/pages/ask-text.jsx").includes('kBroadcast: "broadcast"'));
  const s = buildAskSuggestions({ lang: "en", surface: "other", scope: null, canAct: true, heldDrafts: 0, needsYou: 0 });
  assert.ok(s.some((x) => x.kind === "act" && x.label === "Send an offer to a list"), "the Act group offers it where broadcasts live");
});
