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
  autoReplyHold,
  reviewHeldWords,
  reviewReplyWords,
  activityWords,
  REVIEW_AUTO_REPLIES_PER_SYNC,
  REVIEW_REPLY_MAX_WORDS,
  REVIEW_REPLY_MAX_CHARS,
  POLICY_CLASSES,
  POLICY_CLASS_MODES,
  POLICY_CLASS_WORDS,
  toGoogleVM,
  MODEL_ROUTES,
  MODELS,
} from "@chanlytics/contracts";

const { UI_ROWS, uiRows } = await import("../../apps/dashboard/src/bridge/policy-store.ts");

const NOW = Date.parse("2026-09-07T15:00:00Z");
const FACTS = {
  name: "Marisa's Beauty Salon",
  tone: "warm, brief, no exclamation marks",
  languages: ["English", "Spanish"],
  phone: "+1 212 555 0142",
  website: "https://marisasbeautysalon.example.com",
  services: ["Balayage", "Keratin treatment", "Blowout"],
};

test("the row's mode: no row or a mode the class cannot take reads as ask; auto, veto (Holds it: decision 0064) and never stand", () => {
  assert.equal(reviewReplyModeOf([]), "ask");
  assert.equal(reviewReplyModeOf(null), "ask");
  assert.equal(reviewReplyModeOf([{ class: "reply", mode: "auto" }]), "ask", "another class's mode is not this one's");
  assert.equal(reviewReplyModeOf([{ class: "reviews", mode: "auto" }]), "auto");
  assert.equal(reviewReplyModeOf([{ class: "reviews", mode: "never" }]), "never");
  // A review's reply waits like everything else (decision 0064, step 6): written and posted after its wait unless stopped.
  assert.equal(reviewReplyModeOf([{ class: "reviews", mode: "veto" }]), "veto");
  assert.equal(
    reviewReplyModeOf([{ class: "reviews", mode: "sometimes" }]),
    "ask",
    "a mode it does not know: fail safe",
  );
  assert.ok(POLICY_CLASSES.includes("reviews"));
  assert.deepEqual(POLICY_CLASS_MODES.reviews, ["auto", "veto", "ask", "never"]);
  assert.equal(POLICY_CLASS_WORDS.reviews.name, "Google reviews");
});

test("the prompt: the business as the system, the charter's rules, the review as the message", () => {
  const p = reviewReplyPrompt(FACTS, {
    rating: 5,
    author: "Maria Lopez",
    text: "Best balayage in Queens, Marisa is a  magician.",
    written_at: "2026-09-05T12:00:00Z",
  });
  assert.ok(
    p.system.startsWith(
      "You write the public reply a business posts under a Google review, in the business's own name.",
    ),
  );
  assert.ok(
    p.system.includes("Business: Marisa's Beauty Salon.") &&
      p.system.includes("Tone, in the owner's words: warm, brief, no exclamation marks"),
  );
  assert.ok(
    p.system.includes("Languages the business speaks: English, Spanish.") &&
      p.system.includes("Services: Balayage, Keratin treatment, Blowout."),
  );
  assert.ok(
    p.system.includes("Website: https://marisasbeautysalon.example.com") && p.system.includes("Phone: +1 212 555 0142"),
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
    p.system.includes("put right (+1 212 555 0142)"),
    "the invitation on a poor review carries the line customers use",
  );
  assert.ok(p.system.endsWith("Answer with the reply text only."));
  assert.equal(
    p.user,
    "Rating: 5 of 5\nFrom: Maria Lopez\nWritten: 2026-09-05\nReview:\n<review>\nBest balayage in Queens, Marisa is a magician.\n</review>",
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

test("the bell after AI answered: one by name, several by count; nothing for nothing", () => {
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

test("why a reply was held, in words: one set for each answer autoReplyHold gives, read by the feed and by Reports", () => {
  const holds = ["Sorry about that, we will refund your visit.", "Next time it's 20% off for you."].map(autoReplyHold);
  assert.deepEqual(holds, ["money", "price"]);
  assert.deepEqual(holds.map(reviewHeldWords), ["it named money", "it named a price"]);
  for (const why of holds)
    assert.equal(
      activityWords("google.reply_held", { review_id: "r1", why }),
      `A review reply was written and not posted · ${reviewHeldWords(why)}`,
      "the feed finishes its sentence with the same words",
    );
  for (const none of ["tone", "toString", "", null, undefined]) assert.equal(reviewHeldWords(none), null, String(none));
  assert.equal(
    activityWords("google.reply_held", { review_id: "r1", why: "tone" }),
    "A review reply was written and not posted",
    "a reason the set does not hold is never guessed",
  );
});

test("the words beside the source, and the view model carrying the mode", () => {
  assert.equal(reviewReplyWords("auto", true), "new ones are answered by AI within the hour");
  assert.equal(reviewReplyWords("ask", true), "AI writes each reply and holds it for your approval");
  assert.equal(reviewReplyWords("veto", true), "AI writes each reply and posts it after 30 minutes unless you stop it");
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
  assert.deepEqual(toGoogleVM(dto, { days: 30, until: null }, NOW, "UTC").reply, { mode: "ask", words: "" });
  const conn = {
    google_email: "o@x.com",
    account_title: "A",
    location_name: "locations/1",
    location_title: "L",
    connected_at: "2026-09-01T00:00:00Z",
    last_synced_at: "2026-09-07T14:00:00Z",
    sync_error: null,
  };
  assert.deepEqual(
    toGoogleVM({ ...dto, connection: conn, reply_mode: "auto" }, { days: 30, until: null }, NOW, "UTC").reply,
    {
      mode: "auto",
      words: "new ones are answered by AI within the hour",
    },
  );
});

test("the wiring: the migration, the edge, the routes, the bridge, the pane and the composer", () => {
  // Every workspace on record, and every new one, starts at ask for reviews: provision_tenant and the policies' classes,
  // redefined since 00071 (through 00714), run on the stack by every suite that makes a workspace
  // (leads/lead-caps.db.test.mjs and the rest). Pinned as 00071's text until 25 Nov 2026.

  // Run, not read (pinned as the modules' text until 26 Nov 2026), in google/door/the-profile-reply-draft-and-disconnect:
  // the mode read from the workspace's Autonomy row ("refresh under the auto mode", "under Holds it", "under Ask me",
  // "under Never", which answers nothing and asks the model nothing); the first sync is history, never answered
  // (door/search-link-refresh-and-connect, "the first sync is history: nothing announced, nothing answered"); the
  // newest reviews since the connection, a few a sync (contracts autoReplyCandidates, "replies held for their owner never
  // keep older reviews waiting"); and the reply written from the business's own facts ("a reply is written from the
  // business's own facts"). The reply's `by` and the bell it rings, and the reply held back for a price, run there too.
  // The model, its bound, its retry and its cap are the registry's (contracts ai/models/routes.ts), asked through the port.
  assert.deepEqual(
    [
      MODEL_ROUTES.review_reply.model,
      MODEL_ROUTES.review_reply.timeoutMs,
      MODEL_ROUTES.review_reply.retries,
      MODEL_ROUTES.review_reply.maxTokens,
    ],
    [MODELS.SONNET_5_5, 15_000, 1, 300],
  );
  // No key: no draft, said so ("draft: the Autonomy row is read first ... without a model key", google/door/). The draft
  // route an operator's, on its own bucket, asking the edge's draft and writing no decision, Never said in Autonomy's
  // words: google-routes.test.mjs ("the eleven declare their policy") and google-asked-of-the-edge.test.mjs ("a draft is
  // asked of the edge"); keyed, so a second press is the same request (google.test.mjs, "the dashboard"). The Autonomy
  // row rides on the Google reader's read, which GET google answers: google-routes.test.mjs runs it for each mode.
  // The pane's row, as it is drawn: Auto, Veto (Holds it: a reply posted after its wait unless stopped, decision 0064),
  // Ask and Never.
  assert.deepEqual(UI_ROWS.find((r) => r.id === "reviews").modes, ["Auto", "Veto", "Ask", "Never"]);
  // A reply opened is drafted for the person, and a Stays quiet workspace asks for none; the review a link names opens
  // with its box open: run on the Reviews lens in reports/page/periods-reviews-and-every-state.test.mjs ("a reply opened
  // is drafted", "a link to one review").
  // The pane draws one row per class the workspace is offered (uiRows), the reviews' in every workspace, at the mode
  // stored; settings-autonomy.spec.ts counts the rows on production.
  const pane = uiRows({ rows: [{ class: "reviews", mode: "ask", limits: {} }] });
  assert.equal(pane.find((r) => r.id === "reviews")?.mode, "Ask");
});
