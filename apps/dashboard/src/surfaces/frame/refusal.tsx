/**
 * A refusal as the toast says it (decision 0151: a module of its own, so a page that words a refusal does not load the
 * toast's code with it, which the frame draws and every page reaches through `useFrameToast`).
 */
import type { FrameFlash } from "../frame-verbs";

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
export const refusalToast = (r: Refusal | null | undefined, what: string | null = null): FrameFlash => {
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
