import "server-only";
import { z } from "zod";
import { LEAD_ENDING_WORDS } from "@chanlytics/contracts";
import { waitingQuestionOf } from "../../../leads/leads";
import { load } from "../../../readers";
import { searches } from "../../../readers/searches";
import { defineActions, readAction, type ToolContext } from "../context";

/** A round's state in a word, for the model to say. The owner's own screen words are the strip's. */
const ROUND_WORDS: Record<string, string> = {
  queued: "queued",
  probing: "looking at a first few",
  waiting_on_owner: "waiting for an answer from you",
  running: "running",
  checking: "checking the emails it found",
  ended: "ended",
};

/**
 * Every search this workspace has asked for, newest first, in the owner's own
 * words: what they asked, the day they asked it, where it is or how it ended,
 * the three counts, and, for a search that stopped to ask, its question (the
 * model answers it through propose_lead_search's amends); and beside them the
 * rail's six counts, as the Leads page shows them. Nothing is started by
 * reading it, and every string is cut to 120 characters so a long ask cannot
 * fill a turn.
 */
async function listLeadSearches(t: ToolContext): Promise<unknown> {
  // The Leads page's own read (readers/searches.ts), once a turn: every kept search with its latest round as the page
  // maps it, and the rail's counts read with them (ledger #12).
  const { searches: rows, counts } = (await load(t.rc, searches, undefined)).data;
  const cut = (v: string | null | undefined) => (typeof v === "string" ? v.slice(0, 120) : "");
  return {
    route: "clients/leads",
    counts: {
      all: counts.all,
      ready: counts.ready,
      nurture: counts.nurture,
      converted: counts.converted,
      said_no: counts.said_no,
      not_a_fit: counts.not_a_fit,
    },
    searches: rows.map((s) => {
      const r = s.round;
      // The page's round carries the question's sentence as the view held it (toSearchDto), so the one reader of a
      // waiting question says the same sentence; a search with no round has none.
      const q = r ? waitingQuestionOf(r) : null;
      return {
        id: s.id,
        name: cut(s.name),
        asked: cut(s.asked),
        asked_on: s.asked_on.slice(0, 10),
        state: r ? (ROUND_WORDS[r.state] ?? r.state) : "not started",
        ending: r?.ending ? (LEAD_ENDING_WORDS[r.ending] ?? null) : null,
        // No round yet: the view's own zeros.
        qualified: r?.qualified ?? 0,
        review: r?.review ?? 0,
        counted: r?.counted ?? 0,
        question: q ? cut(q) : null,
      };
    }),
    note: "Counted is what came off this month's leads; a search with a question is waiting for the owner's answer.",
  };
}

/** The lead finder (D11): its searches (searches, once list_lead_searches), one action until Phase 4 reads leads. */
export const leadsTool = defineActions({
  name: "leads",
  description:
    "The lead finder, by action; action searches, its one action today, takes nothing more and reads the workspace's lead searches, newest first, as the Leads page lists them: what was asked in the owner's words and when, its state or ending in words, how many qualified, need review and were counted, and, for a search that stopped to ask, its question; beside them, the rail's six counts of leads. Read it before proposing a search, so a plan is not repeated, and to answer about a search the person names. A search with a question is waiting for the owner's answer: words that answer it are propose_lead_search with amends set to that search's id, the same plan with the answer applied; to carry on unchanged or stop it, the owner presses Yes, keep going or Stop here on Leads. Nothing here starts or changes because it was read, and every string is cut short.",
  actions: {
    searches: readAction({
      input: z.object({}),
      examples: [{}],
      label: "Reading your searches",
      run: listLeadSearches,
    }),
  },
});
