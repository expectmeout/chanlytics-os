/**
 * The plan panel's two acts (moved from legacy/pages/leads-finder.jsx, decision 0015): the answer to a search's question as
 * one Ask turn, and approving the plan the card shows. Plain functions over the panel's setters, so the tests can run them.
 */
import type { AskProposal, LeadSearchPlan, PageContext } from "@chanlytics/contracts";
import type { SendEvent } from "@/legacy-bridge/ask";
import { askCalls } from "../../legacy-verbs";
import { addressRoute } from "../../people/shell-verbs";
import { answerSearch, moreForSearch } from "../surface";
import type { FinderProposal, FinderSet, LeadSearchCardPayload } from "./types";

/** A card's payload as the panel reads it. */
const payloadOf = (card: { payload?: unknown } | null | undefined): LeadSearchCardPayload =>
  card && card.payload && typeof card.payload === "object" ? card.payload : {};

/** The Leads page as it stands, sent beside the answer (legacy-bridge/ask/context.ts); nothing where Ask cannot say it. */
function leadsContext(): PageContext | null {
  const A = askCalls();
  try {
    return A && A.context
      ? A.context({ page: "clients", param: addressRoute().replace(/^clients\/?/, "") || "leads" })
      : null;
  } catch {
    return null;
  }
}

/**
 * The answer to a search's question, as one Ask turn on the Leads surface through Ask's own send (legacy-bridge/ask/api.ts).
 * The SendEvent shapes are that file's: thread, trace, delta, final, error. The panel listens for the trace line while it
 * waits and for the `final` message: a lead_search proposal carrying `amends` is the plan card, taken as it comes (the
 * server already set its version and count, spec G1); one without `amends` would start a new search, so it is refused under
 * the input, as words with no card are. It only ever amends the search the page opened it under (`more`, answer mode): a
 * fresh Find is Ask's own turn (spec F2) and never comes through here.
 */
export const leadAnswerPlan = async (words: string, set: FinderSet): Promise<AskProposal | null> => {
  const A = askCalls();
  const answering = set.more && set.more.answer ? set.more : null;
  if (!answering) {
    set.refusal("Nothing to answer here.");
    set.stage("compose");
    return null;
  }
  set.stage("thinking");
  set.refusal(null);
  set.proposal(null);
  set.plan(null);
  set.trace("Reading what you asked");
  if (!A || typeof A.send !== "function") {
    set.stage("compose");
    set.refusal("Claude isn't available here yet — try again in a moment.");
    return null;
  }
  let card: AskProposal | null = null;
  let said = "";
  // The owner's words are the turn, in the thread the search was planned in when it keeps one; the route reads the search
  // and tells the model which one and what it asked (server/ask/prompt.ts askTurnText), and falls back to a thread of the
  // owner's own when that one is not theirs. No scope: the answer has no opinion of one, so the planning thread keeps its
  // own (a null would clear it: the Phase 5 plan, D9).
  const context = leadsContext();
  const turn = {
    text: String(words || "").trim(),
    threadId: answering.threadId || null,
    answering: { searchId: answering.searchId },
    surface: "leads" as const,
    ...(context ? { context } : {}),
  };
  await A.send(turn, (ev: SendEvent) => {
    if (!ev || !ev.t) return;
    if (ev.t === "trace") set.trace(ev.text);
    else if (ev.t === "final") {
      const m = ev.message || {};
      said = m.text || "";
      card = (m.proposals || []).filter((p) => p && p.kind === "lead_search")[0] || null;
    } else if (ev.t === "error") said = ev.text || "";
  });
  const got = card as AskProposal | null;
  const amends = payloadOf(got).amends;
  if (got && (!amends || amends.search_id !== answering.searchId)) {
    // The model proposed a search of its own, or one amending some other search, instead of amending this one:
    // committing it would start a second search while the first waited a day and died, or answer a round this panel was
    // not opened under.
    set.refusal("That would start a new search. Say your answer to the question instead.");
    set.stage("compose");
    return null;
  }
  if (got) {
    set.proposal(got);
    set.plan(payloadOf(got).plan || null);
    set.stage("plan");
    return got;
  }
  set.refusal(said || "Nothing came back — ask again in a moment.");
  set.stage("compose");
  return null;
};

/** What a start answers: the door's own result, or why it did not start. */
type StartResult = { ok: boolean; message?: string; error?: { message?: string }; data?: unknown; undo?: unknown };

/** The plan, started through the door that fits it (see leadFinderApprove). */
async function startPlan(proposal: FinderProposal | null, plan: LeadSearchPlan, set: FinderSet): Promise<StartResult> {
  if (proposal) {
    const A = askCalls();
    return A && typeof A.commit === "function"
      ? await A.commit({ ...(proposal as AskProposal), payload: { ...(proposal.payload || {}), plan } })
      : { ok: false, message: "Claude isn't available here yet — try again in a moment." };
  }
  // The plan is sent as the owner saw it; the route sets the version and the count the round reserved (G1). If the round
  // stopped waiting meanwhile the route says so, and that is what is shown (section 7.2).
  if (set.more && set.more.answer) return await answerSearch(set.more.searchId, "include", plan);
  if (set.more) return await moreForSearch(set.more.searchId, set.more.purpose || "topup", plan);
  return { ok: false, message: "Nothing to start — describe what you want again." };
}

/**
 * Find N leads. An Ask card goes through commitProposal (legacy-bridge ask/commit.ts), which posts the plan to POST
 * lead-searches marked as Ask's, or, when the card carries `amends`, answers the search it amends: an answer that came
 * back from Ask commits as its card. An Include opened on the page (a strip's step on a round still waiting, no card) posts
 * the plan through answerSearch and the route versions it; any other plan the panel opened from a strip's next step goes
 * through moreForSearch (an idea's search is Ask's card now, never this panel's). Either way the route's own sentence on a
 * refusal (402, 409, 429) is said under the button, in its words, and nothing on the page says it started. Started, the
 * panel shuts the one way the page shuts it (`set.close`, which lets go of the round it was opened under too), left at
 * rest: no words, card or plan.
 */
export const leadFinderApprove = async (
  proposal: FinderProposal | null,
  plan: LeadSearchPlan,
  set: FinderSet,
): Promise<StartResult> => {
  set.stage("starting");
  set.refusal(null);
  const r = await startPlan(proposal, plan, set);
  if (r && r.ok) {
    set.stage("compose");
    set.close();
    set.words("");
    set.proposal(null);
    set.plan(null);
    return r;
  }
  set.refusal((r && (r.message || (r.error && r.error.message))) || "It didn't start. Try again in a moment.");
  set.stage("plan");
  return r;
};
