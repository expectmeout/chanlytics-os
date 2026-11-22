/**
 * One request as the Inbox answers it (00680): its read, how its person can be written to, AI's reply, and its presses.
 *
 * The request is read as its page opens, again after each press, and again when Needs you moves (a teammate answered
 * it, a reply bounced, the person wrote in with its code). How the person can be written to is the send door's own
 * answer (GET people/[id]/reach), asked before anything is drafted, so nothing is written that could not be sent. AI's
 * reply is the one writer of a member's first message (POST people/[id]/draft), handed what they asked; it is kept in
 * the tab by the request's id, never on the request, so opening it again asks nobody twice.
 *
 * The reply leaves by the route's one door and waits its seconds with Undo, as every message a member begins does. A
 * press that fails says so and changes nothing here.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DRAFT_ABOUT_MAX,
  NEW_CONVERSATION_WORDS,
  SECOND_MS,
  type FormRequestDto,
  type FormRequestPress,
  type PersonReachDto,
  type WriteWay,
} from "@chanlytics/contracts";
import { readFormRequest, sendFormRequestPress } from "@/bridge/verbs/forms";
import { hearNeedsYou } from "../../needs-you";
import { askDraft, readReach, undoFirst } from "../new-conversation/verbs";
import type { Flash } from "../shell";
import { REQUEST_WORDS as W, requestWho } from "./words";

/** Where the request's read stands. */
export type RequestRead =
  { state: "reading" } | { state: "gone" } | { state: "failed" } | { state: "read"; dto: FormRequestDto };

/** AI's reply as the page holds it: none asked yet, being written, written (and whether the member changed it), or not written. */
export interface RequestDraft {
  state: "none" | "writing" | "wrote" | "failed";
  text: string;
  subject: string;
  changed: boolean;
}

const NO_DRAFT: RequestDraft = { state: "none", text: "", subject: "", changed: false };

/** The replies written this visit, by request: a request opened again shows the words it had. */
const KEPT_DRAFTS = new Map<string, RequestDraft>();

/**
 * The way a reply to them goes: the chat they already have while it is open for a member's own words (the canvas's
 * call 12), else an email. Null where neither can carry one now, with the email door's own reason.
 */
function replyWayOf(reach: PersonReachDto | null): { way: WriteWay | null; why: string | null } {
  if (!reach) return { way: null, why: null };
  const chat = reach.ways.find((w) => w.wire === "whatsapp" && w.ok && w.carries === "words" && !w.starts);
  const email = reach.ways.find((w) => w.wire === "email");
  if (chat) return { way: chat, why: null };
  if (email?.ok) return { way: email, why: null };
  return { way: null, why: email?.why ?? null };
}

/** The request's read, kept fresh. */
function useRequestRead(id: string): [RequestRead, () => Promise<void>] {
  const [read, setRead] = useState<RequestRead>({ state: "reading" });
  const live = useRef(true);
  const known = useRef<FormRequestDto | null>(null);
  const again = useCallback(async () => {
    const answer = await readFormRequest(id).catch(() => null);
    if (!live.current) return;
    if (answer?.ok) {
      known.current = answer.data;
      setRead({ state: "read", dto: answer.data });
    } else if (answer && answer.status === 404) setRead({ state: "gone" });
    // What was known stays on screen; only a page that knows nothing says it could not read.
    else if (!known.current) setRead({ state: "failed" });
  }, [id]);
  useEffect(() => {
    live.current = true;
    known.current = null;
    setRead({ state: "reading" });
    void again();
    // Needs you moved: a teammate's answer, a reply that bounced, their own message with its code.
    const stop = hearNeedsYou(() => void again());
    return () => {
      live.current = false;
      stop();
    };
  }, [again]);
  return [read, again];
}

/** How the request's person can be written to, read once per person: null while it is read, "failed" where it was not. */
function useReach(personId: string | null): PersonReachDto | null | "failed" {
  const [reach, setReach] = useState<PersonReachDto | null | "failed">(null);
  useEffect(() => {
    if (!personId) return undefined;
    let live = true;
    setReach(null);
    void readReach(personId).then(
      (answer) => live && setReach(answer.ok ? answer.data.reach : "failed"),
      () => live && setReach("failed"),
    );
    return () => {
      live = false;
    };
  }, [personId]);
  return personId ? reach : null;
}

/** What the page hands its presses: who is asked, and what the frame says of the answer. */
interface PressIo {
  dto: FormRequestDto;
  flash: (f: Flash) => void;
  again: () => Promise<void>;
  close: () => void;
  setBusy: (act: string | null) => void;
}

/** One press sent, the request read again whatever came back; false where it did not go through, said in a toast. */
async function sendRequestPress(io: PressIo, press: FormRequestPress) {
  io.setBusy(press.act);
  const answer = await sendFormRequestPress(press);
  await io.again();
  io.setBusy(null);
  if (answer?.ok) return answer.data;
  io.flash({ tone: "danger", msg: answer?.message ?? W.failed });
  return null;
}

/** The reply sent: it waits its seconds with Undo, and the page goes back to the list it came from. */
async function sendReply(
  io: PressIo,
  reply: { wire: WriteWay["wire"]; text: string; subject: string; emailTo: string | null },
) {
  const receipt = await sendRequestPress(io, {
    act: "reply",
    entry_id: io.dto.id,
    wire: reply.wire === "whatsapp" ? "whatsapp" : "email",
    text: reply.text,
    ...(reply.wire === "email" && reply.subject ? { subject: reply.subject } : {}),
    ...(reply.wire === "email" && reply.emailTo ? { email_to: reply.emailTo } : {}),
  });
  if (!receipt?.message_id) return;
  KEPT_DRAFTS.delete(io.dto.id);
  const person = requestWho(io.dto);
  const messageId = receipt.message_id;
  const left = receipt.cancelable_until ? Date.parse(receipt.cancelable_until) - Date.now() : 0;
  const undo = () =>
    void undoFirst({ personId: io.dto.person?.id ?? "", messageId, noteId: null }).then((canceled) => {
      void io.again();
      io.flash(canceled.ok ? { tone: "ok", msg: W.sent.kept } : { tone: "danger", msg: canceled.message });
    });
  io.flash(
    left > 0
      ? { msg: NEW_CONVERSATION_WORDS.sent(person, Math.round(left / SECOND_MS)), ms: left, undo, stays: true }
      : { msg: NEW_CONVERSATION_WORDS.sent(person, null) },
  );
  io.close();
}

/** Mark answered, with its Undo. */
async function markAnswered(io: PressIo) {
  if (!(await sendRequestPress(io, { act: "mark", entry_id: io.dto.id }))) return;
  io.flash({
    tone: "ok",
    msg: W.quiet.marked,
    undo: () => void sendRequestPress(io, { act: "unmark", entry_id: io.dto.id }),
  });
  io.close();
}

/** Not a real request: held, in no count, with its Undo. */
async function holdRequest(io: PressIo) {
  if (!(await sendRequestPress(io, { act: "hold", entry_id: io.dto.id }))) return;
  io.flash({
    msg: W.quiet.held(io.dto.heading),
    undo: () => void sendRequestPress(io, { act: "let_through", entry_id: io.dto.id }),
  });
  io.close();
}

/** What the request's page draws from and presses. */
export interface RequestPage {
  read: RequestRead;
  reach: PersonReachDto | null | "failed";
  way: WriteWay | null;
  /** Why nothing can be sent, in the send door's own words; null where something can, or it is not known yet. */
  why: string | null;
  draft: RequestDraft;
  /** The address the member picked where the request's is not the one on the person's page; null before a pick. */
  emailTo: string | null;
  busy: string | null;
  again: () => Promise<void>;
  setText: (text: string) => void;
  pickEmail: (address: string) => void;
  askAi: () => void;
  send: () => void;
  mark: () => void;
  unmark: () => void;
  hold: () => void;
  letThrough: () => void;
}

/** What a reply's draft is written from: who it is to, on which wire, and what the request says. */
interface DraftFor {
  personId: string | null;
  wire: WriteWay["wire"] | null;
  note: string;
  /** Whether AI drafts by itself: the form asks it to, a reply can go, and nothing stands in its way. */
  alone: boolean;
}

/**
 * A request's reply as it is written: the words kept while the tab lives (KEPT_DRAFTS, so a request opened again
 * shows them), AI asked for a draft, and AI drafting by itself once where the form asks it to, never over words
 * already here.
 */
function useRequestDraft(id: string, from: DraftFor) {
  const [draft, setDraftState] = useState<RequestDraft>(() => KEPT_DRAFTS.get(id) ?? NO_DRAFT);
  const setDraft = useCallback(
    (next: RequestDraft) => {
      KEPT_DRAFTS.set(id, next);
      setDraftState(next);
    },
    [id],
  );
  useEffect(() => setDraftState(KEPT_DRAFTS.get(id) ?? NO_DRAFT), [id]);
  const { personId, wire, note } = from;
  const askAi = useCallback(() => {
    if (!personId || !wire) return;
    setDraft({ state: "writing", text: "", subject: "", changed: false });
    void askDraft(personId, { how: "message", wire, about: note.slice(0, DRAFT_ABOUT_MAX) }).then(
      (answer) =>
        setDraft(
          answer.ok && answer.data.text
            ? { state: "wrote", text: answer.data.text, subject: answer.data.subject, changed: false }
            : { ...NO_DRAFT, state: "failed" },
        ),
      () => setDraft({ ...NO_DRAFT, state: "failed" }),
    );
  }, [personId, wire, note, setDraft]);
  const alone = from.alone && draft.state === "none";
  useEffect(() => {
    if (alone) askAi();
  }, [alone, askAi]);
  return { draft, setDraft, askAi };
}

/** One request's page: `flash` is the frame's toast, `close` goes back to the list the request was opened from. */
export function useRequestPage(id: string, flash: (f: Flash) => void, close: () => void): RequestPage {
  const [read, again] = useRequestRead(id);
  const dto = read.state === "read" ? read.dto : null;
  const open = dto?.standing === "open";
  const reach = useReach(open ? (dto?.person?.id ?? null) : null);
  const { way, why } = replyWayOf(reach && reach !== "failed" ? reach : null);
  const [emailTo, setEmailTo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => setEmailTo(null), [id]);
  const wire = way?.wire ?? null;
  const { draft, setDraft, askAi } = useRequestDraft(id, {
    personId: dto?.person?.id ?? null,
    wire,
    note: dto?.note ?? "",
    alone: !!open && !!dto?.drafts && !!wire && !dto.unreached,
  });

  const io: PressIo | null = dto ? { dto, flash, again, close, setBusy } : null;
  return {
    read,
    reach,
    way,
    why,
    draft,
    emailTo,
    busy,
    again,
    setText: (text) =>
      setDraft({ ...draft, state: draft.state === "writing" ? "writing" : draft.state, text, changed: true }),
    pickEmail: setEmailTo,
    askAi,
    send: () => {
      const text = draft.text.trim();
      if (io && way && text) void sendReply(io, { wire: way.wire, text, subject: draft.subject, emailTo });
    },
    mark: () => void (io && markAnswered(io)),
    unmark: () => void (io && sendRequestPress(io, { act: "unmark", entry_id: io.dto.id })),
    hold: () => void (io && holdRequest(io)),
    letThrough: () => void (io && sendRequestPress(io, { act: "let_through", entry_id: io.dto.id })),
  };
}
