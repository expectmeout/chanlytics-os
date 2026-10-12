/**
 * The plan panel's acts and a kept search's (moved from legacy/pages/leads-real.jsx, decision 0015): Find leads is Ask on
 * this page (spec F1, F2), a next step opens the plan card with what would run, and a kept search is renamed, removed,
 * searched again or run again, each through its door, the toast saying what happened.
 */
import type { ReactNode } from "react";
import {
  leadSearchWords,
  leadsRoute,
  type LeadIdeaDto,
  type LeadSearchDto,
  type LeadSearchPlan,
} from "@chanlytics/contracts";
import { askAbout, openAsk, refusalToast } from "../../legacy-verbs";
import type { Flash } from "../../people/types";
import { leadAnswerPlan, leadFinderApprove } from "../finder/amend";
import type { FinderMore, FinderSet, FinderState } from "../finder/types";
import type { LeadRail } from "../scope/rail";
import {
  moreForSearch,
  removeRoundLeads,
  removeSearch,
  renameSearch,
  readSuggestions,
  setBusinessLine,
  type LeadsSurface,
} from "../surface";
import type { LeadAnswer } from "./acts";
import type { LeadsNav } from "./peek-hooks";
import type { LeadView, SetLeadLine, LeadLine } from "./state";

type RailSearch = LeadRail["searches"][number];

/**
 * What answering a search's question carries (leadAnswerPlan, leadFinderApprove): the question, the search's id and name,
 * what was first asked and what it leaves out, and the Ask thread the search was planned in, so the answer's one Ask turn
 * lands there and amends the same search; the version and count are the route's.
 */
const searchAnswerOf = (s: LeadSearchDto) => ({
  answer: true,
  threadId: s.thread_id || null,
  question: s.round && s.round.question ? s.round.question.sentence : "",
  name: s.name,
  asked: s.asked,
  leavingOut: ((s.plan && s.plan.exclusions) || []).map((x) => x.text),
});

/**
 * Find leads is Ask on this page (spec F1, F2): the takeover on a phone, the Stage on a desktop. A suggestion's words go
 * into the field; the button and the F key open Ask as ⌘K does, keeping whatever the owner left in it (a click event is
 * not words).
 */
const openFind = (words?: unknown) => {
  if (typeof words === "string" && words) askAbout({ mode: "compose", prompt: words });
  else openAsk();
};

export const leadFinderActs = ({
  leadView,
  nav,
  plFlash,
  finder,
  openFinder,
  closeFinder,
  setFinder,
}: {
  leadView: LeadView;
  nav: LeadsNav;
  plFlash: Flash;
  finder: FinderState;
  openFinder: (card: Partial<FinderState>) => void;
  closeFinder: () => void;
  setFinder: (fields: Partial<FinderState>) => void;
}) => {
  // What leadAnswerPlan and leadFinderApprove take: a setter for each field, the panel's one close (closeFinder, which
  // lets go of `more` as it shuts), and `more`, which says whose round an approval belongs to when the plan was opened
  // from a strip, and whether it answers its question.
  const finderSet: FinderSet = {
    close: closeFinder,
    stage: (stage) => setFinder({ stage }),
    words: (words) => setFinder({ words }),
    trace: (trace) => setFinder({ trace }),
    refusal: (refusal) => setFinder({ refusal }),
    proposal: (proposal) => setFinder({ proposal }),
    plan: (plan) => setFinder({ plan }),
    pick: (pick) => setFinder({ pick }),
    more: finder.more,
    idea: !!finder.idea,
  };
  const finderAnswer = (words: string) => leadAnswerPlan(words, finderSet);
  const finderApprove = async (plan: LeadSearchPlan) => {
    const answering = !!(finder.more && finder.more.answer);
    const r = await leadFinderApprove(finder.proposal, plan, finderSet);
    if (r && r.ok && answering) plFlash({ msg: <>Carrying on with your change.</> });
    // A new search lands the owner on it: the strip narrating the run, the classes filling, the address the search's
    // own. Without this they stayed on All leads with a live dot in the rail and nothing saying what was happening -- the
    // receipt's "Leads shows it" was a promise the page had not kept. A top-up or an answer is on a search already open,
    // so it stays.
    const undo = r && r.ok ? (r.undo as { search_id?: string } | undefined) : undefined;
    // An idea's search says its id in the door's answer, an Ask card's in its undo.
    const data = r && r.ok ? (r.data as { search_id?: string } | undefined) : undefined;
    const started = (undo && undo.search_id) || (data && data.search_id);
    if (started && !leadView.searchId) nav(leadsRoute({ searchId: started, list: "all", cls: null }));
    return r;
  };
  // A next step opens the plan card with what would run; nothing starts until the owner approves it there.
  const openPlanFor = (s: LeadSearchDto, plan: LeadSearchPlan, how: "answer" | "more") => {
    // Answering, the answer row behind the card (Change what I asked) is the owner's answer: what they first asked sent
    // back as the answer amended nothing. Otherwise the words are what was asked, for Ask's field (onFinderBack).
    const more: FinderMore = {
      searchId: s.id,
      purpose: "topup",
      ...(how === "answer" ? searchAnswerOf(s) : { answer: false }),
    };
    openFinder({ stage: "plan", words: how === "answer" ? "" : s.asked, proposal: null, plan, more });
  };
  // An idea opens its plan as it is, a new search to approve (00398), its size no more than the month has left; Change
  // what I asked is Ask, with the plan in words. One kept from before ideas were plans opens Ask with its words.
  const openIdea = (idea: LeadIdeaDto, left: number | null) => {
    const words = idea.ask || idea.words;
    if (!idea.plan) return openFind(words);
    const count = left && left < idea.plan.count ? left : idea.plan.count;
    // The plan says it came from an idea (plan.from): the ideas' own measure of whether they are followed.
    openFinder({ stage: "plan", words, proposal: null, plan: { ...idea.plan, count, from: "idea" }, more: null, idea });
  };
  return { finderAnswer, finderApprove, searchAnswerOf, openFind, openPlanFor, openIdea };
};
export type FinderActs = ReturnType<typeof leadFinderActs>;

interface SearchActsArgs {
  leads: LeadsSurface;
  nav: LeadsNav;
  plFlash: Flash;
  leadBusy: boolean;
  setLeadBusy: (busy: boolean) => void;
  leadUndo: (r: { ok: true; data: unknown }) => { undo?: () => Promise<void> };
  leadAct: (fn: () => Promise<LeadAnswer>, said: ReactNode) => Promise<void>;
  /** A view's leads as a file: a POST, since it marks what it took (acts.tsx). */
  exportLeads: (view: { search: string; list: "all"; sort: "fit"; dir: "asc" }) => Promise<void>;
  searchById: (id: string | null) => LeadSearchDto | null;
  setRenaming: (s: RailSearch | null) => void;
  setRemoving: (s: RailSearch | null) => void;
  setRemoveError: (e: string | null) => void;
  leadLine: LeadLine | null;
  setLeadLine: SetLeadLine;
  openFinder: (card: Partial<FinderState>) => void;
}

const NO_LINE: LeadLine = { draft: "", error: null, busy: false };

/** A kept search's own acts (PRD 8.10), each through its door, the toast saying what happened. */
function keptSearchActs(a: SearchActsArgs) {
  const { nav, plFlash, leadBusy, setLeadBusy, leadUndo, setRenaming, setRemoving, setRemoveError } = a;
  // Undo removes the leads nobody has touched and gives their month back; the toast says both numbers and offers the
  // operation the door answered, which is the only thing an undo names (E9).
  const undoRound = async (searchId: string | null | undefined) => {
    if (leadBusy || !searchId) return;
    setLeadBusy(true);
    const r = await removeRoundLeads(searchId);
    setLeadBusy(false);
    if (!r.ok) {
      plFlash(refusalToast(r, "Nothing was removed"));
      return;
    }
    const d = r.data;
    if (!d.removed) {
      plFlash({ msg: <>Nothing to remove — you have worked every one of them.</> });
      return;
    }
    plFlash({
      msg: (
        <>
          Removed {d.removed} · {d.credited} given back
        </>
      ),
      ...leadUndo(r),
    });
  };
  const rename = async (s: RailSearch, name: string) => {
    const n = (name || "").trim();
    if (!n || leadBusy) return;
    setLeadBusy(true);
    const r = await renameSearch(s.id, n);
    setLeadBusy(false);
    if (!r.ok) {
      plFlash(refusalToast(r, `${s.name} was not renamed`));
      return;
    }
    setRenaming(null);
    plFlash({
      msg: (
        <>
          Renamed to <b>{n}</b>
        </>
      ),
    });
  };
  // Removing keeps the leads already worked, and the sentence says how many; the rail loses the row, so the view goes back
  // to all the leads rather than a search that is no longer there.
  const remove = async (s: RailSearch) => {
    if (leadBusy) return;
    setLeadBusy(true);
    setRemoveError(null);
    const r = await removeSearch(s.id);
    setLeadBusy(false);
    if (!r.ok) {
      setRemoveError(r.message || "The search could not be removed.");
      return;
    }
    setRemoving(null);
    plFlash({ msg: <>Removed. The {r.data.kept} you contacted or are talking to are kept.</> });
    nav("clients/leads");
  };
  return { undoRound, renameSearch: rename, removeSearch: remove };
}

export const leadSearchActs = (a: SearchActsArgs) => {
  const { leads, plFlash, leadAct, exportLeads, searchById, leadLine, setLeadLine, openFinder } = a;
  // The first day's business line. The door's PUT keeps it with no items, so the refresh that follows writes new
  // suggestions from the owner's own words.
  const saveBusinessLine = async () => {
    const line = String((leadLine && leadLine.draft) || "").trim();
    if (!line) {
      setLeadLine((l) => ({ ...(l ?? NO_LINE), error: "Say what this business does." }));
      return;
    }
    setLeadLine((l) => ({ ...(l ?? NO_LINE), busy: true, error: null }));
    const r = await setBusinessLine(line);
    if (!r.ok) {
      setLeadLine((l) => ({ ...(l ?? NO_LINE), busy: false, error: r.message || "That could not be saved." }));
      return;
    }
    setLeadLine(null);
    plFlash({ msg: <>Saved. New suggestions from what you said.</> });
    // The saved line clears the ideas on the server; read the new ones now, not at the next cold read.
    void readSuggestions();
  };
  // New ideas from the same line (00399): the line saved again clears the ideas on the server, as a changed line does,
  // and the read that follows writes others. The line is the one the page shows, so nothing of the owner's changes.
  const newIdeas = async () => {
    const line = leads.suggestions ? leads.suggestions.business_line.trim() : "";
    if (!line) return;
    const r = await setBusinessLine(line);
    if (!r.ok) {
      plFlash({ msg: <>{r.message || "New ideas could not be asked for. Try again in a moment."}</> });
      return;
    }
    void readSuggestions();
  };
  // Find new ones runs the same plan again, and only places not already in your leads count (P3).
  const findNewOnes = (s: RailSearch) => {
    const dto = searchById(s.id);
    if (!dto) return undefined;
    return leadAct(
      () => moreForSearch(dto.id, "renew", dto.plan),
      <>Looking for new ones. Only places not already in your leads count.</>,
    );
  };
  // Search again, changed opens the plan card with what was asked, so the owner edits it before anything runs.
  const searchAgain = (s: RailSearch) => {
    const dto = searchById(s.id);
    if (!dto) return;
    // The card draws the plan it is handed: without it the card drew the last strip-born plan, or nothing at all.
    openFinder({
      stage: "plan",
      words: dto.asked,
      proposal: { searchId: dto.id, plan: dto.plan, purpose: "renew" },
      plan: dto.plan,
      more: null,
    });
  };
  const searchWordsFor = (id: string) => leadSearchWords(searchById(id), leads.tz);
  // A search's leads as a file, all of them in the order the table has by default.
  const exportFor = (s: { id: string }) => () => exportLeads({ search: s.id, list: "all", sort: "fit", dir: "asc" });
  return { ...keptSearchActs(a), saveBusinessLine, newIdeas, findNewOnes, searchAgain, searchWordsFor, exportFor };
};
export type SearchActs = ReturnType<typeof leadSearchActs>;
