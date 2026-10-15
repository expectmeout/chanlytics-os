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
  HOLD_DOOR_WORDS,
  REACH_OUT_RUN_REREAD_MS,
  REACH_OUT_GAP_MINUTES,
  REACH_OUT_PREVIEW_WORDS,
  REACH_OUT_ROW_WORDS,
  REACH_OUT_SHEET_PARTS,
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
  reachOutLineOf,
  reachOutStripOf,
  reachOutTimelineOf,
  reachOutStandingOf,
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
  type LeadChooseInput,
  type LeadImportInput,
  type ReachOutLeadLineDto,
  type ReachOutLeadTimelineDto,
  type ReachOutLeadsDto,
  type ReachOutAddDto,
  type ReachOutChainPeopleDto,
  type ReachOutChainDto,
  type ReachOutChainInput,
  type OwnerSaidIntent,
  type ReachOutReplySaidInput,
  type ReachOutPreviewInput,
  type ReachOutReachDto,
  type ReachOutSourceDto,
  type BroadcastDetailDto,
} from "@chanlytics/contracts";
import { api, read } from "@/legacy-bridge/api";
import { readCache } from "@/legacy-bridge/read-cache";
import { declareReads } from "@/legacy-bridge/surface-registry";
import { broadcasts } from "../broadcasts/verbs";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { declareSurfaceValue, setSurfaceValue } from "../../surface-values";

/** The chains GET reach-outs lists; null when they could not be read (each page says so), never an empty list it did not read. */
export type ReachOutsSurface = ReachOutChainDto[] | null;

// Leads (reach-out-leads.jsx) reads this under its old name until it moves.
declareSurfaceValue("reach_outs", "__REACH_OUTS");

/**
 * The reach-outs surface: the workspace's chains (GET reach-outs, without their reports, R23) as `__REACH_OUTS`, set
 * the moment they are read. Playbooks draws them as rows, and Templates its email rows from them through contracts
 * (emailTemplateRowsOf; R19: `__TEMPLATES_ALL` stays WhatsApp's for its three readers). Null when the chains could not
 * be read: each page says so, never an empty list it did not read. A count of what a chain wrote is its report, read
 * when one of its rows opens, never here: this read, which every page pays, scans no audience. Its own surface, so
 * neither the moments' read nor Settings' waits on it.
 */
export const reachOutsOverride: SurfaceOverride = {
  key: "reach_outs",
  value: "reach_outs",
  events: ["surface:reach_outs"],
  // A chain paused or resumed elsewhere (00376), and a step's run made, approved or stopped (00321), move its row and
  // its Approve: heard wherever the tab is. A message is no chain's, and is never heard here. A reply read, drafted or undone
  // (reach_out_replies, 00222) is, since the reading ends a held email and a 'no' ends the person's offers (0047, S1-14): a few a day.
  // And the rule that says whether a chain's reply is answered on its own, its mode (W-review-facts-rules-8): a few saves a month.
  // And the templates a chain's emails are written from (Meta's verdict, the words), and a deal: a lead's deal won counts once in
  // a reach-out's People cell (00426). Each a few a week, and the chains' read scans no audience: heard wherever the chains are.
  ...declareReads("reach_outs", {
    reads: ["campaign", "send", "reach_out", "rules", "template", "deal"],
    fresh: "live",
  }),
  apply: async () => {
    try {
      setSurfaceValue("reach_outs", (await read("GET reach-outs")).chains);
    } catch (e) {
      // Null, not undefined, and said at once: each page draws what could not be read instead of waiting for it.
      setSurfaceValue("reach_outs", null);
      window.dispatchEvent(new CustomEvent("surface:reach_outs"));
      throw e;
    }
  },
};

/** The reaches read in this tab, by search, in memory: the first paint of a door or a sheet, read again behind it. */
const reaches = readCache<ReachOutReachDto>("reach_out_reach");

/** Where the viewer's next pile on Leads adds (00426): a reach-out's Add leads names it (a per-viewer convenience). */
export const PILE_TARGET_KEY = "leads.pile.target";
/** The same key's word for a list of the pile's own: New message's Leads you add (Write to the N makes it). */
export const PILE_NEW_LIST = "new";

/** The business's zone, as the shell's clock holds it. */
const businessZone = (): string => (window.__clock ? window.__clock.zone() : "UTC");

/**
 * Leads while a reach-out writes, and one lead's story (Part 6, H8, H9): each read when a page asks, never held, and
 * null when it could not be read, so the page draws nothing of it rather than a line it did not read.
 */
async function readLeads(query: { search?: string; lead?: string }): Promise<ReachOutLeadsDto | null> {
  try {
    return await read("GET reach-outs/leads", { query });
  } catch (e) {
    console.error("reach_out_leads_failed", e instanceof Error ? e.message : e);
    return null;
  }
}

export const reachOuts = {
  /** A chain's report and its search's reach, read when one of its rows opens (Playbooks' chain, a Templates email). */
  report: (rootId: string) => api()("GET reach-outs/[id]", { params: { id: rootId } }),
  pause: (rootId: string) => api()("PUT playbooks/[id]", { params: { id: rootId }, body: { state: "paused" } }),
  resume: (rootId: string) => api()("PUT playbooks/[id]", { params: { id: rootId }, body: { state: "running" } }),
  remove: (rootId: string) => api()("DELETE reach-outs/[id]", { params: { id: rootId } }),
  /** A new chain, saved and its first step run now (R13, R14): the answer carries what the run did. */
  save: (body: ReachOutChainInput) => api()("POST reach-outs", { body, once: true }),
  /** A chain changed whole: new words send what waits back to the check (R5); a dropped step's work goes (R17). */
  update: (rootId: string, body: ReachOutChainInput) => api()("PUT reach-outs/[id]", { params: { id: rootId }, body }),
  /** One business's email as the chain would write it (R11): it spends the model, so it is asked for by a press. */
  preview: (body: ReachOutPreviewInput) => api()("POST reach-outs/preview", { body, once: true }),
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
  /** An open search's chain and its leads' lines (Part 6, H8): null when it could not be read. */
  leadLines: (searchId: string) => readLeads({ search: searchId }),
  /** One lead's story for its peek (H9): null when it could not be read, or the workspace holds no such lead. */
  leadTimeline: async (leadId: string): Promise<ReachOutLeadTimelineDto | null> =>
    (await readLeads({ lead: leadId }))?.timeline ?? null,
  /** "Stop writing to them" (H10): the door's answer, or its refusal in contracts' words. */
  stopLead: (leadId: string) => api()("POST reach-outs/leads/[id]/stop", { params: { id: leadId } }),
  /** Leads added to a list-fed reach-out (00426): what joined, with its undo, or the door's refusal in words. */
  addLeads: (rootId: string, leadIds: string[]) =>
    api()("POST reach-outs/[id]/leads", { params: { id: rootId }, body: { lead_ids: leadIds } }),
  /** What adding them would do, nothing written (00426, dry): how many would join, and why each other would not. */
  checkAdd: (rootId: string, leadIds: string[]) =>
    api()("POST reach-outs/[id]/leads/check", { params: { id: rootId }, body: { lead_ids: leadIds } }),
  /** The workspace's reach-outs as Playbooks lists them, read now (the pile's targets): null when they could not be. */
  chainsNow: async (): Promise<ReachOutChainDto[] | null> => {
    try {
      return (await read("GET reach-outs")).chains;
    } catch (e) {
      console.error("reach_out_chains_failed", e instanceof Error ? e.message : e);
      return null;
    }
  },
  /** Leave out (00426): one lead off a list-fed reach-out's list before anything left for it, with its undo. */
  leaveOut: (rootId: string, leadId: string) =>
    api()("POST reach-outs/[id]/leads/leave", { params: { id: rootId }, body: { lead_id: leadId } }),
  /** An act of the workbench taken back (lead_undo), by the operation and the version it answered. */
  undoOperation: (opId: string, version: number) =>
    api()("POST lead-operations/[id]/undo", { params: { id: opId }, body: { version } }),
  /** What a reach-out could start from (00426), read when New message's Write to leads is chosen; null when it could not be. */
  sources: async (): Promise<ReachOutSourceDto[] | null> => {
    try {
      return (await read("GET reach-outs/sources")).sources;
    } catch (e) {
      console.error("reach_out_sources_failed", e instanceof Error ? e.message : e);
      return null;
    }
  },
  /** What an add said, dry or done, in one sentence. */
  addWords: (a: ReachOutAddDto, chainName: string) => reachOutAddWords(a, chainName),
  /** Who is in a reach-out (00426), its drawer's People: null when it could not be read. */
  people: async (rootId: string, limit?: number): Promise<ReachOutChainPeopleDto | null> => {
    try {
      return await read("GET reach-outs/[id]/people", {
        params: { id: rootId },
        ...(limit ? { query: { limit } } : {}),
      });
    } catch (e) {
      console.error("reach_out_people_failed", e instanceof Error ? e.message : e);
      return null;
    }
  },
  /** Where a lead stands in its reach-out, the one line every page says (00426), by the business's clock. */
  standingOf: (t: ReachOutLeadTimelineDto) => reachOutStandingOf(t, Date.now(), businessZone()),
  /** A lead's line under its stage, the strip and the peek's block, by the business's clock. */
  lineOf: (line: ReachOutLeadLineDto): string | null => reachOutLineOf(line, Date.now(), businessZone()),
  stripOf: (d: ReachOutLeadsDto) => (d.lines ? reachOutStripOf(d.lines, d.chain, Date.now(), businessZone()) : null),
  timelineOf: (t: ReachOutLeadTimelineDto) => reachOutTimelineOf(t, Date.now(), businessZone()),
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
   * A list of your own (Part 7, 00242): a file's rows, or leads chosen on Leads, as a search a reach-out writes to. The
   * two doors answer or refuse in words (the typed client's result); the rest is contracts' reading of a file
   * (lead-import.ts) and every sentence the import sheet, *Write to them* and a list's strip say.
   */
  lists: {
    importLeads: (body: LeadImportInput) => api()("POST lead-searches/import", { body, once: true }),
    chooseLeads: (body: LeadChooseInput) => api()("POST lead-searches/chosen", { body }),
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
