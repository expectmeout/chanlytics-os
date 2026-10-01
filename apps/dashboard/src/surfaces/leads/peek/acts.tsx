/**
 * The peek's acts, as named functions over the page's state and the courier (moved from legacy/pages/leads-peek.jsx,
 * decision 0015). A factory, not a hook: LeadsScope calls it on every draw with what it holds, so nothing here keeps state
 * of its own. Keep, Exclude, Put back and Copy are the scope's own (Task 11); this hands them on so the peek has one shape
 * of props.
 */
import { LEAD_WORDS as W, leadPeekMenu } from "@chanlytics/contracts";
import type { LeadPeekVM } from "@chanlytics/contracts";
import { refusalToast } from "../../legacy-verbs";
import { leadReachOutPart, myRole, windowCourier } from "./doors";
import type { Armed, DraftState, LeadCourier, PeekActs, PeekPage, StageData } from "./types";

/** A refusal, said at the page's toast in the route's own words: what did not happen first. */
type Refuse = (r: { message?: string | null } | null | undefined, what: string) => void;

/** The leads an Erase is out for (PR 9): the page draws "Erasing…" a draw later, and a press lands before that. */
const pkErasing = new Set<string>();

/**
 * The ⋯ and Erase (PR 9), for LeadPeekActions: who may erase is contracts' rule over the member's role (View-as
 * included), and a role the page cannot read is not an owner's, so the menu fails closed. Erase is asked in the peek
 * first, since it cannot be undone; yes goes through the one door, the lead leaves the rows (the bridge's eraseLead),
 * the peek closes on it, and a toast says it is gone. One erase at a time for a lead: a second press before the page
 * has drawn "Erasing…" is a no-op.
 */
const leadEraseActs = (p: PeekPage, api: LeadCourier, vm: LeadPeekVM, refuse: Refuse) => {
  const role = myRole();
  return {
    menu: leadPeekMenu(role),
    onEraseAsk: () => p.setMode("erase"),
    onErase: async () => {
      const name = vm.name;
      if (pkErasing.has(vm.id)) return;
      pkErasing.add(vm.id);
      p.setMode("erasing");
      let r;
      try {
        r = await api.__leadErase(vm.id);
      } finally {
        pkErasing.delete(vm.id);
      }
      p.setMode("info");
      if (!r.ok) {
        refuse(r, W.erase.refused);
        return;
      }
      p.setArmed(null);
      p.setDraft(null);
      p.setPeekId(null);
      p.flash({ msg: W.erase.done(name) });
    },
  };
};

/**
 * The draft (PRD 9.3), for LeadPeekActions: the route writes it and builds the mailto:, so the page encodes nothing. Shorter
 * and Warmer ask the route again with what is on screen. Opening the mail app or copying the words is the moment they
 * might send it, so those two arm "Did you send it?".
 */
const leadDraftActs = (
  p: PeekPage,
  api: LeadCourier,
  armFor: (kind: "sent" | "call") => void,
): Pick<PeekActs, "onDraft" | "onTone" | "onOpenMail" | "onCopyDraft"> => {
  const vm = p.vm;
  return {
    onDraft: async () => {
      p.setMode("draft");
      p.setDraft({
        busy: true,
        tone: "first",
        to: vm.reach.email.address,
        subject: "",
        body: "",
        mailto: null,
        refusal: null,
      });
      const r = await api.__leadDraft(vm.id, { tone: "first" });
      if (!r.ok) {
        p.setDraft({
          busy: false,
          tone: "first",
          to: vm.reach.email.address,
          subject: "",
          body: "",
          mailto: null,
          refusal: r.message,
        });
        return;
      }
      p.setDraft({
        busy: false,
        tone: "first",
        to: r.data.to,
        subject: r.data.subject,
        body: r.data.body,
        mailto: r.data.mailto,
        refusal: null,
      });
    },
    onTone: async (tone) => {
      const d: DraftState = p.draft || {};
      p.setDraft({ ...d, busy: true, tone, refusal: null });
      const r = await api.__leadDraft(vm.id, { tone, previous: { subject: d.subject, body: d.body } });
      if (!r.ok) {
        p.setDraft({ ...d, busy: false, tone, refusal: r.message });
        return;
      }
      p.setDraft({
        busy: false,
        tone,
        to: r.data.to,
        subject: r.data.subject,
        body: r.data.body,
        mailto: r.data.mailto,
        refusal: null,
      });
    },
    // Opening the mail app or copying the words is the moment they might send it; Draft alone is not.
    onOpenMail: () => {
      if (p.draft && p.draft.mailto) armFor("sent");
    },
    onCopyDraft: async () => {
      const d: DraftState = p.draft || {};
      if (!d.body) return;
      if (window.navigator && window.navigator.clipboard)
        await window.navigator.clipboard.writeText(`${d.subject}\n\n${d.body}`);
      armFor("sent");
      p.flash({ msg: W.copiedDraft });
    },
  };
};

export const LeadPeekActions = (p: PeekPage): PeekActs => {
  const api = p.courier || windowCourier;
  const vm = p.vm;
  const refuse: Refuse = (r, what) => p.flash(refusalToast(r, what));
  const undoOf = (undo: StageData["undo"]) =>
    undo
      ? async () => {
          const u = await api.__leadUndo(undo.op_id, undo.version);
          if (!u.ok) refuse(u, "Not undone");
        }
      : undefined;
  // Every sentence here is the route's: the door decided what happened, so the page never guesses (PRD 9.6).
  const said = (d: StageData) => {
    const person = d.contact_id;
    return p.flash({
      msg: d.toast,
      undo: undoOf(d.undo),
      action: d.converted && person ? { label: W.open, onClick: () => p.onOpenPerson(person) } : undefined,
    });
  };
  const post = async (input: Parameters<LeadCourier["__leadStage"]>[1], what: string) => {
    const r = await api.__leadStage(vm.id, input);
    if (!r.ok) {
      refuse(r, what);
      return null;
    }
    said(r.data);
    return r.data;
  };
  const armFor = (kind: "sent" | "call") => p.setArmed({ kind, leadId: vm.id, asked: false, outcome: null, note: "" });
  // The owner's own phone and their own mail app: an href this page hands to the browser, never a call we place.
  const dial =
    p.dial ||
    ((href: string | null) => {
      if (href && window.location && window.location.assign) window.location.assign(href);
    });
  const LeadReachOut = leadReachOutPart();
  return {
    onClose: () => {
      p.setArmed(null);
      p.setMode("info");
      p.setDraft(null);
      p.setPeekId(null);
    },
    // The photo, expanded (D5): the page's own state, handed in as `expand`.
    onExpand: () => {
      if (p.expand) p.expand(vm.id);
    },
    onStage: (stage) => post({ kind: "stage", stage }, "Not changed"),
    onBack: () => p.setMode("info"),
    onNotAFit: () => p.setMode("why"),
    // The ⋯ and Erase (PR 9), built beside this (leadEraseActs).
    ...leadEraseActs(p, api, vm, refuse),
    onWhy: async (why) => {
      p.setMode("info");
      await post({ kind: "not_a_fit", why }, "Not set aside");
    },
    onKeep: p.keep,
    onExclude: p.exclude,
    onPutBack: p.putBack,
    onCopy: p.copyEmail,
    onCopyPhone: p.copyPhone,
    // The owner's own phone dials; the question waits until they are back at the tab.
    onCall: () => {
      armFor("call");
      dial(vm.reach.phone ? vm.reach.phone.tel : null);
    },
    // A call made from a desk phone: the same question, and nobody rung.
    onLogCall: () => armFor("call"),
    onOutcome: (outcome) => p.setArmed({ ...p.armed, outcome } as Armed),
    onNote: (note) => p.setArmed({ ...p.armed, note: note.slice(0, W.noteMax) } as Armed),
    onCancelCall: () => p.setArmed(null),
    onSaveCall: async () => {
      const a = p.armed;
      if (!a || !a.outcome) return;
      p.setArmed(null);
      await post({ kind: "outcome", outcome: a.outcome, ...(a.note ? { note: a.note } : {}) }, "Not recorded");
    },
    ...leadDraftActs(p, api, armFor),
    onSaidSent: async () => {
      p.setArmed(null);
      await post({ kind: "emailed" }, "Not marked");
    },
    onNotYet: () => p.setArmed(null),
    // A reach-out's story with this lead and its doors (Reach out Part 6, H9), drawn in the body under the fit.
    reachOut: LeadReachOut ? <LeadReachOut key={vm.id} lead={vm} flash={p.flash} /> : null,
  };
};
