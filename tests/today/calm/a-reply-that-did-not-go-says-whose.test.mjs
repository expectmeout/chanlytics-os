/**
 * A reply that never reached them, on Today's card (the nightly's read of 24 Nov 2026): the words over it said "AI's draft"
 * whoever wrote them, so a reply the team wrote that did not go stood as AI's, with AI's mark and "Back to AI's". Whose they
 * are is read once, off the message that failed (contracts today/queue.ts failedReplyOf, by messageAuthor), and the card says
 * AI's draft only where AI wrote them. Run on the stub React over Today's read, as the page draws it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toTodayVM } from "@chanlytics/contracts";
import { all, find, textOf } from "../../_stub-react.mjs";
import { NOW, metrics, draw, redraw } from "../zones/_world.mjs";

const { NeedYouOnToday } = await import("../zones/_on-today.mjs");
const { setSurfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");

const WHO = "Rosa Díaz";
const WORDS = "Yes, Saturday at 3 works.";

/**
 * Today's read of one thread, `id`, whose last reply, written by `sender`, never reached them, and the hold it raised. Each
 * case has a thread of its own: what is typed on a row is kept by its id for as long as the page lives.
 */
function dayWhereAReplyFailed(sender, id) {
  const at = (minute) => `2026-09-18T19:0${minute}:00Z`;
  const message = (over) => ({
    conversation_id: id,
    type: "text",
    media: null,
    meta: null,
    ...over,
  });
  const conversation = {
    id,
    state: "open",
    paused_until: null,
    assignee_user_id: null,
    assignee_is_me: false,
    last_wa_inbound_at: at(0),
    last_message_at: at(1),
    contact: {
      id: `c-${id}`,
      display_name: WHO,
      wa_profile_name: null,
      phone_e164: "+17865550181",
      consent: "opted_in",
      dnc: false,
    },
    messages: [
      message({
        id: "m1",
        direction: "inbound",
        sender: "customer",
        body: "Can I move Saturday?",
        status: "received",
        created_at: at(0),
      }),
      message({ id: "m2", direction: "outbound", sender, body: WORDS, status: "failed", created_at: at(1) }),
    ],
  };
  // A reply that never left raises a hold on its thread (reason send_failed), which is Need you's row.
  const hold = {
    id: `e-${id}`,
    conversation_id: id,
    reason: "send_failed",
    details: null,
    state: "open",
    created_at: at(2),
  };
  return toTodayVM(metrics(), [conversation], [hold], [], NOW);
}

/** The page's one card (calm/lead.tsx), drawn over this read. */
function cardOver(vm) {
  setSurfaceValue("today", vm);
  return find(draw(NeedYouOnToday), (n) => n.props?.["data-testid"] === "today-card");
}

/** What stands over the card's words, AI's mark beside it or not, and the way back to the words that failed. */
function headOf(card) {
  const head = find(card, (n) => n.props?.className === "ny-by");
  return {
    by: textOf(find(head, (n) => n.props?.className === "ny-by-words")),
    marked: all(head, (n) => typeof n.type === "function" && n.type.name === "AskMark").length > 0,
    back:
      all(head, (n) => n.type === "button")
        .map(textOf)
        .find((t) => t.startsWith("Back to")) ?? null,
  };
}

test("a reply the team wrote that never reached them is the team's on Today's card: never AI's draft, nor AI's mark", () => {
  const vm = dayWhereAReplyFailed("human", "cv-team");
  const row = vm.queue.rows.find((r) => r.conversationId === "cv-team");
  assert.equal(row.failed.text, WORDS, "the words that failed are the row's, to try again");
  assert.equal(row.failed.by, "team", "whose they are, read off the message that failed");
  assert.deepEqual(
    headOf(cardOver(vm)),
    { by: "Team's reply", marked: false, back: null },
    "REGRESSION: a reply the team wrote stood on Today as AI's draft",
  );
});

test("changed on the card, the team's words are yours now, and the way back goes to the team's, not to AI's", () => {
  const card = cardOver(dayWhereAReplyFailed("human", "cv-changed"));
  const box = find(card, (n) => n.props?.["aria-label"] === `Your reply to ${WHO}` && !!n.props?.onValueChange);
  box.props.onValueChange("Saturday at 3 is fine, see you then.");
  const again = find(redraw(NeedYouOnToday), (n) => n.props?.["data-testid"] === "today-card");
  assert.deepEqual(headOf(again), { by: "Yours now", marked: false, back: "Back to the team's" });
});

test("a reply AI wrote that never reached them is still AI's draft, with AI's mark", () => {
  const vm = dayWhereAReplyFailed("ai", "cv-ai");
  assert.equal(vm.queue.rows.find((r) => r.conversationId === "cv-ai").failed.by, "ai");
  assert.deepEqual(headOf(cardOver(vm)), { by: "AI's draft", marked: true, back: null });
});
