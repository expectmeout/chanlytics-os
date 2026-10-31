/**
 * The Leads scope's acts (moved from legacy/pages/leads-real.jsx, decision 0015). Every one goes through its door
 * (../surface.ts): the route, then the surface patched in place. A toast says what happened and offers Undo through the
 * operation the door answered, which is the only thing an undo names (the review's E9).
 */
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { formatPhoneDisplay, type LeadNotAFitWhy, type LeadRowVM, type LeadsBulkInput } from "@chanlytics/contracts";
import type { ApiRefusal } from "@/client/api";
import { downloadCsv } from "../../kit/download";
import { canDo, refusalToast } from "../../legacy-verbs";
import type { Flash } from "../../people/types";
import {
  bulkLeads,
  excludeLead,
  exportLeadsFile,
  keepLead,
  putBackLead,
  undoLeadOperation,
  type LeadsSurface,
} from "../surface";
import type { Armed, PeekMode } from "../peek/types";
import type { LeadsExportView } from "../surface-types";
import type { LeadView } from "./state";

/** What a door answers, as the page reads it: accepted with its data, or a refusal. */
export type LeadAnswer = { ok: true; data: unknown } | ApiRefusal;
/** What an accepted act may carry: the operation an Undo names, and the door's own sentence. */
interface ActData {
  op_id?: string;
  version?: number;
  toast?: ReactNode;
}
const dataOf = (r: { ok: true; data: unknown }): ActData => (r.data && typeof r.data === "object" ? r.data : {});

// The owner's own clipboard and the owner's own phone: a lead is emailed from their inbox and called from their handset,
// and nothing is sent from here (PRD 0.4).
const plCopy = (text: string) => {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) void navigator.clipboard.writeText(text);
  } catch {
    /* a browser that will not */
  }
};

const plDial = (tel: string) => {
  window.location.href = `tel:${tel}`;
};

interface LeadActsArgs {
  leads: LeadsSurface;
  leadView: LeadView;
  leadBusy: boolean;
  setLeadBusy: (busy: boolean) => void;
  plFlash: Flash;
  setSel: Dispatch<SetStateAction<Set<string>>>;
  setAllMatching: Dispatch<SetStateAction<boolean>>;
  setArmed: (armed: Armed | null) => void;
  setPeekMode: (mode: PeekMode) => void;
  setPeekId: (id: string | null) => void;
  setBulkWhy: (open: boolean) => void;
}

/** The two ways an act ends: the toast with its Undo, or, for a selection, the door's own sentence and the selection spent. */
function leadDoors(a: LeadActsArgs) {
  const { leadBusy, setLeadBusy, plFlash, setSel, setAllMatching } = a;
  const leadUndo = (r: { ok: true; data: unknown }) => {
    const d = dataOf(r);
    return d.op_id
      ? {
          undo: async () => {
            const u = await undoLeadOperation(d.op_id as string, d.version as number);
            if (!u.ok) plFlash(refusalToast(u, "Nothing was put back"));
          },
        }
      : {};
  };
  const leadAct = async (fn: () => Promise<LeadAnswer>, said: ReactNode) => {
    if (leadBusy) return;
    setLeadBusy(true);
    const r = await fn();
    setLeadBusy(false);
    if (!r.ok) {
      plFlash(refusalToast(r, "That did not go through"));
      return;
    }
    plFlash({ msg: said, ...leadUndo(r) });
  };
  // A selection's act (D3): the door's own sentence is the flash -- it says how many, and what stopped or skipped part
  // of it -- and the selection is spent.
  const leadSaid = async (fn: () => Promise<LeadAnswer>) => {
    if (leadBusy) return;
    setLeadBusy(true);
    const r = await fn();
    setLeadBusy(false);
    if (!r.ok) {
      plFlash(refusalToast(r, "That did not go through"));
      return;
    }
    setSel(new Set());
    setAllMatching(false);
    plFlash({ msg: dataOf(r).toast, ...leadUndo(r) });
  };
  return { leadUndo, leadAct, leadSaid };
}

/** A lead's calls and copies: the owner's own phone dials, and the peek opens on that lead to ask how it went. */
function leadReach(a: LeadActsArgs, leadById: (id: string) => LeadRowVM | null) {
  const { plFlash, setArmed, setPeekMode, setPeekId } = a;
  // The owner's own phone dials, and the peek opens on that lead: "How did the call go?" and its six outcomes are drawn
  // there, so a call from a row and a call from the peek end in the same place (Task 14 step 4).
  const callLead = (id: string) => {
    const l = leadById(id);
    if (!l || !l.phone) return;
    setArmed({ kind: "call", leadId: id, asked: false, outcome: null, note: "" });
    setPeekMode("info");
    setPeekId(id);
    plDial(l.phone);
  };
  const copyLead = (id: string) => {
    const l = leadById(id);
    if (!l || !l.email) return;
    plCopy(l.email);
    plFlash({
      msg: (
        <>
          Copied <b>{l.email}</b>
        </>
      ),
    });
  };
  // A call made from a desk phone, a softphone or a mobile that is not this one: the same six outcomes the button arms,
  // without ringing anybody. There was no way to record one, so those calls left no mark on the lead.
  const logLeadCall = (id: string) => {
    const l = leadById(id);
    if (!l) return;
    setArmed({ kind: "call", leadId: id, asked: false, outcome: null, note: "" });
    setPeekMode("info");
    setPeekId(id);
  };
  // The peek's phone line copies the number as it dials (the stored number), and names it as the peek draws it.
  const copyPhone = (id: string) => {
    const l = leadById(id);
    if (!l || !l.phone) return;
    plCopy(l.phone);
    plFlash({
      msg: (
        <>
          Copied <b>{formatPhoneDisplay(l.phone) || l.phone}</b>
        </>
      ),
    });
  };
  // Copy emails says how many of the selection had none you can use, because a silent 12-of-15 is a lie.
  const copyEmails = (picked: readonly LeadRowVM[]) => {
    const usable = picked.filter((l) => l.email && l.emailState !== "invalid");
    plCopy(usable.map((l) => l.email).join(", "));
    const none = picked.length - usable.length;
    plFlash({
      msg: (
        <>
          Copied {usable.length} email{usable.length === 1 ? "" : "s"}
          {none ? `; ${none} had none you can use` : ""}
        </>
      ),
    });
  };
  return { callLead, copyLead, logLeadCall, copyPhone, copyEmails };
}

export const leadActs = (a: LeadActsArgs) => {
  const { leads, leadView, setBulkWhy } = a;
  const canFind = canDo("find");
  // A lead the peek read on its own, on no page loaded (a link to it, or one far down a view), is looked up too, so Keep,
  // Call and Copy from its peek act on it rather than on nothing (PR 9).
  const leadById = (id: string) =>
    leads.rows.find((l) => l.id === id) || (leads.peeked || []).find((l) => l.id === id) || null;
  const searchById = (id: string | null) => leads.searches.find((s) => s.id === id) || null;
  const { leadUndo, leadAct, leadSaid } = leadDoors(a);
  // Each names the search whose class it is in, which is what release A's routes take ({ search_id }).
  const searchOf = (l: LeadRowVM | null) => (leadView && leadView.searchId) || (l && l.searchId) || "";
  // Keep counts the place as Qualified the month it is kept; Exclude is free; Put back is the owner's override of an
  // exclusion, through the door that counts (PRD 8.7). The door answers the operation, and the toast offers it.
  const keep = (id: string) =>
    leadAct(() => keepLead(searchOf(leadById(id)), id), <>Kept. It counts as a lead this month.</>);
  const exclude = (id: string) =>
    leadAct(() => excludeLead(searchOf(leadById(id)), id), <>Excluded. Nothing counted.</>);
  const putBack = (id: string) =>
    leadAct(() => putBackLead(searchOf(leadById(id)), id), <>Put back. It counts as a lead now.</>);
  const bulk = (body: LeadsBulkInput) =>
    leadAct(() => bulkLeads(body), body.action === "contacted" ? <>Marked contacted.</> : <>Not a fit.</>);
  // A view's leads as a file. A press that POSTs, not a link: marking what it took moves the month's count (§0.2), and a GET
  // changes nothing (decision 0047, lane 6). The kit saves the file (on the phone app, through the share sheet); the toast
  // says how many left.
  const exportLeads = async (view: LeadsExportView) => {
    if (a.leadBusy) return;
    a.setLeadBusy(true);
    const r = await exportLeadsFile(view);
    a.setLeadBusy(false);
    if (!r.ok) {
      a.plFlash(refusalToast(r, "The leads could not be exported"));
      return;
    }
    downloadCsv(r.data.file, r.data.csv);
    a.plFlash({
      msg: (
        <>
          Exported {r.data.rows.toLocaleString()} {r.data.rows === 1 ? "lead" : "leads"}.
        </>
      ),
    });
  };
  // Not a fit, for everything selected: the same five whys the peek asks, asked once, one operation, one Undo (Task 15
  // step 4). The pick closes the list; the body is the one LeadsBulkSchema takes, which carries no reason -- the route
  // records not_a_fit for every row it touched, and release C reads the why.
  const bulkNotAFit = (_why: LeadNotAFitWhy, body: LeadsBulkInput) => {
    setBulkWhy(false);
    return leadAct(() => bulkLeads(body), <>Not a fit.</>);
  };
  return {
    canFind,
    searchById,
    leadUndo,
    leadAct,
    leadSaid,
    keepLead: keep,
    excludeLead: exclude,
    putBackLead: putBack,
    ...leadReach(a, leadById),
    bulkLeads: bulk,
    bulkNotAFit,
    exportLeads,
  };
};
export type LeadActs = ReturnType<typeof leadActs>;
