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
  type LeadPeoplePlan,
  type LeadSearchPlan,
  type LeadSuggestionsDto,
} from "@chanlytics/contracts";
import { askAbout, openAsk, refusalToast } from "../../legacy-verbs";
import type { Flash } from "../../people/types";
import { leadAnswerPlan, leadFinderApprove } from "../finder/amend";
import type { FinderMore, FinderSet, FinderState } from "../finder/types";
import type { LeadRail } from "../scope/rail";
import {
  lineWrittenForMe,
  moreForSearch,
  newSuggestions,
  removeRoundLeads,
  removeSearch,
  renameSearch,
  readSuggestions,
  ideaCard,
  setBusinessLine,
  type LeadsSurface,
} from "../surface";
import { surfaceValue } from "../../surface-values";
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

/**
 * The first day's field, typed and sent (Ruben, 22 Oct 2026: it was a door that only opened Ask): Ask opens on this
 * surface and asks the words as they were typed, its plan card coming back as any Find's does (spec F1).
 */
const askFind = (words: string) => {
  const said = words.trim();
  // A conversation of its own, never the one Ask still holds from earlier (Ruben, 23 Oct 2026).
  if (said) askAbout({ prompt: said, fresh: true });
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
  // An idea opens Ask on its card (Ruben, 23 Oct 2026: "allow the ask to open up and provide a card … if user wants to
  // tweak anything they can just conversate with the ask"): the card made from the idea's own plan, places or people, with
  // no model asked, kept as the first answer of a thread of its own (POST ask/idea), which Ask opens. A change is said
  // there, and Find is the card's. One kept from before ideas were plans is asked of Ask with its words.
  const openIdea = async (idea: LeadIdeaDto) => {
    if (!idea.plan && !idea.people) return askFind(idea.ask || idea.words);
    const r = await ideaCard(idea.words);
    if (!r.ok) {
      plFlash(refusalToast(r, "That idea didn't open"));
      return;
    }
    askAbout({ thread: r.data.thread.id });
  };
  return { finderAnswer, finderApprove, searchAnswerOf, openFind, askFind, openPlanFor, openIdea };
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
  /** Find people, filled in with a people search's plan (00430): what its Search again opens. */
  openFindPeople: (from?: LeadPeoplePlan | null) => void;
}

const NO_LINE: LeadLine = { draft: "", error: null, busy: false };

/** How long Write it for me waits on a write another read holds, before the sheet lets the page say it is writing. */
const LINE_WRITTEN_WAIT_MS = 45_000;

/** The ideas once a read lays them on the view written (the Leads surface's own value), or null where none has within `ms`. */
const ideasLanded = (ms: number): Promise<LeadSuggestionsDto | null> =>
  new Promise((done) => {
    const finish = (s: LeadSuggestionsDto | null) => {
      window.removeEventListener("surface:leads", look);
      clearTimeout(timer);
      done(s);
    };
    const look = () => {
      const s = surfaceValue("leads")?.suggestions;
      if (s && !s.pending) finish(s);
    };
    const timer = setTimeout(() => finish(null), ms);
    window.addEventListener("surface:leads", look);
  });

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
  // New ideas from the same line (decision 0070): the ideas shown are passed on and three others written now, so a
  // press is never the same three again. Nothing of the owner's line changes.
  const newIdeas = async () => {
    if (!leads.suggestions) return;
    const r = await newSuggestions();
    if (!r.ok) plFlash({ msg: <>{r.message || "New ideas could not be asked for. Try again in a moment."}</> });
  };
  // Write it for me (22 Oct 2026): the owner's line let go, and the line written from the profile, the customers and the
  // searches, with three new ideas from it. The sheet stays open and shows the line it wrote, which the owner may keep
  // (Done) or change (then it is theirs, and saved as theirs); it closed on the press, which read as the press going
  // nowhere (Ruben, 22 Oct 2026). What went wrong is said in the sheet. A sheet closed meanwhile stays closed.
  const writeLineForMe = async () => {
    setLeadLine((l) => ({ ...(l ?? NO_LINE), writing: true, error: null }));
    const r = await lineWrittenForMe();
    if (!r.ok) {
      setLeadLine((l) => l && { ...l, writing: false, error: r.message || "That could not be written. Try again." });
      return;
    }
    // Held by another write: the ideas the page's own reads lay on the view once they land written, so the sheet shows
    // the line written rather than the one let go.
    const written = r.data.pending ? await ideasLanded(LINE_WRITTEN_WAIT_MS) : r.data;
    if (!written) {
      // Still held: the page reads on, and says it is writing where the ideas stand.
      setLeadLine(null);
      plFlash({ msg: <>Writing your line and new ideas…</> });
      return;
    }
    const line = written.business_line;
    setLeadLine((l) => l && { ...l, draft: line, written: line, writing: false, error: null });
  };
  // Find new ones runs the same plan again, and only places not already in your leads count (P3).
  const findNewOnes = (s: RailSearch) => {
    const dto = searchById(s.id);
    const plan = dto?.plan;
    if (!dto || !plan) return undefined;
    return leadAct(
      () => moreForSearch(dto.id, "renew", plan),
      <>Looking for new ones. Only places not already in your leads count.</>,
    );
  };
  // Search again, changed opens the plan card with what was asked, so the owner edits it before anything runs.
  const searchAgain = (s: RailSearch) => {
    const dto = searchById(s.id);
    if (!dto) return;
    // A people search opens its own sheet with what was asked (00430): a people plan never reaches the places card.
    if (dto.people) {
      a.openFindPeople(dto.people);
      return;
    }
    const plan = dto.plan;
    if (!plan) return;
    // The card draws the plan it is handed: without it the card drew the last strip-born plan, or nothing at all.
    openFinder({
      stage: "plan",
      words: dto.asked,
      proposal: { searchId: dto.id, plan, purpose: "renew" },
      plan,
      more: null,
    });
  };
  const searchWordsFor = (id: string) => leadSearchWords(searchById(id), leads.tz);
  // A search's leads as a file, all of them in the order the table has by default.
  const exportFor = (s: { id: string }) => () => exportLeads({ search: s.id, list: "all", sort: "fit", dir: "asc" });
  return {
    ...keptSearchActs(a),
    saveBusinessLine,
    writeLineForMe,
    newIdeas,
    findNewOnes,
    searchAgain,
    searchWordsFor,
    exportFor,
  };
};
export type SearchActs = ReturnType<typeof leadSearchActs>;
