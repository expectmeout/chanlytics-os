/**
 * The peek's acts, as named functions over the page's state and the courier (moved from legacy/pages/leads-peek.jsx,
 * decision 0015). A factory, not a hook: LeadsScope calls it on every draw with what it holds, so nothing here keeps state
 * of its own. Keep, Exclude, Put back and Copy are the scope's own (Task 11); this hands them on so the peek has one shape
 * of props.
 */
import { LEAD_OWN_EMAIL_WORDS as OW, LEAD_WORDS as W, leadPeekMenu } from "@chanlytics/contracts";
import type { LeadPeekVM } from "@chanlytics/contracts";
import { actingRole, refusalToast } from "../../legacy-verbs";
import { callBackLeadEmail, draftForLead, eraseLead, sendLeadEmail, setLeadStage, undoLeadOperation } from "../surface";
import type { Armed, DraftData, DraftState, LeadCourier, PeekActs, PeekPage, StageData } from "./types";

/** The acts the peek sends out, through the surface's own doors (../surface.ts); a test hands its stand-in as `courier`. */
const surfaceCourier: LeadCourier = {
  __leadStage: setLeadStage,
  __leadUndo: undoLeadOperation,
  // The wire's own type wants a draft's words; the pane hands it what the page holds, and the route refuses what is not one.
  __leadDraft: (id, input) => draftForLead(id, input as Parameters<typeof draftForLead>[1]),
  __leadErase: eraseLead,
  __leadSend: sendLeadEmail,
  __leadCallBack: callBackLeadEmail,
};

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
  const role = actingRole();
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

/** The draft as the route answered it, in the page's hands. */
const draftOf = (d: DraftData, tone: string): DraftState => ({
  busy: false,
  tone,
  to: d.to,
  subject: d.subject,
  body: d.body,
  mailto: d.mailto,
  refusal: null,
  words: d.words,
  mailFoot: d.mail_foot,
  from: d.from,
  foot: d.foot,
  whyNot: d.why_not,
});

/**
 * The draft (PRD 9.3), for LeadPeekActions: the route writes it and builds the mailto:, so the page encodes nothing. Shorter
 * and Warmer ask the route again with what is on screen. Opening the mail app or copying the words is the moment they
 * might send it, so those two arm "Did you send it?". Send leaves from the mailbox the route named (decision 0094), its
 * Undo the door's own while its grace lasts, which brings the words back to change.
 */
const leadDraftActs = (
  p: PeekPage,
  api: LeadCourier,
  armFor: (kind: "sent" | "call") => void,
  refuse: Refuse,
): Pick<PeekActs, "onDraft" | "onTone" | "onOpenMail" | "onCopyDraft" | "onWords" | "onSend"> => {
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
      p.setDraft(draftOf(r.data, "first"));
    },
    onTone: async (tone) => {
      const d: DraftState = p.draft || {};
      p.setDraft({ ...d, busy: true, tone, refusal: null });
      const r = await api.__leadDraft(vm.id, { tone, previous: { subject: d.subject, body: d.words ?? d.body } });
      if (!r.ok) {
        p.setDraft({ ...d, busy: false, tone, refusal: r.message });
        return;
      }
      p.setDraft(draftOf(r.data, tone));
    },
    onWords: (patch) => {
      const d: DraftState = p.draft || {};
      const words = patch.words ?? d.words ?? "";
      p.setDraft({ ...d, ...patch, words, body: `${words}${d.mailFoot ?? ""}` });
    },
    onSend: async (undone) => {
      const d: DraftState = p.draft || {};
      if (!d.from || !d.subject || !d.words || d.sending) return false;
      p.setDraft({ ...d, sending: true, refusal: null });
      const r = await api.__leadSend(vm.id, { subject: d.subject, body: d.words });
      if (!r.ok) {
        p.setDraft({ ...d, sending: false, refusal: r.message });
        return false;
      }
      p.flash({
        tone: "ok",
        msg: OW.sending(r.data.from),
        undo: async () => {
          const back = await api.__leadCallBack(r.data.message_id);
          if (!back.ok) return refuse(back, OW.notTakenBack);
          p.setMode("draft");
          p.setDraft({ ...d, sending: false });
          undone?.();
          p.flash({ msg: OW.takenBack });
        },
      });
      return true;
    },
    // Opening the mail app or copying the words is the moment they might send it; Draft alone is not.
    onOpenMail: () => {
      if (p.draft && p.draft.mailto) armFor("sent");
    },
    onCopyDraft: async () => {
      const d: DraftState = p.draft || {};
      if (!d.body) return;
      // A clipboard the browser keeps shut copies nothing: said so, and nothing is asked about a send that cannot follow.
      try {
        if (window.navigator && window.navigator.clipboard)
          await window.navigator.clipboard.writeText(`${d.subject}\n\n${d.body}`);
      } catch {
        p.flash({ tone: "warn", msg: W.copyRefused });
        return;
      }
      armFor("sent");
      p.flash({ msg: W.copiedDraft });
    },
  };
};

export const LeadPeekActions = (p: PeekPage): PeekActs => {
  const api = p.courier || surfaceCourier;
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
    onOpenPerson: p.onOpenPerson,
    say: p.flash,
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
    onSpokeWith: (name) => p.setArmed({ ...p.armed, spokeWith: name.slice(0, 80) } as Armed),
    onCancelCall: () => p.setArmed(null),
    onSaveCall: async () => {
      const a = p.armed;
      if (!a || !a.outcome) return;
      p.setArmed(null);
      // Who they spoke with goes only with Interested, the one outcome that makes or names a person (0052).
      const spoke = a.outcome === "interested" && a.spokeWith?.trim() ? { spoke_with: a.spokeWith.trim() } : {};
      await post(
        { kind: "outcome", outcome: a.outcome, ...(a.note ? { note: a.note } : {}), ...spoke },
        "Not recorded",
      );
    },
    ...leadDraftActs(p, api, armFor, refuse),
    onSaidSent: async () => {
      p.setArmed(null);
      // The words it went with, so it keeps a row in History (decision 0094); none where the email was not written here.
      const d = p.draft;
      const words = d && d.subject && d.words ? { subject: d.subject, body: d.words } : null;
      return (await post({ kind: "emailed", ...(words ? { words } : {}) }, "Not marked")) !== null;
    },
    onNotYet: () => p.setArmed(null),
    // A reach-out's story with this lead and its doors (Reach out Part 6, H9), drawn in the body under the fit.
    reachOut: null,
  };
};
