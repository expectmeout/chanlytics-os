/**
 * The new conversation sheet's state (a conversation begins from the Inbox, the design's 4.2 to 4.6): what is written
 * and kept in the tab, who was picked, how they can be reached, what Ask answered, the approved messages, and the acts.
 * The rules are contracts' (the reach read's writeWaysOf, inboxTemplates, planNoteOf) and the calls verbs.ts's: this
 * decides nothing the server does not decide again.
 *
 * It imports nothing of People's pages and nothing of the record kit (kit/record). The sheet is loaded on demand, and
 * either of those in its chunk makes the bundler repack a chunk the whole route shares, so that People, Sent and
 * Templates each download a second copy of it (thirteen to twenty kilobytes gzipped, measured on 7 October 2026, build
 * by build). What the record kit would have given it, the tab's memory of a half-written message, it asks of the tab
 * itself, as the thread's own reply box does.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MIN_MS,
  NEW_CONVERSATION_WORDS as W,
  inboxTemplates,
  planNoteOf,
  type CallBrief,
  type ConsentChannel,
  type DraftAsk,
  type DraftHow,
  type DraftTone,
  type PersonReachDto,
  type PersonRowVM,
  type WriteWay,
} from "@chanlytics/contracts";
import { offeredWhatsApp } from "../../offered-templates";
import { useSurface } from "../../use-surface";
import { clockZone, navigate, tabMemory } from "../shell";
import type { Flash } from "../shell";
import type { ApprovedTemplate } from "../types";
import { addByNumber, askDraft, findPeople, keepNote, readReach, sendFirst, undoFirst } from "./verbs";
import { openNewConversation } from "./store";
import type { FirstMessage } from "./verbs";

/** The tab's memory of it (the Inbox's shell door to it): one new conversation at a time. */
const KIND = "conversation";
/** How long the pick waits after a key before it asks the server who matches. */
const SEARCH_WAIT_MS = 250;
/** How many people the pick offers at once. */
const PICK_MAX = 8;
/** Nobody held: one value, so a draw with nobody is the same draw as the last. */
const NO_ROWS: readonly PersonRowVM[] = [];

/** What is written, and kept in the tab until it is sent or thrown away. */
interface Written {
  personId: string | null;
  /** Message or call, as the member chose; null takes what the person can be reached by. */
  how: DraftHow | null;
  about: string;
  /** The wire the member chose; null takes the one the reach read opens on. */
  wire: ConsentChannel | null;
  subject: string;
  text: string;
  /** The approved message chosen (approvedKey); null takes the first that can go. */
  approved: string | null;
  /** Who answers, as the member chose; null takes the receptionist where there is a choice. */
  then: "receptionist" | "me" | null;
  /** The note as the member changed it; null is the one the sheet writes (Ask's, else the plan in a sentence). */
  note: string | null;
  keepNote: boolean;
  /** What the member answered to each of Ask's questions, by the question's key. */
  answers: Record<string, string>;
  /** After a call: how it went, and whether the receptionist should know. */
  after: string;
  tell: boolean;
}

const EMPTY: Written = {
  personId: null,
  how: null,
  about: "",
  wire: null,
  subject: "",
  text: "",
  approved: null,
  then: null,
  note: null,
  keepNote: true,
  answers: {},
  after: "",
  tell: true,
};

/** What the tab kept, when it is for the person the sheet opens on (or the sheet opens on nobody in particular). */
export function writtenFor(personId: string | null, kept: Partial<Written> | null): Written {
  if (!kept || (personId && kept.personId !== personId)) return { ...EMPTY, personId };
  return { ...EMPTY, ...kept };
}

/** An approved message, named as the choice keeps it. */
export const approvedKey = (t: Pick<ApprovedTemplate, "name" | "language">): string => `${t.name} ${t.language}`;

/**
 * Who answers what they write back (the design's 4.4). There is a choice where the receptionist answers this person
 * and the wire is a phone's; it defaults to the receptionist. Otherwise the thread is handed back, and their answer
 * comes to the team in Needs you.
 */
export function whoAnswers(
  reach: Pick<PersonReachDto, "receptionist">,
  wire: ConsentChannel | null,
  chosen: Written["then"],
): { choice: boolean; then: "receptionist" | "me" } {
  const choice = reach.receptionist.answers && wire !== null && wire !== "email";
  return { choice, then: choice ? (chosen ?? "receptionist") : "receptionist" };
}

/**
 * What the send is handed from the sheet: the way, the approved message chosen, who answers, and the address an email
 * goes to where the server asked the member to agree to it (the one on their page is not the one they last wrote from).
 */
interface SendFacts {
  way: WriteWay | null;
  chosen: { template: Pick<ApprovedTemplate, "name" | "language"> } | null;
  who: ReturnType<typeof whoAnswers> | null;
  emailTo?: string | null;
}

/**
 * What the send carries (verbs.ts FirstMessage): the wire, the words or the approved message chosen, a subject for an
 * email, who answers, and the plan as the note the receptionist reads, where it answers this person and the member
 * kept the note. The verb keeps the note once the message is queued, before the thread is handed back. Null with no
 * way to send.
 */
export function firstMessageOf(
  st: SendFacts,
  written: Pick<Written, "text" | "subject" | "keepNote">,
  note: string,
): FirstMessage | null {
  const { way, chosen, who, emailTo } = st;
  if (!way || !who) return null;
  const plan = who.choice && who.then === "receptionist" && written.keepNote ? note.trim() : "";
  return {
    wire: way.wire,
    then: who.then,
    ...(way.carries === "approved"
      ? chosen
        ? { template: { name: chosen.template.name, language: chosen.template.language } }
        : {}
      : { text: written.text.trim() }),
    ...(way.wire === "email" ? { subject: written.subject.trim() } : {}),
    ...(way.wire === "email" && emailTo ? { email_to: emailTo } : {}),
    ...(plan ? { note: plan } : {}),
  };
}

/** What a queued message's receipt says of taking it back: its id, the note kept with it, and until when it can be. */
interface Queued {
  message_id: string;
  cancelable_until: string;
  note_id: string | null;
}
const SECOND_MS = MIN_MS / 60;

/**
 * A message queued, said as a reply's is (thread/thread-verbs.tsx): for as long as it can still be stopped, with the
 * Undo that stops it. The toast is the frame's, so it outlives the sheet. Undone, the note that said the team wrote to
 * them goes with the message (verbs.ts undoFirst), and what was written is put back (restore), with the way to it:
 * an undo leaves the member where they were, words and all.
 */
export function sayQueued(
  flash: (f: Flash) => void,
  person: { id: string; name: string },
  q: Queued,
  restore: () => void,
): void {
  const left = Date.parse(q.cancelable_until) - Date.now();
  if (!(left > 0)) return flash({ msg: W.sent(person.name, null) });
  const undone = (): Flash => {
    restore();
    return { tone: "ok", msg: W.undone, action: { label: W.again, onClick: () => openNewConversation(person.id) } };
  };
  const undo = () =>
    void undoFirst({ personId: person.id, messageId: q.message_id, noteId: q.note_id }).then((c) =>
      flash(c.ok ? undone() : { tone: "danger", msg: c.message }),
    );
  flash({ msg: W.sent(person.name, Math.round(left / SECOND_MS)), ms: left, undo });
}

/**
 * What was typed into the pick's search, as the start of someone new: a number where it reads as one, else a name.
 * So "Add someone new" does not ask again for what was just typed.
 */
export function typedAs(q: string): { name?: string; phone?: string } {
  const t = q.trim();
  if (!t) return {};
  return /^[+(]?\d[\d\s().-]{5,}$/.test(t) ? { phone: t } : { name: t };
}

/** A key event as a field hands one: what the sheet's own key reads of it. */
interface SendKey {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  preventDefault: () => void;
}

/**
 * Ctrl or Cmd with Enter, in a field of the sheet: the act its foot holds, as the thread's own reply box sends with
 * it and a record's sheet saves with it. The act guards itself (nothing to send, a send on its way).
 */
export const onSendKey =
  (run: () => void) =>
  (e: SendKey): void => {
    if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    run();
  };

/** Today as the business says it ("Oct 7"): a note has no end, so it says when it was true. */
export const noteDay = (zone: string, now: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric" }).format(now);

/** What Ask answered: its questions, a call's brief with what is known of them, and the note it wrote. */
interface Asked {
  busy: boolean;
  error: string | null;
  asks: DraftAsk[];
  brief: CallBrief | null;
  facts: string[];
  note: string;
}
const NOT_ASKED: Asked = { busy: false, error: null, asks: [], brief: null, facts: [], note: "" };

/** The note as the sheet shows it: the member's own where they changed it, else Ask's, else the plan in a sentence. */
export function noteShown(w: Pick<Written, "note" | "about">, how: DraftHow, askedNote: string, day: string): string {
  if (w.note !== null) return w.note;
  return askedNote || (w.about.trim() ? planNoteOf(day, how, w.about) : "");
}

/** How the person picked can be reached: being read, read, or not. */
type ReachRead = { state: "reading" } | { state: "failed"; message: string } | { state: "in"; reach: PersonReachDto };

function useReach(personId: string | null, reads: number): ReachRead | null {
  const [read, setRead] = useState<{ id: string; read: ReachRead } | null>(null);
  useEffect(() => {
    if (!personId) return undefined;
    let live = true;
    void readReach(personId).then((r) => {
      if (!live) return;
      setRead({
        id: personId,
        read: r.ok ? { state: "in", reach: r.data.reach } : { state: "failed", message: r.message || W.unread },
      });
    });
    return () => {
      live = false;
    };
    // `reads` counts the times it is asked again for the same person (a send the server refused): what was read stays
    // drawn until the new answer lands.
  }, [personId, reads]);
  if (!personId) return null;
  return read && read.id === personId ? read.read : { state: "reading" };
}

/** The approved messages, once a wire carries nothing else. */
type Approved = { state: "reading" } | { state: "failed" } | { state: "in"; templates: ApprovedTemplate[] };

/**
 * The approved messages are the settings read's, the one read of the templates (offered-templates.ts): the sheet makes none of
 * its own, and draws them again if one is approved or hidden while it is open. Still reading until that read has landed, failed
 * where its templates read did.
 */
function useApproved(wanted: boolean): Approved {
  const settings = useSurface("settings");
  return useMemo((): Approved => {
    const rows = wanted ? offeredWhatsApp(settings) : undefined;
    if (rows === undefined) return { state: "reading" };
    return rows === null ? { state: "failed" } : { state: "in", templates: rows };
  }, [settings, wanted]);
}

/** Someone being added from the pick: whether the fields are open, what was typed, and how the door answered. */
interface Adding {
  open: boolean;
  name: string;
  phone: string;
  busy: boolean;
  error: string | null;
}
const NOT_ADDING: Adding = { open: false, name: "", phone: "", busy: false, error: null };

/**
 * The pick: what was typed, someone being added, and who is offered. With nothing typed it is who the tab already
 * holds (People's rows, heard from last first), or the server's first page where the tab holds nobody yet. With words
 * it is who the server says matches (People's own search: a name, a WhatsApp name, three digits of a number), asked
 * once the typing rests; until that answers, the last answer stays, so the list does not blink.
 */
function usePick(open: boolean) {
  const held = useSurface("people")?.rows ?? NO_ROWS;
  const [q, setQ] = useState("");
  const [add, setAdd] = useState<Adding>(NOT_ADDING);
  const [found, setFound] = useState<{ q: string; rows: PersonRowVM[] } | null>(null);
  const words = q.trim();
  const have = held.length > 0;
  useEffect(() => {
    // With nothing typed, the rows the tab holds are the pick: no request says them again.
    if (!open || (!words && have)) return undefined;
    let live = true;
    const wait = setTimeout(
      () => {
        void findPeople(words).then(
          (rows) => {
            if (live) setFound({ q: words, rows });
          },
          () => {
            if (live) setFound({ q: words, rows: [] });
          },
        );
      },
      words ? SEARCH_WAIT_MS : 0,
    );
    return () => {
      live = false;
      clearTimeout(wait);
    };
  }, [open, words, have]);
  const answered = found && found.q === words ? found.rows : null;
  const offered = words ? (answered ?? found?.rows ?? NO_ROWS) : have ? held : (answered ?? NO_ROWS);
  return { q, setQ, add, setAdd, rows: offered.slice(0, PICK_MAX), reading: answered === null && (!!words || !have) };
}

/** Ask's part: what it needs answered first, then the words or the brief. What it writes goes into what is written. */
function useAsk(w: Written, how: DraftHow, wire: ConsentChannel | null, patch: (p: Partial<Written>) => void) {
  const [asked, setAsked] = useState<Asked>(NOT_ASKED);
  // Each asking has its turn. Picking someone else, going back to the pick, or changing between a message and a call
  // forgets what Ask answered (`forget`) and ends the turn: an answer still on its way was written from the first
  // person's record, and must never land in the words, the note or the brief of the next.
  const turn = useRef(0);
  const write = async (tone?: DraftTone | "again") => {
    if (!w.personId || !w.about.trim() || asked.busy) return;
    turn.current += 1;
    const mine = turn.current;
    setAsked((a) => ({ ...a, busy: true, error: null }));
    const answers = asked.asks
      .map((a) => ({ key: a.key, question: a.question, words: (w.answers[a.key] ?? "").trim() }))
      .filter((a) => a.words);
    const r = await askDraft(w.personId, {
      how,
      ...(how === "message" && wire ? { wire } : {}),
      about: w.about.trim(),
      ...(answers.length ? { answers } : {}),
      ...(tone && w.text.trim() ? { previous: { text: w.text, ...(w.subject ? { subject: w.subject } : {}) } } : {}),
      ...(tone && tone !== "again" ? { tone } : {}),
    });
    if (mine !== turn.current) return;
    if (!r.ok) return setAsked((a) => ({ ...a, busy: false, error: r.message || W.unread }));
    const d = r.data;
    // A question comes back alone: the member answers it, and asks again.
    if (d.asks.length) return setAsked({ ...NOT_ASKED, asks: d.asks });
    // What was asked stays with its answers, so a rewrite does not ask it again.
    setAsked((a) => ({ ...NOT_ASKED, asks: a.asks, brief: d.brief, facts: d.facts, note: d.note }));
    if (how === "message") patch({ text: d.text, ...(d.subject ? { subject: d.subject } : {}) });
  };
  const forget = () => {
    turn.current += 1;
    setAsked(NOT_ASKED);
  };
  return { asked, write, forget };
}

/**
 * What is written is kept in the tab as it is typed and comes back when the sheet opens again; it goes when the server
 * takes the message or the member throws it away, and closing over words asks once. The house's rule for a composer
 * (the record kit's useUnsavedWork says it for the others), kept here through the Inbox's own door to the tab's memory.
 */
function useKept(written: Written, held: { dirty: boolean; busy: boolean }, onLeave: () => void) {
  const { dirty, busy } = held;
  const [asking, setAsking] = useState(false);
  // Kept as it changes, never on a timer: a tab closed a keystroke later has the keystroke.
  const json = JSON.stringify(written);
  const kept = useRef(false);
  useEffect(() => {
    const memory = tabMemory();
    if (!memory) return;
    if (dirty) memory.keepDraft(KIND, JSON.parse(json));
    // Only what this sheet kept is let go. Opened on someone else with nothing written yet, the words the tab holds
    // for another person stay until these replace them.
    else if (kept.current) memory.dropDraft(KIND);
    kept.current = dirty;
  }, [json, dirty]);
  const drop = () => tabMemory()?.dropDraft(KIND);
  return {
    asking,
    leave: () => {
      // A send on its way is neither left nor thrown away: "nothing has been sent" would not be true.
      if (busy) return;
      if (dirty) setAsking(true);
      else onLeave();
    },
    discard: () => {
      setAsking(false);
      drop();
      onLeave();
    },
    stay: () => setAsking(false),
    // The server took it: there is nothing left to keep.
    done: drop,
  };
}

/** What the sheet is opened with: on whom, how it closes, and the toast that outlives it. */
export interface Opened {
  open: boolean;
  personId: string | null;
  /** The wire a door named (their page's Text them, Email them): a message on it, over what the tab kept. */
  wire?: ConsentChannel | null;
  onClose: () => void;
  flash: (flash: Flash) => void;
}

/** What is read of the person and of the workspace, and what the member's choices come to. */
function useWays(written: Written, reads: number) {
  const reach = useReach(written.personId, reads);
  const dto = reach?.state === "in" ? reach.reach : null;
  const wire = dto ? (dto.ways.find((x) => x.wire === written.wire && x.ok)?.wire ?? dto.default_wire) : null;
  const way: WriteWay | null = dto && wire ? (dto.ways.find((x) => x.wire === wire) ?? null) : null;
  // With no wire to write on, the call is what is offered first, where one is.
  const how: DraftHow = written.how ?? (dto && !way && dto.call.ok ? "call" : "message");
  const approved = useApproved(how === "message" && !!way && way.carries === "approved");
  const choice =
    approved.state === "in" && dto
      ? inboxTemplates(approved.templates, { who: dto.person.name, offersOk: dto.offers_ok })
      : null;
  const chosen = choice
    ? (choice.sendable.find((x) => approvedKey(x.template) === written.approved) ?? choice.sendable[0] ?? null)
    : null;
  const who = dto ? whoAnswers(dto, wire, written.then) : null;
  const canSend =
    !!way &&
    (way.carries === "approved"
      ? !!chosen
      : !!written.text.trim() && (way.wire !== "email" || !!written.subject.trim()));
  return { reach, dto, wire, way, how, approved, choice, chosen, who, canSend };
}

/** The sheet's state and its acts. */
export function useNewConversationSheet(opened: Opened) {
  const [written, setWritten] = useState<Written>(() => {
    const kept = writtenFor(opened.personId, tabMemory()?.draft<Partial<Written>>(KIND) ?? null);
    // A door that named the wire asked for a message on it; one it cannot go on falls to the reach read's (useWays).
    return opened.wire ? { ...kept, how: "message", wire: opened.wire } : kept;
  });
  const patch = (p: Partial<Written>) => setWritten((w) => ({ ...w, ...p }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ thread: string; words: string } | null>(null);
  // The address an email goes to, once the server asked and the member pressed Send again: for that person alone.
  const [agreed, setAgreed] = useState<{ personId: string; to: string } | null>(null);
  const [reads, setReads] = useState(0);
  // Which approved messages are not offered, and why: said on a press, never a paragraph under the choice.
  const [why, setWhy] = useState(false);
  const pick = usePick(opened.open && !written.personId);
  const st = useWays(written, reads);
  const { dto, way, how, chosen, who } = st;
  const ask = useAsk(written, how, st.wire, patch);
  const dirty = !sent && !!(written.about.trim() || written.text.trim() || written.after.trim());
  const work = useKept(written, { dirty, busy }, opened.onClose);
  const note = noteShown(written, how, ask.asked.note, noteDay(clockZone()));

  const choose = (id: string) => {
    ask.forget();
    setError(null);
    // The plan is kept; the words written for someone else are not.
    setWritten((w) => ({ ...EMPTY, personId: id, about: w.about, how: w.how }));
  };
  const changeWho = () => {
    // Not while a send to them is on its way: its answer would land on whoever was picked next.
    if (busy) return;
    ask.forget();
    setError(null);
    patch({ personId: null });
  };
  /** A message or a call. What Ask answered was for the other, and a call's brief is told what a message never is. */
  const setHow = (next: DraftHow) => {
    if (busy) return;
    ask.forget();
    patch({ how: next });
  };
  const addSomeone = async () => {
    const d = pick.add;
    if (d.busy || !d.phone.trim()) return;
    pick.setAdd({ ...d, busy: true, error: null });
    const r = await addByNumber(d);
    if (!r.ok) return pick.setAdd((x) => ({ ...x, busy: false, error: r.error }));
    pick.setAdd(NOT_ADDING);
    choose(r.id);
  };
  /** Somewhere else in the app, from a link in the sheet: what is written stays in the tab. */
  const goTo = (route: string) => {
    opened.onClose();
    navigate(route);
  };

  const send = async () => {
    const emailTo = dto && agreed?.personId === dto.person.id ? agreed.to : null;
    const body = firstMessageOf({ way, chosen, who, emailTo }, written, note);
    if (!dto || !body || !st.canSend || busy) return;
    setBusy(true);
    setError(null);
    const r = await sendFirst(dto.person.id, body);
    setBusy(false);
    if (!r.ok) {
      // An email that waits on a yes says where it will go (the address on their page is not the one they last wrote
      // from): pressing Send again agrees to that address, by value. Any other refusal may mean they changed since
      // the sheet read them, so how they can be reached is read again.
      if (r.confirmEmailTo) setAgreed({ personId: dto.person.id, to: r.confirmEmailTo });
      else setReads((n) => n + 1);
      return setError(r.message || W.refusals.notThatWay);
    }
    work.done();
    const thread = `inbox/${r.data.thread}`;
    // What did not follow the send is said where the words were, with the door on: a toast would go with the page.
    if (r.data.note_kept === false) return setSent({ thread, words: W.noteLost });
    if (body.then === "receptionist" && !r.data.handed_back) return setSent({ thread, words: W.stillYours });
    // Taken back inside its window, what was written is the tab's again, and the sheet opens on it.
    sayQueued(opened.flash, dto.person, r.data, () => tabMemory()?.keepDraft(KIND, written));
    goTo(thread);
  };

  const finishCall = async () => {
    if (!dto || busy) return;
    const after = written.after.trim();
    if (!after) {
      work.done();
      return opened.onClose();
    }
    setBusy(true);
    setError(null);
    // For the team alone unless the member says the receptionist should know, and it answers this person.
    const kept = await keepNote(
      dto.person.id,
      W.call.noteOf(noteDay(clockZone()), after),
      !(dto.receptionist.answers && written.tell),
    );
    setBusy(false);
    if (!kept.ok) return setError(kept.message || W.unread);
    work.done();
    opened.flash({ msg: W.call.kept });
    opened.onClose();
  };

  return {
    ...st,
    step: written.personId ? ("plan" as const) : ("who" as const),
    written,
    patch,
    pick,
    ask,
    work,
    note,
    busy,
    error,
    sent,
    choose,
    changeWho,
    setHow,
    addSomeone,
    openAdd: () => pick.setAdd({ ...NOT_ADDING, open: true, ...typedAs(pick.q) }),
    why,
    toggleWhy: () => setWhy((shown) => !shown),
    // The address an email will go to once the server asked about it: the act names it, and pressing it is the yes.
    sendsTo: dto && way?.wire === "email" && agreed?.personId === dto.person.id ? agreed.to : null,
    goTo,
    flashed: opened.flash,
    send,
    finishCall,
  };
}

export type SheetState = ReturnType<typeof useNewConversationSheet>;
