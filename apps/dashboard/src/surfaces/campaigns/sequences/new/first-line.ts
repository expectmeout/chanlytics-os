/**
 * A line said before New is open (16 Nov 2026): Campaigns with no campaign yet draws New's own line (sequences-page.tsx
 * NoCampaigns), and what is said there goes to New, kept in the tab as New's own line is and marked to be drafted, so New
 * drafts it by itself as it opens, once its reads are in. Nothing is pressed twice. What New keeps in the tab, and under
 * which address, is here too, since both sides read it, and how New asks AI for a draft of a line (useAsk).
 */
import { useEffect, useRef, useState } from "react";
import {
  NEW_WORDS,
  draftKeepsMessage,
  newSequenceRoute,
  type NewDraftAnswered,
  type NewDraftAsk,
  type NewDraftDto,
  type NewWho,
} from "@chanlytics/contracts";
import type { Output } from "@/client/api";
import { commitVerb } from "@/bridge/verbs/commit";
import { keepTabDraft } from "../../../kit/record/work";
import { navigate, refusalToast, type FrameFlash } from "../../../frame-verbs";

/** The choices already made that a line is drafted with: a door's, or the owner's in the draft. */
export type Fixed = Omit<NewDraftAsk, "words">;

/**
 * What New does with what a line is answered with: a draft it takes, or the words of a message to keep, which it hands to
 * AI's message card (contracts draftKeepsMessage, decision 0140's C12). Nothing where the ask came to nothing.
 */
export function takeAnswer(
  answered: NewDraftAnswered | null,
  on: { took: (draft: NewDraftDto) => void; keep: (words: string) => void },
): void {
  if (!answered) return;
  if (draftKeepsMessage(answered)) on.keep(answered.said);
  else on.took(answered);
}

/**
 * What New keeps in the tab while it holds a draft: the draft, the line, and the draft as Ask answered it (decision 0078
 * step 2: what a make keeps beside the owner's words), under the address it was opened on.
 */
export interface KeptHere {
  draft: NewDraftDto | null;
  line: string | null;
  drafted?: NewDraftDto | null;
  /** The line was said before New opened (Campaigns' empty list): New drafts it as it opens. */
  draftOnOpen?: boolean;
}

/** The choices an address of New made, which name where the tab keeps what it held. */
interface NewAddress {
  moment: string | null;
  who: NewWho | null;
  to: string | null;
  kept: string | null;
}

/** Where the tab keeps what New held, by the choices its address made: the plain New's is "|||". */
export const newKeptKeyOf = (address: NewAddress): string =>
  [address.moment, address.who, address.to, address.kept].map((x) => x ?? "").join("|");

/** Kept for the plain New, marked to be drafted as it opens, and New opened. */
export function sayToNew(line: string): void {
  const here = newKeptKeyOf({ moment: null, who: null, to: null, kept: null });
  keepTabDraft("new", { draft: null, line, drafted: null, draftOnOpen: true } satisfies KeptHere, here);
  navigate(newSequenceRoute());
}

/**
 * New's side: the line kept with `draftOnOpen` is drafted once its reads are in and it holds no draft, once (the ref), and
 * not again on a reload, since from then on the tab keeps New's own words, which carry no mark. Looked at after every
 * render, so what it calls is that render's own.
 */
export function useDraftOnOpen(
  back: KeptHere | null,
  page: { reads: unknown; held: unknown },
  draft: (line: string) => void,
): void {
  const line = back?.draftOnOpen ? (back.line?.trim() ?? "") : "";
  const pending = useRef(line);
  useEffect(() => {
    if (!pending.current || !page.reads || page.held) return;
    const words = pending.current;
    pending.current = "";
    draft(words);
  });
}

/**
 * Ask at work: a draft asked for from a line, Stop, and what came of it: the draft, which each asker takes its own way (a
 * first draft, one drafted again, one changed), or none, with a refusal or Ask that failed said here.
 */
export function useAsk(door: Fixed, flash: (flash: FrameFlash) => void) {
  const [drafting, setDrafting] = useState<"fresh" | "again" | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  // Each ask counted, so an answer that arrives after Stop, or after a later ask, is let go.
  const askCount = useRef(0);
  const answer = async (words: string, fixed: Fixed, again: boolean): Promise<NewDraftAnswered | null> => {
    const id = ++askCount.current;
    setDrafting(again ? "again" : "fresh");
    setFailed(null);
    setRefused(null);
    // A change is asked of the draft as it stands: the door's choices opened New, and the owner may have changed them since.
    const result = await commitVerb("sequence_draft", { words, ...(fixed.stands ? {} : door), ...fixed });
    if (id !== askCount.current) return null;
    setDrafting(null);
    if (result.ok) return result.data as Output<"POST sequences/draft">;
    // Drafting it again, or changing it, the draft stays as it was and what Ask said is a toast over it, whatever it was.
    if (again) flash(refusalToast(result));
    // A draft nothing here can hold is said in Ask's words; anything else is Ask that could not answer, in the server's
    // words where it said why (a day's budget spent, a paused workspace, an answer that ran long), as a change's toast is.
    else if (result.code === "validation") setRefused(result.message);
    else setFailed(result.message || NEW_WORDS.failed.words);
    return null;
  };
  // A draft asked for as a kind, or as a change to one that stands: the server never answers such an ask as a message
  // to keep (contracts draftKeepsMessage), and one that did is no draft.
  const ask = async (words: string, fixed: Fixed, again: boolean): Promise<NewDraftDto | null> => {
    const answered = await answer(words, fixed, again);
    return answered && !draftKeepsMessage(answered) ? answered : null;
  };
  const stop = () => {
    askCount.current++;
    setDrafting(null);
  };
  const clear = () => {
    setFailed(null);
    setRefused(null);
  };
  return { drafting, failed, refused, ask, answer, stop, clear };
}
