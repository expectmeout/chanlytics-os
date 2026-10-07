/**
 * Hold every draft still counting down (moved from pages/inbox.jsx `ixHoldAll`, decision 0015, step 3). A real draft is a
 * send job on the server, so holding it is the withdraw the single Hold makes (`cancelSend`), once per draft. Every
 * countdown stops at once; a draft the server refused -- it may already have gone out -- is released and named, never
 * shown as held.
 */
import { ixDraftKey } from "../rules";
import type { VetoState } from "../store";
import type { RealThread, Thread, Veto } from "../types";

/** A real draft the server can be asked to withdraw: it has a message to name. */
type RealDraft = RealThread & { veto: Veto & { messageId: string } };

/** One draft the server refused to withdraw, with its own words when it gave any. */
interface HoldRefusal {
  id: string;
  who: string;
  message: string | null;
}

/** What the server said to a withdraw: the caller's own courier (verbs.ts `cancelSend`), or a test's. */
interface CancelAnswer {
  ok: boolean;
  message?: string;
}

export const ixHoldAll = async (
  drafts: Thread[],
  {
    state,
    cancelSend,
  }: { state: Record<string, VetoState>; cancelSend?: ((messageId: string) => Promise<CancelAnswer>) | null },
): Promise<{ held: number; refused: HoldRefusal[] }> => {
  for (const t of drafts) state[ixDraftKey(t)] = { ...(state[ixDraftKey(t)] || {}), held: true };
  const real = drafts.filter((t): t is RealDraft => !!(t.real && t.veto && t.veto.messageId));
  const answers = await Promise.all(
    real.map((t) =>
      cancelSend
        ? cancelSend(t.veto.messageId)
        : Promise.resolve<CancelAnswer>({ ok: false, message: "The Inbox could not reach the server." }),
    ),
  );
  const refused: HoldRefusal[] = [];
  answers.forEach((r, i) => {
    if (r && r.ok) return;
    const t = real[i];
    state[ixDraftKey(t)] = { ...(state[ixDraftKey(t)] || {}), held: false };
    refused.push({ id: t.id, who: t.who, message: (r && r.message) || null });
  });
  return { held: drafts.length - refused.length, refused };
};
