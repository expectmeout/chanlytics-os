/**
 * A refusal as the toast says it (decision 0151: a module of its own, so a page that words a refusal does not load the
 * toast's code with it, which the frame draws and every page reaches through `useFrameToast`).
 */
import type { ReactNode } from "react";

/**
 * A refusal's toast: the danger tone and its words, one of the flashes any page raises (frame-verbs.ts FrameFlash). Said
 * here, not imported from frame-verbs, which hands this module on: the two would lean on each other.
 */
interface RefusalFlash {
  tone: "danger";
  msg: ReactNode;
}

/** What a refusal says, for `refusalToast`: contracts' refusalOf, a title for the kind of no and the owner's sentence. */
interface Refusal {
  title?: string | null;
  message?: string | null;
}

/**
 * A refusal, as a toast. The client names every refusal (contracts refusalOf): a title for the kind of no, and the
 * sentence in the owner's words. The page says what did not happen ("Not stopped") and the refusal says why; with no
 * words of the page's own, the refusal's title leads. Always the danger tone: nothing happened.
 *   flash(res.ok ? { msg: <>Stopped</> } : refusalToast(res, "Not stopped"))
 */
export const refusalToast = (r: Refusal | null | undefined, what: string | null = null): RefusalFlash => {
  const lead = what || (r && r.title) || null;
  const why = (r && r.message) || "That didn't go through.";
  return {
    tone: "danger",
    msg: lead ? (
      <>
        <b>{lead}</b> — {why}
      </>
    ) : (
      <>{why}</>
    ),
  };
};
