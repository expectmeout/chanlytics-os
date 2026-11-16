/**
 * A line said before New is open (16 Nov 2026): Campaigns with no campaign yet draws New's own line (sequences-page.tsx
 * NoCampaigns), and what is said there goes to New, kept in the tab as New's own line is and marked to be drafted, so New
 * drafts it by itself as it opens, once its reads are in. Nothing is pressed twice. What New keeps in the tab, and under
 * which address, is here too, since both sides read it.
 */
import { useEffect, useRef } from "react";
import { newSequenceRoute, type NewDraftDto, type NewWho } from "@chanlytics/contracts";
import { keepTabDraft } from "../../../kit/record/work";
import { navigate } from "../../../frame-verbs";

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
export const hereOf = (address: NewAddress): string =>
  [address.moment, address.who, address.to, address.kept].map((x) => x ?? "").join("|");

/** Kept for the plain New, marked to be drafted as it opens, and New opened. */
export function sayToNew(line: string): void {
  const here = hereOf({ moment: null, who: null, to: null, kept: null });
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
