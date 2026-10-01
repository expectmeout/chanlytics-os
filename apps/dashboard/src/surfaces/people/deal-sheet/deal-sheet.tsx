/**
 * The deal sheet (moved from legacy/components/deal-sheet.jsx, decision 0015, step 5; docs/decisions/0008-a-proposal-is-part-of-
 * the-deal.md): the one place a deal is created or moved. Anything that moves a deal (the person page's card, the thread's
 * Deal group) asks for it with `openDealSheet({ personId, mode, service?, dealId? })`, which says so as a `deal:sheet`
 * event; `DealSheetHost`, drawn once by the frame beside its other overlays, hears it, reads the person through the
 * profile's own courier (the tab's copy first, else the read the person page makes) and draws the record kit's sheet.
 *
 * It says nothing of its own: each mode's title, fields, words and what it opens with are contracts' `dealSheetFor`; the
 * body the deal route takes and what is wrong before a round trip `dealSheetBody`; where a refusal goes `dealSheetRefusal`.
 * It holds the fold registry under its own id (`deal-sheet`), so Cancel asks once about what was typed and the tab asks
 * before closing over it. Save records through the courier's `recordDeal`; with "Send it now" on, the proposal then goes
 * through the Inbox's own reply courier (its receipt, its Undo, its email retry), on the person's conversation. Then the
 * sheet closes, says so, and says `deal:recorded`, which the person page reads again on. A refusal keeps the sheet open,
 * said under the field it names.
 */
import { useEffect, useRef, useState } from "react";
import type { ComponentProps, Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import {
  DEAL_SHEET_WORDS,
  dealSheetBody,
  dealSheetDirty,
  dealSheetFor,
  dealSheetMerge,
  dealSheetRefusal,
  isDealSheetMode,
} from "@chanlytics/contracts";
import type { DealSheetDraft, DealSheetMode, DealSheetProblem, DealSheetVM, PersonVM } from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { gate } from "../../legacy-verbs";
import { Confirm } from "../../kit/confirm/confirm";
import { FailedRead } from "../../kit/empty/empty";
import { FieldError } from "../../kit/field-error/field-error";
import { useRecordFold } from "../../kit/record/hooks";
import { recFolds } from "../../kit/record/registry";
import { RecordSheet } from "../../kit/record/sheet";
import { peekPerson, personDetail, recordDeal } from "../people-detail";
import type { DealBody } from "../people-detail";
import { hasThreadVerbs, hear, saidBy, announce, threadVerbs, usePersonToast } from "../person-verbs";
import type { FlashFn, PersonFlash } from "../person-verbs";
import { DealSheetFields, DealSheetFieldsGlass } from "./fields";
import { useLook } from "../../kit/look/look";

const DEAL_SHEET_ID = "deal-sheet";

/** What the sheet is asked for: a person, what to do, the deal a move is about, and a new proposal's service. */
interface DsAsk {
  personId: string;
  mode: DealSheetMode;
  service: string | null;
  dealId: string | null;
}

/** What the sheet holds: the ask, the person as read, the draft and what it opened with, and where a save stands. */
interface DsState {
  ask: DsAsk | null;
  person: PersonVM | null;
  failed: string | null;
  draft: DealSheetDraft | null;
  opened: DealSheetDraft | null;
  busy: boolean;
  problem: DealSheetProblem | null;
  armed: boolean;
}

const DS_CLOSED: DsState = {
  ask: null,
  person: null,
  failed: null,
  draft: null,
  opened: null,
  busy: false,
  problem: null,
  armed: false,
};

type SetState = Dispatch<SetStateAction<DsState>>;
type FoldHold = ReturnType<typeof useRecordFold>;

/**
 * Ask for the sheet from anywhere: a person, what to do (contracts DEAL_SHEET_MODES), the deal a move is about, and a new
 * proposal's service. True when it was asked for. Published under `window.openDealSheet` for the pages that have not moved.
 */
export function openDealSheet({
  personId = null,
  mode = null,
  service = null,
  dealId = null,
}: {
  personId?: string | null;
  mode?: string | null;
  service?: string | null;
  dealId?: string | null;
} = {}): boolean {
  if (!personId || !mode) return false;
  return announce("deal:sheet", { personId, mode, service: service || null, dealId: dealId || null });
}

/**
 * Something the sheet works out as it draws, tried: the answer, or null with the fault reported. The host is drawn by the
 * frame outside any page's error boundary, so a person it cannot work out is said in the sheet (as a read that failed),
 * never a throw that takes the shell with it.
 */
function worked<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch (err) {
    console.error("The deal sheet could not work this out.", err);
    return null;
  }
}

/** What a toast calls them: their first name, or the whole of a name that is a number or an address. */
function whoOf(p: PersonVM): string {
  const n = String((p && p.name) || "").trim();
  return /^[+\d(]/.test(n) || n.includes("@") ? n : n.split(" ")[0] || n;
}

/** The sheet for an ask over a person as read: worked out on every draw (pure). */
function sheetFor(ask: DsAsk, person: PersonVM): DealSheetVM | null {
  return worked(() =>
    dealSheetFor(ask.mode, person, Date.now(), pageClock().zone(), { dealId: ask.dealId, service: ask.service }),
  );
}

/** What the sheet opens with, for a person as read: contracts' draft for the mode, kept as what "changed" is judged by. */
function begin(ask: DsAsk, person: PersonVM): DsState {
  const made = sheetFor(ask, person);
  const opened = made ? made.draft : null;
  return { ...DS_CLOSED, ask, person, draft: opened, opened };
}

/**
 * What a read of the person changes, as it lands: a sheet opened before they were read fills in as they land; one drawn
 * from the tab's copy, or refused because someone moved the deal since, takes them as they now stand. What was typed stays,
 * with what was said about it; every field left as it opened takes the fresh value, and the fresh draft becomes what
 * "changed" is judged by (contracts dealSheetMerge), so a second Save moves the row as it stands and changes only what was
 * typed here. A save still out keeps its draft: its refusal reads them again.
 */
function settleRead(s: DsState, ask: DsAsk, vm: PersonVM | null): DsState {
  if (s.ask !== ask) return s;
  if (!vm) return s.person ? s : { ...s, failed: DEAL_SHEET_WORDS.gone };
  if (!s.person) return begin(ask, vm);
  if (s.busy) return { ...s, person: vm };
  const fresh = begin(ask, vm);
  const { draft, opened } = s;
  if (!draft || !opened || !fresh.draft) return { ...fresh, problem: s.problem };
  const fresher = fresh.draft;
  const merged = worked(() => dealSheetMerge(draft, opened, fresher)) || fresher;
  return { ...s, person: vm, draft: merged, opened: fresher };
}

/** The person read, through the profile's own courier, every time the sheet opens and after a refusal. */
function readAsk(ask: DsAsk, setSt: SetState): void {
  personDetail(ask.personId).then(
    (vm) => setSt((s) => settleRead(s, ask, vm)),
    (e: unknown) => setSt((s) => (s.ask !== ask || s.person ? s : { ...s, failed: saidBy(e) })),
  );
}

/** The fields each problem can be drawn under, where the mode draws them; anything else is said by the Save. */
function drawnFields(sheet: DealSheetVM, draft: DealSheetDraft): Record<string, boolean> {
  return {
    service: !!sheet.service,
    link: !!sheet.link,
    value: !!sheet.value,
    validUntil: !!sheet.validUntil,
    when: !!sheet.when,
    reason: !!sheet.reason,
    note: !!sheet.note,
    how: !!(sheet.how && draft.how === "form"),
    send: !!sheet.send,
    message: !!(sheet.send && sheet.send.can && draft.send && (draft.link.trim() || draft.message !== null)),
  };
}

/** What a save that recorded nothing says: the courier's own words, or the throw's. */
async function recorded(personId: string, body: DealBody): Promise<{ ok: boolean; message?: string }> {
  try {
    const r = await recordDeal(personId, body);
    return r.ok ? { ok: true } : { ok: false, message: r.message };
  } catch (err) {
    return { ok: false, message: saidBy(err) };
  }
}

/**
 * The send, once the record has settleRead: the Inbox's own courier, so its receipt, its Undo and its email retry are the
 * Inbox's. It says itself; a refusal says the record stood. True when something has said so.
 */
async function sendProposal(person: PersonVM, text: string, flash: FlashFn): Promise<boolean> {
  const W = DEAL_SHEET_WORDS;
  const who = whoOf(person);
  let said = false;
  const speak = (toast: PersonFlash) => {
    said = true;
    flash(
      toast.tone === "danger"
        ? {
            ...toast,
            msg: (
              <>
                {W.notSent} {toast.msg}
              </>
            ),
          }
        : toast,
    );
  };
  let went = false;
  if (person.threadId && hasThreadVerbs()) {
    const t = { id: person.threadId, conversationId: person.threadId.replace(/^th-/, ""), escalationId: null, who };
    try {
      went = await threadVerbs(speak).verb(t, "reply", { text }, W.sent, true);
    } catch {
      went = false;
    }
  }
  // Refused before anything could say why (no conversation to send in, no courier here, or it threw): the record
  // stood, and nothing went.
  if (!went && !said) {
    said = true;
    flash({ tone: "danger", msg: <>{W.unsent}</> });
  }
  return said;
}

/** What the sheet's handlers reach: its state, how it changes, the toast, and the fold's hold. */
interface Host {
  st: DsState;
  setSt: SetState;
  flash: FlashFn;
  fold: RefObject<FoldHold>;
  sheet: DealSheetVM | null;
}

/** Save: the body, or what is wrong with it under its field; the record; the send; then the sheet closes and says so. */
async function save({ st, setSt, flash, fold, sheet }: Host): Promise<void> {
  const { ask, person, draft } = st;
  if (!sheet || sheet.blocked || st.busy || !draft || !ask || !person) return;
  const canSend = !!(sheet.send && sheet.send.can);
  const out = dealSheetBody(ask.mode, draft, sheet.deal, { tz: pageClock().zone(), nowMs: Date.now(), canSend });
  if ("problem" in out) {
    setSt((s) => ({ ...s, problem: out.problem, armed: false }));
    return;
  }
  setSt((s) => ({ ...s, busy: true, problem: null, armed: false }));
  const r = await recorded(ask.personId, out.body);
  if (!r.ok) {
    setSt((s) => (s.ask !== ask ? s : { ...s, busy: false, problem: dealSheetRefusal(r.message) }));
    // What the sheet was opened over may be behind (someone moved the deal since): read them again, so a second Save
    // moves the row as it now stands, or the sheet says it has moved on.
    readAsk(ask, setSt);
    return;
  }
  const said = out.send && canSend ? await sendProposal(person, out.send.text, flash) : false;
  setSt(DS_CLOSED);
  fold.current.close();
  if (!said)
    flash({
      msg: (
        <>
          <b>{whoOf(person)}</b> · {sheet.done}
        </>
      ),
    });
  announce("deal:recorded", { personId: ask.personId });
}

/** The Confirm that asks about what was typed: the fold's own question, or the sheet's Cancel's. */
function discardAsk(props: Pick<ComponentProps<typeof Confirm>, "onYes" | "onNo" | "testid">) {
  const W = DEAL_SHEET_WORDS;
  return (
    <Confirm
      question={W.discard.question}
      detail={W.discard.detail}
      yes={W.discard.yes}
      no={W.discard.no}
      danger
      {...props}
    />
  );
}

/** What stands in the sheet's place: a read that failed, the reading beat, a person that cannot be worked out, or the fields. */
function sheetBody(
  h: Host,
  atField: DealSheetProblem | null,
  set: (patch: Partial<DealSheetDraft>) => void,
  glass: boolean,
): ReactNode {
  const { st, setSt, sheet } = h;
  const W = DEAL_SHEET_WORDS;
  const retry = () => {
    setSt((s) => ({ ...s, failed: null }));
    if (st.ask) readAsk(st.ask, setSt);
  };
  if (st.failed !== null && !st.person)
    return (
      <FailedRead kind="card" what="this person" why={st.failed || null} onRetry={retry} testid="deal-sheet-failed" />
    );
  if (!st.person)
    return (
      <div className="route-reading deal-sheet-reading" role="status">
        {W.reading}
      </div>
    );
  if (!sheet || !st.draft) return <FailedRead kind="card" what="this person" testid="deal-sheet-failed" />;
  if (sheet.blocked)
    return (
      <p className="deal-sheet-said" data-testid="deal-sheet-blocked">
        {sheet.blocked}
      </p>
    );
  // Glass draws the fields as its canvas's one composer, in rows (D3); Classic as the column it always had.
  const Fields = glass ? DealSheetFieldsGlass : DealSheetFields;
  return <Fields sheet={sheet} draft={st.draft} set={set} problem={atField} busy={st.busy} />;
}

/** What the sheet's own presses do: leave, or ask first. */
interface Hands {
  cancel: () => void;
  close: () => void;
}

/** The sheet, over the record kit's: the head, the fields, and the foot's Save and Cancel. */
function drawSheet(h: Host, { cancel, close }: Hands, toastNode: ReactNode, glass: boolean) {
  const { st, setSt, sheet } = h;
  const fold = h.fold.current;
  const ask = st.ask;
  if (!ask) return toastNode;
  const W = DEAL_SHEET_WORDS;
  const sending = !!(sheet && sheet.send && sheet.send.can && st.draft && st.draft.send);
  const ready = !!(sheet && !sheet.blocked && st.draft);
  // A problem is said under the field it names where that field is drawn, and by the Save where it is not.
  const drawn = sheet && st.draft ? drawnFields(sheet, st.draft) : null;
  const atField = st.problem && st.problem.field && drawn && drawn[st.problem.field] ? st.problem : null;
  const general = st.problem && !atField ? st.problem.words : null;
  const set = (patch: Partial<DealSheetDraft>) =>
    setSt((s) => (s.busy || !s.draft ? s : { ...s, draft: { ...s.draft, ...patch }, problem: null, armed: false }));
  const notArmed = () => setSt((s) => ({ ...s, armed: false }));
  const confirm = fold.asking
    ? discardAsk({
        onYes: () => {
          setSt(DS_CLOSED);
          fold.discard();
        },
        onNo: () => {
          notArmed();
          fold.stay();
        },
        testid: "deal-sheet-ask",
      })
    : st.armed
      ? discardAsk({ onYes: close, onNo: notArmed, testid: "deal-sheet-cancel" })
      : null;
  return (
    <>
      <RecordSheet
        id={DEAL_SHEET_ID}
        className="deal-sheet"
        title={sheet ? sheet.title : W.titles[ask.mode]}
        sub={sheet ? sheet.sub : null}
        onClose={cancel}
        onSave={ready ? () => void save(h) : null}
        saving={st.busy}
        saveLabel={sheet ? (sending && sheet.save.withSend ? sheet.save.withSend : sheet.save.label) : W.save[ask.mode]}
        savingLabel={sending ? W.sending : W.saving}
        gate={{ ...gate("approve", "record a deal") }}
        confirm={confirm}
        foot={general ? <FieldError id="deal-sheet-problem" message={general} testid="deal-sheet-problem" /> : null}
      >
        {sheetBody(h, atField, set, glass)}
      </RecordSheet>
      {toastNode}
    </>
  );
}

/** The one deal sheet, drawn once by the frame: it draws nothing until it is asked for. */
export function DealSheetHost() {
  const glass = useLook() === "glass";
  const [toastNode, flash] = usePersonToast();
  const [st, setSt] = useState(DS_CLOSED);
  // The sheet as it stands: the mode's words and fields over the person as read, worked out on every draw (pure).
  const sheet = st.ask && st.person ? sheetFor(st.ask, st.person) : null;
  const { draft, opened } = st;
  const dirty = !!(draft && opened && worked(() => dealSheetDirty(draft, opened)));
  const fold = useRecordFold(DEAL_SHEET_ID, { dirty, saving: st.busy });
  // Counted on the page as a fold is (record kit `drawn`), for the shell's life.
  useEffect(() => recFolds.drawn(DEAL_SHEET_ID), []);
  const foldNow = useRef(fold);
  foldNow.current = fold;
  useEffect(
    () =>
      hear("deal:sheet", (d) => {
        if (typeof d.personId !== "string" || !d.personId || !isDealSheetMode(d.mode)) return;
        const asked: DsAsk = {
          personId: d.personId,
          mode: d.mode,
          service: typeof d.service === "string" && d.service ? d.service : null,
          dealId: typeof d.dealId === "string" && d.dealId ? d.dealId : null,
        };
        const kept = peekPerson(asked.personId);
        setSt(kept ? begin(asked, kept) : { ...DS_CLOSED, ask: asked });
        foldNow.current.request();
        readAsk(asked, setSt);
      }),
    [],
  );
  const close = () => {
    setSt(DS_CLOSED);
    fold.close();
  };
  // Cancel, the head's Close, Escape, a press on the wash and a pull down on a phone: nothing while the save is out, and
  // once, asked, when something was typed.
  const cancel = () => {
    if (st.busy) return;
    if (dirty) {
      setSt((s) => ({ ...s, armed: true }));
      return;
    }
    close();
  };
  if (!fold.open || !st.ask) return toastNode;
  return drawSheet({ st, setSt, flash, fold: foldNow, sheet }, { cancel, close }, toastNode, glass);
}
