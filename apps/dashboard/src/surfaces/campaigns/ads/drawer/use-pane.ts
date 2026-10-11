/**
 * What an ad's drawer does when it is pressed (MOCKUP): every press is a verb of the page's store (store.ts), which carries the
 * version the ad was drawn from, refuses a stale one, and answers an Undo; the toast says the outcome. Pause, Resume and End
 * change the ad (End, which asks first, has its Undo too); a tapped word of the sentence changes it at once with an Undo in the
 * toast (a raise of spend names its maximum), or, in Edit, changes a draft that Save keeps and Cancel throws away; a change of
 * the offer, the photo, the words or the area sends the ad back for checking, one of the amount or the end date starts right
 * away. The pane is drawn from `adModel` over the ad as it would be, so the sentence, the figures and the foot agree. The
 * drawer keeps no copy of any ad. A press that leaves for another page (a copy, running it again, Ask) asks first about what
 * Edit holds. Where a press asks the platform for something the store has no verb for (a second look, trying again, taking
 * away what was made), the pane says what it did once, and does not do it twice.
 */
import { useState } from "react";
import type { AdArea, AdRead, AdsConfig, AdsRead } from "@chanlytics/contracts";
import { patchRestarts } from "@chanlytics/contracts";
import {
  CHANGED,
  DRAWER,
  PLATFORM_OWNER,
  REVIEW_WITHIN,
  adModel,
  areaOfValue,
  areaWord,
  dayWord,
  editFootOf,
  moneyOf,
  perDayOf,
} from "@chanlytics/contracts/ads-page";
import type { ChipId } from "@chanlytics/contracts/ads-page";
import type { useLegacyToast } from "../../../legacy-verbs";
import { afterMove, askAbout, navigate } from "../../../legacy-verbs";
import { tellOf } from "../store";
import type { AdsVerbs } from "../store";
import type { CalloutAct } from "./callout";
import { applyDraft, changedOf, draftPatch, startDraft, withChip } from "./draft";
import type { Draft, EditId } from "./draft";

/** What the shell's toast takes. */
export type Flash = ReturnType<typeof useLegacyToast>[1];

/** What a question standing in the foot is asking. */
type Asking = "end" | "discard" | "update" | "remove" | null;

/** What the presses read: the ad as it stands, the read it is in, the verbs, and the toast. */
interface PaneIn {
  ad: AdRead;
  read: AdsRead;
  config: AdsConfig;
  verbs: AdsVerbs;
  flash: Flash;
  onClose: () => void;
  /** Opens another address with Back to return (the page's push); without it the shell's own move. */
  onGo?: (route: string) => void;
}

const NO_CHANGES: ReadonlySet<EditId> = new Set();

/** Who checks it, and how long: what a toast about a change says. */
const checkedBy = (ad: AdRead) => ({
  name: ad.name,
  owner: PLATFORM_OWNER[ad.platform],
  within: REVIEW_WITHIN[ad.platform],
});

/** What Pause says: nothing more is spent, and, for a total, when it still ends. */
function pausedWords(ad: AdRead): string {
  if (ad.budget.mode !== "total") return DRAWER.foot.pausedDaily(ad.name);
  const day = dayWord(ad.endDay);
  return ad.platform === "meta" ? DRAWER.foot.paused(ad.name, day) : CHANGED.pausedTotal(ad.name, day);
}

/** Pause, Resume, End: the ad as it runs. Each is said with an Undo, End's too. */
function runningActs({ ad, verbs, flash }: PaneIn, ask: (a: Asking) => void) {
  return {
    pause: () => flash(tellOf(verbs.pause(ad.id, ad.version), pausedWords(ad))),
    resume: () => flash(tellOf(verbs.resume(ad.id, ad.version), DRAWER.foot.resumed(ad.name))),
    end: () => {
      const out = verbs.end(ad.id, ad.version);
      ask(null);
      flash(tellOf(out, DRAWER.menu.ended(ad.name)));
    },
  };
}

/** A tapped word of a running ad, chosen outside Edit: it applies at once, and the toast's Undo puts it back. */
function chipInPlace({ ad, verbs, flash }: PaneIn) {
  const owner = PLATFORM_OWNER[ad.platform];
  return (chip: ChipId, value: string) => {
    if (chip === "end") {
      flash(tellOf(verbs.setEnd(ad.id, ad.version, value), CHANGED.ends(ad.name, dayWord(value))));
    }
    if (chip === "area") {
      const area: AdArea = areaOfValue(value);
      flash(tellOf(verbs.setArea(ad.id, ad.version, area), CHANGED.area(ad.name, areaWord(area), owner)));
    }
    if (chip === "amount") {
      const amount = Number(value);
      const said =
        ad.budget.mode === "total"
          ? CHANGED.total(ad.name, moneyOf(amount, ad.currency))
          : CHANGED.daily(ad.name, perDayOf(amount, ad.currency));
      flash(tellOf(verbs.setBudget(ad.id, ad.version, amount), said));
    }
  };
}

/** Edit: the draft, what it has moved, Save and the question Cancel asks. */
function editActs({ ad, read, verbs, flash }: PaneIn, draft: Draft | null, setDraft: (d: Draft | null) => void) {
  const changed = draft ? changedOf(ad, draft) : NO_CHANGES;
  const change = (f: (d: Draft) => Draft) => {
    if (draft) setDraft(f(draft));
  };
  const save = () => {
    if (!draft) return;
    // A turned-down ad that is fixed goes back to its platform, and the callout that asked for the fix goes.
    const patch = draftPatch(ad, draft);
    const msg = patchRestarts(ad, patch) ? CHANGED.savedChecking(checkedBy(ad)) : CHANGED.saved(ad.name);
    const out = verbs.save(ad.id, ad.version, patch);
    flash(tellOf(out, msg));
    if (out.ok) setDraft(null);
  };
  return {
    changed,
    start: () => (draft ? undefined : setDraft(startDraft(ad))),
    save,
    chip: (chip: ChipId, value: string) => change((d) => withChip(d, chip, value, { read, ad })),
    words: (copy: Draft["copy"]) => change((d) => ({ ...d, copy })),
    photo: () => change((d) => ({ ...d, photo: d.photo + 1 })),
  };
}

export function usePane(input: PaneIn) {
  const { ad, read, config, verbs, flash } = input;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [asking, setAsking] = useState<Asking>(null);
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  const [typed, setTyped] = useState<string | null>(null);
  const [spent, setSpent] = useState<ReadonlySet<CalloutAct>>(new Set());
  const shown = draft ? applyDraft(ad, draft, read) : ad;
  const vm = adModel(shown, read, config, ad);
  const edit = editActs(input, draft, setDraft);
  const ask = (a: Asking) => {
    setAsking(a);
    if (a === null) setLeaving(null);
  };
  const running = runningActs(input, ask);
  /** Leaving for another page: what Edit holds is asked about first. */
  const leave = (then: () => void) => {
    if (edit.changed.size === 0) return then();
    setLeaving(() => then);
    setAsking("discard");
  };
  const go = (route: string) => leave(() => (input.onGo ?? navigate)(route));
  const rest = (act: CalloutAct) => setSpent(new Set([...spent, act]));
  const inPlace = chipInPlace(input);
  const calloutAct = (act: CalloutAct) => {
    const said = checkedBy(ad);
    if (act === "resume") running.resume();
    if (act === "update") ask("update");
    if (act === "fix") edit.start();
    if (act === "fresh") go(vm.go.copy);
    if (act === "remove") ask("remove");
    // The platform is asked for a second look (the ad stays as it is until it answers), or to try again: said once.
    if (act === "again") {
      rest(act);
      flash({ msg: CHANGED.asked(said) });
    }
    if (act === "retry") {
      rest(act);
      flash({ msg: CHANGED.retrying(said.owner) });
    }
  };
  /** The sheet's Close, Escape and ✕: out of a question first, then out of Edit (asking first about what it holds), then out. */
  const close = () => {
    if (asking !== null) ask(null);
    else if (draft && edit.changed.size > 0) setAsking("discard");
    else if (draft) setDraft(null);
    else input.onClose();
  };
  return {
    ad: shown,
    saved: ad,
    offers: read.services,
    vm,
    editing: draft !== null,
    changed: edit.changed,
    // Edit's foot: what its changes do, and the primary's words (a raise names its most).
    editFoot: draft ? editFootOf({ ad, next: shown, patch: draftPatch(ad, draft), n: edit.changed.size }) : null,
    asking,
    ask,
    typed,
    close,
    running,
    calloutAct,
    spent,
    edit,
    go,
    // A chip chosen is the draft's in Edit, and the ad's own, said at once, outside it.
    onChip: draft ? edit.chip : inPlace,
    answer: {
      update: () => {
        ask(null);
        flash(tellOf(verbs.setOffer(ad.id, ad.version, ad.serviceId), CHANGED.updated(checkedBy(ad))));
      },
      remove: () => {
        ask(null);
        rest("remove");
        flash({ msg: CHANGED.removing(PLATFORM_OWNER[ad.platform]) });
      },
    },
    discard: () => {
      const then = leaving;
      setAsking(null);
      setLeaving(null);
      setDraft(null);
      then?.();
    },
    copy: () => go(vm.go.copy),
    again: () => go(vm.go.again),
    askAboutAd: () =>
      leave(() => afterMove(input.onClose, () => askAbout({ about: { kind: "ad", id: ad.id, label: ad.name } }))),
    rename: (value: string) => {
      setTyped(value);
      if (!value.trim()) return;
      const out = verbs.rename(ad.id, ad.version, value.trim());
      if (!out.ok) flash(tellOf(out, ""));
    },
    renamed: () => {
      if (typed === null) return;
      setTyped(null);
      flash({ msg: CHANGED.renamed(ad.name) });
    },
  };
}

export type Pane = ReturnType<typeof usePane>;
