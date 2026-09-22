/**
 * The receptionist under a Google review.
 *
 * The Autonomy row's reading, the prompt's rules, which unreplied reviews
 * the auto mode may answer in one sync, the draft's cleaning and the bell's
 * words are executed here; the wiring pins keep the migration, the edge,
 * the routes, the bridge, the pane and the composer saying the same thing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reviewReplyModeOf,
  reviewReplyPrompt,
  cleanDraft,
  autoReplyCandidates,
  autoReplyBell,
  reviewReplyWords,
  REVIEW_AUTO_REPLIES_PER_SYNC,
  REVIEW_REPLY_MAX_WORDS,
  REVIEW_REPLY_MAX_CHARS,
  POLICY_CLASSES,
  POLICY_CLASS_MODES,
  POLICY_CLASS_WORDS,
  toGoogleVM,
} from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const NOW = Date.parse("2026-09-07T15:00:00Z");
const FACTS = {
  name: "Melany's Beauty Salon",
  tone: "warm, brief, no exclamation marks",
  languages: ["English", "Spanish"],
  phone: "+1 646 932 5775",
  website: "https://melanysbeautysalon.com",
  services: ["Balayage", "Keratin treatment", "Blowout"],
};

test("the row's mode: no row or a mode the class cannot take reads as ask; auto and never stand", () => {
  assert.equal(reviewReplyModeOf([]), "ask");
  assert.equal(reviewReplyModeOf(null), "ask");
  assert.equal(reviewReplyModeOf([{ class: "reply", mode: "auto" }]), "ask", "another class's mode is not this one's");
  assert.equal(reviewReplyModeOf([{ class: "reviews", mode: "auto" }]), "auto");
  assert.equal(reviewReplyModeOf([{ class: "reviews", mode: "never" }]), "never");
  assert.equal(
    reviewReplyModeOf([{ class: "reviews", mode: "veto" }]),
    "ask",
    "veto is not a mode reviews can take: fail safe",
  );
  assert.ok(POLICY_CLASSES.includes("reviews"));
  assert.deepEqual(POLICY_CLASS_MODES.reviews, ["auto", "ask", "never"]);
  assert.equal(POLICY_CLASS_WORDS.reviews.name, "Google reviews");
});

test("the prompt: the business as the system, the charter's rules, the review as the message", () => {
  const p = reviewReplyPrompt(FACTS, {
    rating: 5,
    author: "Maria Lopez",
    text: "Best balayage in Queens, Melany is a  magician.",
    written_at: "2026-09-05T12:00:00Z",
  });
  assert.ok(
    p.system.startsWith(
      "You write the public reply a business posts under a Google review, in the business's own name.",
    ),
  );
  assert.ok(
    p.system.includes("Business: Melany's Beauty Salon.") &&
      p.system.includes("Tone, in the owner's words: warm, brief, no exclamation marks"),
  );
  assert.ok(
    p.system.includes("Languages the business speaks: English, Spanish.") &&
      p.system.includes("Services: Balayage, Keratin treatment, Blowout."),
  );
  assert.ok(
    p.system.includes("Website: https://melanysbeautysalon.com") && p.system.includes("Phone: +1 646 932 5775"),
  );
  assert.ok(
    p.system.includes(
      "Reply in the language the review is written in. When the review has no words, reply in English.",
    ),
  );
  assert.ok(p.system.includes(`at most ${REVIEW_REPLY_MAX_WORDS} words`));
  assert.ok(p.system.includes("Never mention refunds, discounts, prices or compensation"), "money is the owner's");
  assert.ok(
    p.system.includes("Never invent details about their visit") &&
      p.system.includes("Never argue, never dispute what they wrote, never blame them."),
  );
  assert.ok(
    p.system.includes("put right (+1 646 932 5775)"),
    "the invitation on a poor review carries the line customers use",
  );
  assert.ok(p.system.endsWith("Answer with the reply text only."));
  assert.equal(
    p.user,
    'Rating: 5 of 5\nFrom: Maria Lopez\nWritten: 2026-09-05\nReview: "Best balayage in Queens, Melany is a magician."',
  );
});

test("the prompt without the optional facts, for a star-only review from nobody in particular", () => {
  const p = reviewReplyPrompt(
    { name: "The Shop", tone: null, languages: [], phone: null, website: null, services: [] },
    { rating: 2, author: "A Google user", text: null, written_at: null },
  );
  assert.ok(
    !p.system.includes("Tone,") &&
      !p.system.includes("Languages the business speaks") &&
      !p.system.includes("Services:") &&
      !p.system.includes("Website:") &&
      !p.system.includes("Phone:"),
  );
  assert.ok(p.system.includes("When the review has no words, reply in English."));
  assert.ok(p.system.includes("so it can be put right. Never argue"), "no phone, no parenthesis");
  assert.equal(
    p.user,
    "Rating: 2 of 5\nFrom: a customer who did not give a name\nThe review has no words, only the stars.",
  );
  assert.equal(
    reviewReplyPrompt(FACTS, { rating: null, author: "  ", text: "ok", written_at: null }).user.split("\n")[0],
    "Rating: not given",
  );
});

test("a draft is cleaned: labels, wrapping quotes and whitespace gone, capped, empty when nothing remains", () => {
  assert.equal(cleanDraft('Reply: "Thank you, Maria — see you next month."'), "Thank you, Maria — see you next month.");
  assert.equal(cleanDraft("“Gracias, Ana.\n\n  Hasta pronto.”  "), "Gracias, Ana. Hasta pronto.");
  assert.equal(cleanDraft("   "), "");
  assert.equal(cleanDraft(null), "");
  assert.equal(cleanDraft(42), "");
  assert.equal(cleanDraft("x".repeat(REVIEW_REPLY_MAX_CHARS + 50)).length, REVIEW_REPLY_MAX_CHARS);
});

test("which reviews the auto mode answers in one sync: on duty, unreplied, recent, from the profile, newest first, capped", () => {
  const connected = "2026-08-20T10:00:00Z";
  const rows = [
    { id: "old", review_id: "r0", origin: "profile", published_at: "2026-08-01T00:00:00Z", reply_text: null }, // before the connection: history
    { id: "a", review_id: "r1", origin: "profile", published_at: "2026-09-06T09:00:00Z", reply_text: null },
    { id: "done", review_id: "r2", origin: "profile", published_at: "2026-09-06T10:00:00Z", reply_text: "Thanks!" },
    { id: "b", review_id: "r3", origin: "profile", published_at: "2026-09-07T08:00:00Z", reply_text: null },
    { id: "public", review_id: "r4", origin: "places", published_at: "2026-09-07T09:00:00Z", reply_text: null },
    { id: "stale", review_id: "r5", origin: "profile", published_at: "2026-08-21T00:00:00Z", reply_text: null }, // on duty, but older than two weeks
    { id: "c", review_id: "r6", origin: "profile", published_at: "2026-09-01T00:00:00Z", reply_text: null },
    { id: "undated", review_id: "r7", origin: "profile", published_at: null, reply_text: null },
    { id: "d", review_id: "r8", origin: "profile", published_at: "2026-09-02T00:00:00Z", reply_text: null },
  ];
  assert.deepEqual(
    autoReplyCandidates(rows, connected, NOW).map((r) => r.id),
    ["b", "a", "d"],
    `newest first, ${REVIEW_AUTO_REPLIES_PER_SYNC} at most`,
  );
  assert.equal(REVIEW_AUTO_REPLIES_PER_SYNC, 3);
  assert.deepEqual(
    autoReplyCandidates(rows, connected, NOW, 10).map((r) => r.id),
    ["b", "a", "d", "c"],
  );
  assert.deepEqual(autoReplyCandidates(rows, null, NOW), [], "no connection time, nothing is on duty");
  assert.deepEqual(autoReplyCandidates(rows, connected, NOW, 0), []);
});

test("the bell after the receptionist answered: one by name, several by count; nothing for nothing", () => {
  assert.equal(autoReplyBell([]), null);
  assert.deepEqual(autoReplyBell([{ author: "Maria Lopez", text: "Thank you, Maria." }]), {
    title: "Replied to Maria Lopez's review",
    body: "Thank you, Maria.",
  });
  assert.deepEqual(autoReplyBell([{ author: "  ", text: "Thank you." }]), {
    title: "Replied to a review on Google",
    body: "Thank you.",
  });
  assert.deepEqual(
    autoReplyBell([
      { author: "Ana", text: "a" },
      { author: null, text: "b" },
      { author: "Luis", text: "c" },
    ]),
    { title: "Replied to 3 reviews on Google", body: "Under the reviews from Ana, Luis. Each reply is on Reports." },
  );
});

test("the words beside the source, and the view model carrying the mode", () => {
  assert.equal(reviewReplyWords("auto", true), "new ones are answered by the receptionist within the hour");
  assert.equal(reviewReplyWords("ask", true), "the receptionist drafts, you send");
  assert.equal(reviewReplyWords("never", true), "");
  assert.equal(reviewReplyWords("auto", false), "", "nothing can go out until the profile is connected");
  const dto = {
    ready: { places: true, profile: true },
    listing: null,
    connection: null,
    reviews: [],
    days: [],
    reply_mode: "ask",
    role: "owner",
  };
  assert.deepEqual(toGoogleVM(dto, 30, NOW).reply, { mode: "ask", words: "" });
  const conn = {
    google_email: "o@x.com",
    account_title: "A",
    location_name: "locations/1",
    location_title: "L",
    connected_at: "2026-09-01T00:00:00Z",
    last_synced_at: "2026-09-07T14:00:00Z",
    sync_error: null,
  };
  assert.deepEqual(toGoogleVM({ ...dto, connection: conn, reply_mode: "auto" }, 30, NOW).reply, {
    mode: "auto",
    words: "new ones are answered by the receptionist within the hour",
  });
});

test("the wiring: the migration, the edge, the routes, the bridge, the pane and the composer", () => {
  const sql = readRaw("supabase/migrations/00071_review_replies.sql");
  assert.ok(sql.includes("check (class in ('reply','booking','faq','reengage','campaign','money','reviews'))"));
  assert.ok(
    sql.includes("select t.id, 'reviews', 'ask', '{}'::jsonb") &&
      sql.includes("on conflict (tenant_id, class, subject_type, subject_id) do nothing;"),
    "every workspace on record starts at ask",
  );
  assert.ok(
    sql.includes("create or replace function public.provision_tenant(p_tenant_id uuid)") &&
      sql.includes("('reengage','ask'), ('campaign','ask'), ('reviews','ask'), ('money','never')"),
    "and every new one",
  );
  assert.ok(
    sql.includes("pg_get_constraintdef(oid) like 'CHECK ((class = ANY%'"),
    "the constraint is found by what it says",
  );

  const lib = readCode("apps/edge/lib/google.ts");
  assert.ok(
    lib.includes("export async function reviewReplyMode(") &&
      lib.includes("reviewReplyModeOf(await listPolicies(db, tenantId))"),
  );
  assert.ok(
    /const answered = first\s*\?\s*\[\]\s*:\s*await answerNewReviews\(/.test(lib),
    "the first sync is history, never answered",
  );
  assert.ok(lib.includes('if ((await reviewReplyMode(db, conn.tenant_id)) !== "auto") return [];'));
  assert.ok(lib.includes("autoReplyCandidates(unreplied.data ?? [], conn.connected_at, now.getTime())"));
  assert.ok(lib.includes('by: "receptionist"') && lib.includes("const bell = autoReplyBell(answered);"));
  assert.ok(
    lib.includes("business_name || t.data?.name") && lib.includes("phone: brain?.phone_display || null"),
    "the facts are the brain's profile",
  );
  const model = readCode("apps/edge/lib/review-reply.ts");
  assert.ok(
    model.includes('export const REVIEW_REPLY_MODEL = "claude-sonnet-5";') &&
      model.includes("timeout: 15_000, maxRetries: 1") &&
      model.includes("max_tokens: 300"),
  );
  assert.ok(model.includes('if (!env.ANTHROPIC_API_KEY) return { ok: false, error: "no_model_key" };'));
  // The draft op -- Never refused before the review is read, the no-model
  // path -- runs in google-door.test.mjs.

  const route = readCode("apps/dashboard/app/api/v1/google/reviews/[id]/draft/route.ts");
  assert.ok(
    route.includes('role: "operator",') && route.includes('rate: "google_draft",') && route.includes('op: "draft"'),
  );
  assert.ok(
    route.includes("policy_never:") && !route.includes("recordDecision"),
    "a draft is not a decision; sending is",
  );
  assert.ok(readCode("apps/dashboard/src/server/rate-limit.ts").includes("google_draft: {"));
  const get = readCode("apps/dashboard/app/api/v1/google/route.ts");
  assert.ok(get.includes("reply_mode: reviewReplyModeOf(policies)"));
  const bridge = readCode("apps/dashboard/src/legacy-bridge/google.ts");
  assert.ok(bridge.includes('"POST google/reviews/[id]/draft", { params: { id }, body: {} }'));

  const store = readCode("apps/dashboard/src/legacy-bridge/policy-store.ts");
  assert.match(
    store,
    /\{\s*id: "reviews",\s*cls: "reviews",\s*\.\.\.W\("reviews"\),\s*modes: \["Auto", "Ask", "Never"\]/,
  );
  const reports = readCode("apps/dashboard/src/legacy/pages/reports.jsx");
  assert.ok(
    reports.includes('if (r.replied || mode === "never" || !window.__google || !window.__google.draft) return;'),
    "a replied review and a Never workspace ask for nothing",
  );
  assert.ok(
    reports.includes("const d = await window.__google.draft(r.id);") &&
      reports.includes('data-testid="google-reply-drafted"'),
  );
  assert.ok(reports.includes("<ReviewReply r={r} mode={vm.reply.mode} />") && reports.includes("vm.reply.words"));
  assert.ok(readRaw("e2e/settings-autonomy.spec.ts").includes("toHaveCount(7)"));
});
