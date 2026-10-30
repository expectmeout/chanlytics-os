/**
 * Reach-outs on Playbooks and Templates (Reach out, Part 4 PR 8): the reach-outs surface (the seam's `reach_outs`, mirrored
 * as `__REACH_OUTS`: the chains GET reach-outs lists, without their reports), and `reachOuts`, the verbs a chain's row
 * presses and (`.words`) every sentence the rows say (contracts reach-out-sheet.ts). Leads imports them (surfaces/leads).
 *
 * A chain's report is read when one of its rows opens (R23), here, and only then. Pause and Resume are the playbook's
 * own door on the chain's first step, which a chain's steps follow (run-context: a paused root pauses every step);
 * Remove is the chain's own door, which the database allows only before its first email goes (R16). Every write goes
 * through the typed client, and the refresh map reads the surfaces again behind it.
 */
import {
  asDraftedOf,
  NEW_WORDS,
  HOLD_DOOR_WORDS,
  REACH_OUT_RUN_REREAD_MS,
  REACH_OUT_GAP_MINUTES,
  REACH_OUT_PREVIEW_WORDS,
  REACH_OUT_ROW_WORDS,
  REACH_OUT_SHEET_PARTS,
  REACH_OUT_NEW_LIST_WORDS,
  REACH_OUT_SHEET_WORDS,
  firstNameOf,
  paceWords,
  ownerPaceWords,
  previewLinesOf,
  reachLineOf,
  reachOutAddStep,
  reachOutAddHandStep,
  reachOutSetHandWords,
  reachOutAfterDayChoices,
  reachOutChainBodyOf,
  reachOutDoorOf,
  reachOutDraftIssues,
  reachOutDraftOf,
  reachOutVersionDraftOf,
  reachOutDropStep,
  reachOutMayAddStep,
  reachOutRunMoving,
  reachOutRunWordsOf,
  toSendWordsOf,
  REACH_OUT_SAID_WORDS,
  OWNER_SAID_INTENTS,
  reachOutMayPickMailbox,
  reachOutPreviewOf,
  reachOutSavedWords,
  reachOutSheetPaceOf,
  reachOutSheetUnreadOf,
  reachOutWhoWords,
  sheetFootWords,
  startWords,
  stepWhenWords,
  chainHintOf,
  chainPaceOf,
  chainPathWords,
  chainReportWordsOf,
  EMAIL_TEMPLATE_LIST_WORDS,
  emailRowWrittenOf,
  emailTemplateRowsOf,
  emailTemplateWords,
  nextRunWords,
  stepLabel,
  stepLabelOf,
  HAND_WORDS_MAX,
  REACH_OUT_STOP_WORDS,
  reachOutAddWords,
  isLeadList,
  LEAD_IMPORT_WORDS,
  LEAD_IMPORT_MAX_BYTES,
  LEAD_LIST_MAX,
  leadCheckAgainCents,
  leadChooseAnswerWords,
  leadChooseNameOf,
  leadImportAnswerWords,
  leadImportColumnWords,
  leadImportCountWords,
  leadImportNameOf,
  leadImportPlanOf,
  leadImportReady,
  leadImportSaveLabel,
  leadListEmptyOf,
  leadListStripOf,
  type LeadImportInput,
  type ReachOutAddDto,
  type OwnerSaidIntent,
  type ReachOutReplySaidInput,
  type ReachOutReachDto,
  type BroadcastDetailDto,
  leadChainStepOf,
} from "@chanlytics/contracts";
import type { Input } from "@/client/api";
import { api, read } from "@/legacy-bridge/api";
import { readCache } from "@/legacy-bridge/read-cache";
import { broadcasts } from "../broadcasts/verbs";
import { peekSources, readSources } from "./sources";

/** The reaches read in this tab, by search, in memory: the first paint of a door or a sheet, read again behind it. */
const reaches = readCache<ReachOutReachDto>("reach_out_reach");

/** Where the viewer's next pile on Leads adds (00426): a sequence's Add leads names it (a per-viewer convenience). */
const PILE_TARGET_KEY = "leads.pile.target";

/** A sequence named for the pile's next pass, by its root (or PILE_NEW_LIST), and its name for the page's line. */
export interface PileAsk {
  id: string;
  name: string | null;
}

/** An ask as it was kept: this shape, or a root alone, as it was kept before it carried a name. */
function pileAskOf(raw: string | null): PileAsk | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { id?: unknown; name?: unknown };
    return typeof v.id === "string" ? { id: v.id, name: typeof v.name === "string" ? v.name : null } : null;
  } catch {
    return { id: raw, name: null };
  }
}

/**
 * Where the next pile adds, kept in the tab between Sequences (or a list's door) and Leads: named there, read by Leads'
 * door and line while it stands, and let go as a pile starts or the page's Not now lets it go. A browser that will not
 * keep it has none: the pile offers every sequence fed by a list anyway.
 */
export const pileAsk = {
  set: (id: string, name: string | null = null) => {
    try {
      window.sessionStorage.setItem(PILE_TARGET_KEY, JSON.stringify({ id, name }));
    } catch {
      /* kept nowhere: see above */
    }
  },
  peek: (): PileAsk | null => {
    try {
      return pileAskOf(window.sessionStorage.getItem(PILE_TARGET_KEY));
    } catch {
      return null;
    }
  },
  take: (): PileAsk | null => {
    const asked = pileAsk.peek();
    try {
      window.sessionStorage.removeItem(PILE_TARGET_KEY);
    } catch {
      /* kept nowhere: nothing to let go */
    }
    return asked;
  },
};

/** The business's zone, as the shell's clock holds it. */
const businessZone = (): string => (window.__clock ? window.__clock.zone() : "UTC");

export const reachOuts = {
  /** The business's clock: what a lead's day and time are said in, off the page that read it. */
  zone: businessZone,
  /**
   * Ask's draft of a new sequence to the leads picked (Leads' "A draft by Ask"), from New's one engine (POST sequences/draft,
   * decision 0065): the line a search's leads are drafted from, the workspace's goal and its messages, as New drafts one;
   * its steps as a sequence to leads holds them, and what Ask drafted, which the make keeps beside them (decision 0078
   * step 2).
   */
  draftLeads: async (body: { name: string; lead_ids: string[]; search_name?: string | null }) => {
    const words = body.search_name ? NEW_WORDS.starts.leadsLine(body.search_name) : NEW_WORDS.starts.leadsPicked;
    const who = { kind: "leads" as const, ids: body.lead_ids, label: body.name };
    const r = await api()("POST sequences/draft", {
      body: { words, kind: "sequence", audience: "leads", who },
      once: true,
    });
    return r.ok
      ? {
          ...r,
          data: {
            steps: r.data.steps.map(leadChainStepOf),
            as_drafted: asDraftedOf(
              words,
              r.data.steps.map((s) => s.email),
            ),
          },
        }
      : r;
  },
  /** A chain's report and its search's reach, read when one of its rows opens (Playbooks' chain, a Templates email). */
  report: (rootId: string) => api()("GET reach-outs/[id]", { params: { id: rootId } }),
  remove: (rootId: string) => api()("DELETE reach-outs/[id]", { params: { id: rootId } }),
  /** A search's reach as this tab last read it, if it has: what a door or a sheet paints first. */
  reachHeld: (searchId: string): ReachOutReachDto | null => reaches.peek(searchId),
  /**
   * A search's reach (the Leads door, the sheet), read now and kept for the next paint (read-cache.ts). A door and its sheet
   * read it as they open and again as Leads or the reach-outs move (read-again.ts; the wiring's second audit, X2-1: the
   * count was kept as first read for as long as the tab lived). Null when it could not be read: a door that read none draws
   * nothing then, never a count it did not read.
   */
  reach: async (searchId: string): Promise<ReachOutReachDto | null> => {
    try {
      return await reaches.through(searchId, () => read("GET reach-outs/reach", { query: { search: searchId } }));
    } catch (e) {
      console.error("reach_out_reach_failed", e instanceof Error ? e.message : e);
      return null;
    }
  },
  /** "Stop writing to them" (H10): the door's answer, or its refusal in contracts' words. */
  stopLead: (leadId: string) => api()("POST reach-outs/leads/[id]/stop", { params: { id: leadId } }),
  /** Leave out (00426): one lead off a list-fed reach-out's list before anything left for it, with its undo. */
  leaveOut: (rootId: string, leadId: string) =>
    api()("POST reach-outs/[id]/leads/leave", { params: { id: rootId }, body: { lead_id: leadId } }),
  /** An act of the workbench taken back (lead_undo), by the operation and the version it answered. */
  undoOperation: (opId: string, version: number) =>
    api()("POST lead-operations/[id]/undo", { params: { id: opId }, body: { version } }),
  /** What a reach-out could start from (00426), kept in the tab (sources.ts); null when it could not be read. */
  sources: readSources,
  /** The searches this tab last read for the workspace on screen, or null: what New's first paint draws its starts from. */
  peekSources,
  /** A sequence to leads' chain, saved as its record writes it (00459 PUT sequences/:id/chain: every word checked). */
  saveChain: (sequenceId: string, body: Input<"PUT sequences/[id]/chain">) =>
    api()("PUT sequences/[id]/chain", { params: { id: sequenceId }, body }),
  /** What adding these leads to a sequence would do, written nowhere (00459's add door, dry): each card's answer. */
  checkAdd: (sequenceId: string, leadIds: string[]) =>
    api()("POST sequences/[id]/leads/check", { params: { id: sequenceId }, body: { lead_ids: leadIds } }),
  /** What an add said, dry or done, in one sentence. */
  addWords: (a: ReachOutAddDto, chainName: string) => reachOutAddWords(a, chainName),
  /** What the business wrote back to an email its owner sent, as the owner says it on the lead (00429). */
  sayReply: (leadId: string, body: ReachOutReplySaidInput) =>
    api()("POST reach-outs/leads/[id]/said", { params: { id: leadId }, body, once: true }),
  /** What the owner's word did, by the business's clock: a not now names the day the lead comes back. */
  saidReplyWords: (business: string, intent: OwnerSaidIntent, resumeAt: string | null, referTo: string | null) =>
    REACH_OUT_SAID_WORDS.done(business, intent, { at: resumeAt, tz: businessZone(), nowMs: Date.now() }, referTo),
  /** A run's "Check the held again": every email the check could not answer, back to be checked in one call (R18). */
  recheck: (runId: string) => api()("POST broadcasts/[id]/recheck", { params: { id: runId } }),
  /**
   * A live reach-out run as its block says it (R20–R22): contracts' reachOutRunWordsOf by the business's clock, whose
   * day tells a run from an earlier one; null for a run that is not a reach-out's.
   */
  run: (d: BroadcastDetailDto) => {
    if (!d.reach_out) return null;
    const clock = window.__clock;
    const now = Date.now();
    return reachOutRunWordsOf(d.reach_out, {
      state: d.broadcast.state,
      timezone: clock ? clock.zone() : "UTC",
      today: clock ? clock.dayKey(now) : new Date(now).toISOString().slice(0, 10),
      now,
    });
  },
  /** A run's emails handed to its owner, with their doors (00429): null where none waits, or the run is not a reach-out's. */
  toSend: (d: BroadcastDetailDto) =>
    d.reach_out ? toSendWordsOf(d.reach_out, { timezone: businessZone(), now: Date.now() }) : null,
  /** Whether a live run still moves under its block, so it is read again (the check, or drafts to come). */
  moving: reachOutRunMoving,
  /**
   * While the check still has sends of a run to read, the run's detail read again every fifteen seconds (R21), through
   * the broadcasts courier's own read (and its read cache), each answer handed to `onRead`. It stops by itself once an
   * answer says nothing is being checked, and when the returned stop is called (the block closed): one timer, never two.
   */
  watchRun: (runId: string, onRead: (d: BroadcastDetailDto) => void): (() => void) => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const beat = async () => {
      timer = null;
      const r = await broadcasts.detail(runId).catch(() => null);
      if (stopped) return;
      if (r && r.ok) onRead(r.data);
      // A run no longer checking anything is left alone, and so is one this member may not read or that is gone (a
      // 4xx asks again for nothing); a failed read otherwise tries again at the next beat.
      if (r && r.ok && !(r.data.reach_out && reachOutRunMoving(r.data.reach_out))) return stop();
      if (r && !r.ok && r.status >= 400 && r.status < 500) return stop();
      next();
    };
    const next = () => {
      timer = setTimeout(() => void beat(), REACH_OUT_RUN_REREAD_MS);
    };
    next();
    return stop;
  },
  /**
   * A list of your own (Part 7, 00242): a file's rows as a search a sequence writes to. The door answers or refuses in
   * words (the typed client's result); the rest is contracts' reading of a file (lead-import.ts) and every sentence the
   * import sheet and a list's strip say.
   */
  lists: {
    importLeads: (body: LeadImportInput) => api()("POST lead-searches/import", { body, once: true }),
    planOf: leadImportPlanOf,
    ready: leadImportReady,
    countWords: leadImportCountWords,
    columnWords: leadImportColumnWords,
    saveLabel: leadImportSaveLabel,
    /** A list's name from its file's, by the business's clock when the file has none. */
    nameOf: (fileName: string | null) => leadImportNameOf(fileName, Date.now(), businessZone()),
    /** "Chosen on Sep 28", by the business's clock. */
    chooseNameOf: () => leadChooseNameOf(Date.now(), businessZone()),
    importAnswerWords: leadImportAnswerWords,
    chooseAnswerWords: leadChooseAnswerWords,
    stripOf: leadListStripOf,
    emptyOf: leadListEmptyOf,
    isList: isLeadList,
    cents: leadCheckAgainCents,
    words: LEAD_IMPORT_WORDS,
    max: LEAD_LIST_MAX,
    /** The largest file the sheet reads; one past it is refused before it is read (G:1). */
    maxBytes: LEAD_IMPORT_MAX_BYTES,
  },
  /** Every sentence a chain's row, an email row, the sheet and the Leads door say (contracts reach-out-*.ts). */
  words: {
    HOLD_DOOR_WORDS,
    REACH_OUT_GAP_MINUTES,
    REACH_OUT_PREVIEW_WORDS,
    REACH_OUT_ROW_WORDS,
    REACH_OUT_SHEET_PARTS,
    REACH_OUT_SHEET_WORDS,
    REACH_OUT_NEW_LIST_WORDS,
    chainHintOf,
    chainPaceOf,
    chainPathWords,
    chainReportWordsOf,
    EMAIL_TEMPLATE_LIST_WORDS,
    emailRowWrittenOf,
    emailTemplateRowsOf,
    emailTemplateWords,
    firstNameOf,
    nextRunWords,
    paceWords,
    ownerPaceWords,
    previewLinesOf,
    reachLineOf,
    reachOutAddStep,
    reachOutAddHandStep,
    reachOutSetHandWords,
    reachOutAfterDayChoices,
    reachOutChainBodyOf,
    reachOutDoorOf,
    reachOutDraftIssues,
    reachOutDraftOf,
    reachOutVersionDraftOf,
    reachOutDropStep,
    reachOutMayAddStep,
    reachOutMayPickMailbox,
    reachOutPreviewOf,
    reachOutSavedWords,
    reachOutSheetPaceOf,
    reachOutSheetUnreadOf,
    reachOutWhoWords,
    sheetFootWords,
    startWords,
    stepLabel,
    stepLabelOf,
    HAND_WORDS_MAX,
    stepWhenWords,
    REACH_OUT_STOP_WORDS,
    REACH_OUT_SAID_WORDS,
    OWNER_SAID_INTENTS,
  },
};
