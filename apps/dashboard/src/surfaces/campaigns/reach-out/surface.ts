/**
 * Reach-outs on Playbooks and Templates (Reach out, Part 4 PR 8): the reach-outs surface (`__REACH_OUTS`, the chains
 * GET reach-outs lists, without their reports), and `window.__reachOuts`, the verbs a chain's row presses and (`.words`)
 * every sentence the rows say (contracts reach-out-sheet.ts).
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
  REACH_OUT_SLOTS,
  REACH_OUT_SLOT_WORDS,
  firstNameOf,
  insertSlotAt,
  paceWords,
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
  reachOutRunWordsOf,
  reachOutMayPickDomain,
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
  slotParts,
  stepLabel,
  stepLabelOf,
  HAND_WORDS_MAX,
  REACH_OUT_STOP_WORDS,
  reachOutLineOf,
  reachOutStripOf,
  reachOutTimelineOf,
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
  type ReachOutChainDto,
  type ReachOutChainInput,
  type ReachOutDecision,
  type ReachOutPreviewInput,
  type ReachOutReachDto,
  type BroadcastDetailDto,
} from "@chanlytics/contracts";
import { api, read } from "@/legacy-bridge/api";
import { readCache } from "@/legacy-bridge/read-cache";
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

/** The reaches read in this tab, by search, in memory: one read each until the next write. */
const reaches = readCache<ReachOutReachDto>("reach_out_reach");

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
  save: (body: ReachOutChainInput) => api()("POST reach-outs", { body }),
  /** A chain changed whole: new words send what waits back to the check (R5); a dropped step's work goes (R17). */
  update: (rootId: string, body: ReachOutChainInput) => api()("PUT reach-outs/[id]", { params: { id: rootId }, body }),
  /** One business's email as the chain would write it (R11): it spends the model, so it is asked for by a press. */
  preview: (body: ReachOutPreviewInput) => api()("POST reach-outs/preview", { body }),
  /**
   * A search's reach (the Leads door, the sheet): the answer held for the tab through read-cache.ts, so a door and its
   * sheet read it once, and let go of by the one rule every on-demand read keeps: any write lands, every answer goes
   * (api.ts refresh). Null when it could not be read: the door draws nothing then, never a count it did not read.
   */
  reach: async (searchId: string): Promise<ReachOutReachDto | null> => {
    const held = reaches.peek(searchId);
    if (held) return held;
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
  /** A lead's line under its stage, the strip and the peek's block, by the business's clock. */
  lineOf: (line: ReachOutLeadLineDto): string | null => reachOutLineOf(line, Date.now(), businessZone()),
  stripOf: (d: ReachOutLeadsDto) => (d.lines ? reachOutStripOf(d.lines, d.chain, Date.now(), businessZone()) : null),
  timelineOf: (t: ReachOutLeadTimelineDto) => reachOutTimelineOf(t, Date.now(), businessZone()),
  /** An owner's answer to one held email (R18). */
  decide: (sendId: string, decision: ReachOutDecision) =>
    api()("POST reach-out-sends/[id]/decide", { params: { id: sendId }, body: { decision } }),
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
      if (r && r.ok && !(r.data.reach_out && r.data.reach_out.checking > 0)) return stop();
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
    importLeads: (body: LeadImportInput) => api()("POST lead-searches/import", { body }),
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
    REACH_OUT_SLOTS,
    REACH_OUT_SLOT_WORDS,
    chainHintOf,
    chainPaceOf,
    chainPathWords,
    chainReportWordsOf,
    EMAIL_TEMPLATE_LIST_WORDS,
    emailRowWrittenOf,
    emailTemplateRowsOf,
    emailTemplateWords,
    firstNameOf,
    insertSlotAt,
    nextRunWords,
    paceWords,
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
    reachOutMayPickDomain,
    reachOutPreviewOf,
    reachOutSavedWords,
    reachOutSheetPaceOf,
    reachOutSheetUnreadOf,
    reachOutWhoWords,
    sheetFootWords,
    slotParts,
    startWords,
    stepLabel,
    stepLabelOf,
    HAND_WORDS_MAX,
    stepWhenWords,
    REACH_OUT_STOP_WORDS,
  },
};

declare global {
  interface Window {
    __reachOuts?: typeof reachOuts;
  }
}

export function installReachOuts(): void {
  window.__reachOuts = reachOuts;
}
