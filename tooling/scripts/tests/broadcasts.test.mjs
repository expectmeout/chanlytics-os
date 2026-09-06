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
  broadcastName, cleanParam, eligibleFor, mayReceiveOffers, renderTemplate, toBroadcastVM, whenLabel,
} from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

const person = (over = {}) => ({
  id: over.id ?? "p1", state: "active", hasChat: true, calls: 0, phone: "+15551230001",
  consent: { state: "opted_in", dnc: false, label: "Opted in", sub: "", source: "in_person" },
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

test("the one predicate: a recorded yes, no do-not-contact, a number", () => {
  assert.equal(mayReceiveOffers(person()), true);
  assert.equal(mayReceiveOffers(person({ consent: { state: "unknown", dnc: false } })), false, "not asked is not a yes");
  assert.equal(mayReceiveOffers(person({ consent: { state: "opted_in", dnc: true } })), false, "the operator's block outranks a yes");
  assert.equal(mayReceiveOffers(person({ phone: null })), false, "nowhere to send");
});

test("an audience is a People list, a list kept by hand, or everyone — each crossed with the predicate", () => {
  const rows = [
    person({ id: "a" }),
    person({ id: "b", state: "quiet" }),
    person({ id: "c", state: "quiet", consent: { state: "unknown", dnc: false } }),
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
  assert.ok(broadcastName("spring_offer", new Date("2026-09-05T15:00:00")).startsWith("spring offer · Sep 5"));
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

test("the job: state gates, the template still approved, every person re-checked at the wire, batches that continue themselves, the workspace told", () => {
  const h = readCode("packages/jobs/src/handlers.ts");
  assert.ok(h.includes("broadcast_send: broadcastSend,"));
  assert.ok(h.includes('if (b.state === "canceled" || b.state === "sent" || b.state === "failed") return;'));
  assert.ok(h.includes('if (!tpl || tpl.meta_status !== "approved") {'), "a template Meta withdrew fails the broadcast before a single send");
  assert.ok(h.includes(".limit(BROADCAST_CHUNK);") && BROADCAST_CHUNK === 25);
  assert.ok(h.includes('if (isOptedOutContact(c)) { await mark(r.contact_id, { state: "skipped", reason: "opted_out" }); continue; }'));
  assert.ok(h.includes('if (c.consent !== "opted_in") { await mark(r.contact_id, { state: "skipped", reason: "not_opted_in" }); continue; }'), "the yes is re-checked at the wire, whatever the route found");
  assert.ok(h.includes('reason: "human_has_it"'), "a person mid-thread with a human is not interrupted");
  assert.ok(h.includes('if (cErr) { console.error("broadcast_contact_unreadable", r.contact_id, cErr.message); continue; }'), "fail closed: an unreadable person stays queued");
  assert.ok(h.includes('meta: { source: "broadcast", broadcast_id: b.id, broadcast_name: b.name'), "every message says which broadcast it came from");
  assert.ok(h.includes('if (still?.state !== "sending") return;'), "a cancel during a batch stops the next");
  assert.ok(h.includes('await ctx.schedule("broadcast_send", new Date(), { broadcast_id: b.id });'));
  assert.ok(h.includes('throw new Error("broadcast_send: this runner cannot schedule the next batch");'), "a runner that cannot continue fails loudly");
  assert.ok(h.includes('kind: "broadcast.sent"'));
  const fire = readCode("apps/edge/api/jobs/fire.ts");
  assert.ok(fire.includes("scheduleJob(db, { tenantId: job.tenant_id, kind, dueAt, payload, qstashToken: process.env.QSTASH_TOKEN! })"), "the runner hands the job its scheduler");
});

test("the routes: an approved template, values Meta accepts, an audience crossed with who said yes, enrolled now, scheduled, on the ledger; cancel stops what has not finished", () => {
  const r = readCode("apps/dashboard/app/api/v1/broadcasts/route.ts");
  assert.ok(r.includes('requireRole(member, "operator");') && r.includes('takeRate(ctx.userId, "broadcast");'));
  assert.ok(r.includes('if (tpl.meta_status !== "approved") throw new AppError("conflict", "That template is not approved by WhatsApp, so it cannot be sent.", 409);'));
  assert.ok(r.includes("const v = cleanParam(spec.value);"), "typed text is cleaned; a source is itself");
  assert.ok(r.includes("const eligible = eligibleFor(rows, kind as AudienceKind, audienceId, savedIds);"), "the same predicate the page counts with");
  assert.ok(r.includes('"Nobody there has said yes to offers yet. Record their answer on their profile first."'));
  assert.ok(r.includes('await schedule(tenantId, "broadcast_send", when, { broadcast_id: made.id });'));
  assert.ok(r.includes('recordDecision(ctx, tenantId, "broadcast", made.id, "send_broadcast", {'));
  const c = readCode("apps/dashboard/app/api/v1/broadcasts/[id]/cancel/route.ts");
  assert.ok(c.includes('await cancelKindFor(b.tenant_id, "broadcast_send", "broadcast_id", id);'));
  assert.ok(c.includes('recordDecision(ctx, b.tenant_id, "broadcast", id, "cancel_broadcast", { name: b.name, was: b.state });'));
  const l = readCode("apps/dashboard/src/server/broadcasts.ts");
  assert.ok(l.includes('if (status === "delivered" || status === "read") c.delivered += 1;'), "delivered comes from the receipts, never from the send");
  assert.ok(readCode("apps/dashboard/src/server/rate-limit.ts").includes('broadcast: { limit: 10, windowMs: 60_000, noun: "broadcasts" }'));
});

test("the surface and the page: Broadcasts is real, fed by the same rules, and the seeded page keeps the demo", async () => {
  const reg = await import(pathToFileURL(path.join(here, "../../../apps/dashboard/src/legacy-bridge/surface-registry.ts")).href);
  assert.equal(reg.SURFACE_STATES.broadcasts, "real");
  assert.equal(reg.ROUTE_SURFACE.broadcasts, "broadcasts");
  const s = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  assert.ok(s.includes('key: "broadcasts",') && s.includes('count: eligibleFor(rows, "everyone", null, null).length'));
  assert.ok(s.includes('.filter((t) => t.channel === "whatsapp" && t.meta_status === "approved")'));
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx").includes("installBroadcasts();"));
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/manifest.ts").includes('import "@/legacy/pages/broadcasts-real.jsx";'));
  assert.ok(readCode("apps/dashboard/src/legacy/pages/broadcasts.jsx").includes("window.BroadcastsSeed = BroadcastsPage;"));
  const p = readCode("apps/dashboard/src/legacy/pages/broadcasts-real.jsx");
  for (const id of ["broadcasts-real", "bc-audience", "bc-template", "bc-no-template", "bc-preview", "bc-send", "bc-nobody", "bc-open", "bc-history"]) {
    assert.ok(p.includes(`data-testid="${id}"`), id);
  }
  assert.ok(p.includes("Nobody on “{active.label}” has said yes to offers yet."));
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
  const r = readCode("apps/dashboard/app/api/v1/broadcasts/route.ts");
  assert.ok(r.includes("if (!health.canSend) throw new AppError(\"conflict\", health.refusal!, 409);"), "a flagged number does not broadcast");
  assert.ok(r.includes("const over = overLimitRefusal(health, eligible.length);"), "an audience past the day's limit is split, not silently cut");
  assert.ok(readCode("apps/dashboard/app/api/v1/channels/route.ts").includes("quality: s(\"quality_rating\"),"));
  const sd = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  assert.ok(sd.includes("health: numberHealth({ quality: wa?.quality ?? null, event: wa?.quality_event ?? null, limit: wa?.messaging_limit ?? null }),"));
  assert.ok(sd.includes("heldReasons: HELD_REASONS,"));
  const p = readCode("apps/dashboard/src/legacy/pages/broadcasts-real.jsx");
  for (const id of ["bc-number", "bc-number-refusal", "bc-over-limit", "bc-detail", "bc-person", "bc-open-who"]) assert.ok(p.includes(`data-testid="${id}"`), id);
  assert.ok(p.includes("&& numberOk && !overLimit;"), "the button follows the number too");
  const vm = readCode("packages/contracts/src/viewmodels.ts");
  assert.ok(vm.includes('...(m.meta?.source === "broadcast" ? { via: { kind: "broadcast" as const, name: String(m.meta.broadcast_name ?? "broadcast") } } : {}),'));
  assert.ok(readCode("apps/dashboard/src/legacy/pages/inbox-thread.jsx").includes("by {entry.via ? `a broadcast (${entry.via.name})` : \"you\"} · {entry.at}"));
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
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/surface-data.ts").includes('qrPath: optInLink(wa?.number_e164) ? scoped("/api/v1/consent/qr") : null,'));
  const p = readCode("apps/dashboard/src/legacy/pages/broadcasts-real.jsx");
  assert.ok(p.includes('data-testid="bc-optin"') && p.includes('data-testid="bc-optin-copy"') && p.includes('download="say-yes-to-offers.svg"'));
});

test("Ask: a broadcast is read (list_audiences) and proposed (propose_broadcast) as a card, never sent; nobody without a yes is ever included", async () => {
  const { PROPOSAL_GATE, buildAskSuggestions } = await import("@chanlytics/contracts");
  assert.equal(PROPOSAL_GATE.broadcast, "approve");
  const tools = readCode("apps/dashboard/src/server/ask/tools.ts");
  assert.ok(tools.includes('name: "list_audiences"') && tools.includes('case "list_audiences": out = await listAudiences(t); break;'));
  assert.ok(tools.includes("said_yes: eligibleFor(rows, \"everyone\", null, null).length"), "the same predicate the route enrols with");
  assert.ok(tools.includes('note: "Only people who said yes can be on a broadcast; the counts are exactly them."'));
  const pr = readCode("apps/dashboard/src/server/ask/proposals.ts");
  assert.ok(pr.includes('name: "propose_broadcast"') && pr.includes('case "propose_broadcast": return await proposeBroadcast(t, input);'));
  assert.ok(pr.includes("if (count === 0) return refuse(`nobody on \"${label}\" has said yes to offers yet"), "a broadcast to nobody is refused, not proposed");
  assert.ok(pr.includes('if (!tpl || tpl.meta_status !== "approved") return refuse('), "only an approved template");
  assert.ok(pr.includes('kind: "broadcast",') && pr.includes('needs: "operator",'));
  const c = readCode("apps/dashboard/src/legacy-bridge/ask/commit.ts");
  assert.ok(c.includes('const r = await viaAsk(win, "/api/v1/broadcasts", {'), "the card commits through the broadcast route, the same door the page uses");
  assert.ok(c.includes("const r = await viaAsk(win, `/api/v1/broadcasts/${u.broadcast_id}/cancel`);"), "undo is the cancel route");
  const prompt = readCode("apps/dashboard/src/server/ask/prompt.ts");
  assert.ok(prompt.includes('"said yes":') && prompt.includes('"broadcast":') && prompt.includes('"held back":'));
  assert.ok(prompt.includes("never propose a broadcast to nobody"));
  assert.ok(readCode("apps/dashboard/src/legacy/pages/ask-turn.jsx").includes('broadcast: "wave"'));
  assert.ok(readCode("apps/dashboard/src/legacy/pages/ask-text.jsx").includes('kBroadcast: "broadcast"'));
  const s = buildAskSuggestions({ lang: "en", surface: "other", scope: null, canAct: true, heldDrafts: 0, needsYou: 0 });
  assert.ok(s.some((x) => x.kind === "act" && x.label === "Send an offer to a list"), "the Act group offers it where broadcasts live");
});
