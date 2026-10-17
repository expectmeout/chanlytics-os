/**
 * What a reply box sends and how it waits (moved out of composer.tsx with the template box, the phone canvas's C1): the
 * words or the template a send carries, whether the page's send answered with a promise, the "Why?" that keeps an
 * explanation one tap away, and the field that grows with what is in it. The free reply box (composer.tsx) and the template
 * box (template-box.tsx) both read them.
 */
import { useState, type ReactNode, type RefObject } from "react";
import type { ApprovedTemplate } from "../types";

/**
 * What a send carries: the words typed, or the template chosen (`true` where none was named) with the member's words for
 * its blank, where it has one (contracts inboxBlankOf).
 */
export type SendWords = string | { template: ApprovedTemplate | true; words?: string };

/** The page's send: it may answer with a promise (a real thread), which the box waits on before it lets go of its words. */
export type OnSend = (threadId: string, words: SendWords, approveAndSend?: boolean) => unknown;

/** Whether a send answered with a promise. */
export const isPromise = (r: unknown): r is Promise<unknown> =>
  typeof r === "object" && r !== null && "then" in r && typeof r.then === "function";

// Outside the 24-hour window WhatsApp will deliver exactly one thing: a
// pre-approved template. This was referenced by the closed-window composer but
// never actually written — so any escalated thread older than 24h crashed the
// whole Inbox pane rather than offering the one send that would work.
// Named after what it SENDS, not after the mechanism: the operator should know
// what lands on their customer's phone before they click.
// An explanation one tap away, never in the way (the house rule): which templates cannot go to this person, and why,
// was a sentence of its own under the reply box -- thirty-one words to say that nothing could be sent.
export const IxWhy = ({ said, testid = null }: { said: ReactNode; testid?: string | null }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      {" "}
      <button type="button" className="ix-why" aria-expanded={open} onClick={() => setOpen(!open)}>
        Why?
      </button>
      {open && (
        <span className="ix-why-said" data-testid={testid || undefined}>
          {said}
        </span>
      )}
    </>
  );
};

/** The field grows with what is in it, up to its cap: typed, carried in from a profile, or a draft filled in. */
export function growWithWords(taRef: RefObject<HTMLTextAreaElement | null>, real: boolean | undefined) {
  const el = taRef.current;
  if (!real || !el || !el.style) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
