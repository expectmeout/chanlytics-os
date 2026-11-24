/**
 * The Week's presses (00706; the content loop PRD's 21.2): plan this week now, approve it in one press, one row's change
 * (left out, approved by itself, Try again, a made reel's Approve), and what Settings › Content keeps. Each answers what
 * the route said, or its refusal in the owner's words; what it changed is read again by the refresh map.
 */
import { REVIEW_ASK_START } from "@chanlytics/contracts";
import { api } from "@/bridge/api";

/** "Plan this week": the week drafted now, as the clock would on Sunday evening. */
export const planThisWeek = () => api()("POST content/plan", { body: {} });

/** Approve the week: every slot ready, as shown, under one approval; what was left out says why. */
export const approveTheWeek = (week: { plan_id: string; week_of: string }) =>
  api()("POST content/plan/approve", { body: week });

/** Stop it (00714): a week AI may approve, held to 8:00 AM, waits for the owner's own press instead. */
export const stopTheWeek = (planId: string) => api()("POST content/plan/stop", { body: { plan_id: planId } });

/** One row's own press: Try again and Approve once mended (`approved`), or a made reel up at its time (`post`). */
export const pressSlot = (slotId: string, to: "approved" | "post" | "removed") =>
  api()("POST content/plan/slots", { body: { slot_id: slotId, change: { to } } });

/** What posts are for, how often, the quiet days or the languages, in the owner's own sentence: AI reads it, and it is kept. */
export const keepContentLine = (line: "goals" | "cadence" | "quiet_days" | "languages" | "look", words: string) =>
  api()("POST content/line", { body: { line, words } });

/** An offer kept, in the owner's words, until its last day. */
export const keepOffer = (offer: { text: string; valid_until: string | null }) =>
  api()("POST content/claims", {
    body: { kind: "offer", text: offer.text, source: "settings", valid_until: offer.valid_until },
  });

/** An offer withdrawn: a post that says it waits for the owner. */
export const withdrawOffer = (claimId: string) => api()("DELETE content/claims", { body: { claim_id: claimId } });

/** The plan's proposal to ask every client for a review (pass 6): Approve starts the after-visit ask, by its starter. */
export const startReviewAsk = () =>
  api()("POST playbooks", { body: { ...REVIEW_ASK_START, params: REVIEW_ASK_START.params.map((p) => ({ ...p })) } });

/** Not now on the proposal: it rests for 30 days. */
export const restTheReviewAsk = () => api()("POST content/review-ask", { body: { act: "rest" } });
