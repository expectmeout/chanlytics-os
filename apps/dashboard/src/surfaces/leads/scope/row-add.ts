/**
 * A row's own Add (the table review of 5 Nov 2026): one lead to the search's pick, through the sequences' add verb, as
 * the pile's add and the selection bar's are (pile/use-pile.ts addOf, scope/bulk-add.tsx). The door answers, and what
 * it says is the toast, in the pile's words (reachOuts.addWords): a lead that joined, with Undo; one the door left out,
 * with why; a refusal, as itself. Nothing is asked of the door before the press.
 */
import type { ReachOutAddDto } from "@chanlytics/contracts";
import { commitVerb, undoVerb } from "@/bridge/verbs/commit";
import { reachOuts } from "../../campaigns/reach-out/surface";
import { refusalToast, type FrameFlash } from "../../frame-verbs";
import type { AimTarget } from "../sheet/use-aim";

/** Add one lead to the pick. True where it joined. */
export async function addLeadToPick(p: {
  id: string;
  to: Pick<AimTarget, "rootId" | "name" | "row">;
  flash: (f: FrameFlash) => void;
}): Promise<boolean> {
  const r = await commitVerb("sequence_add", {
    sequence_id: p.to.rootId,
    lead_ids: [p.id],
    name: p.to.name,
    draft: p.to.row.state === "draft",
  });
  if (!r.ok) {
    p.flash(refusalToast(r, "It could not be added"));
    return false;
  }
  const answer = r.data as ReachOutAddDto;
  const words = reachOuts.addWords(answer, p.to.name);
  if (!answer.added) {
    p.flash({ tone: "warn", msg: words.text });
    return false;
  }
  const kept = r.undo;
  p.flash({
    tone: "ok",
    msg: words.text,
    undo: kept
      ? async () => {
          const u = await undoVerb("sequence_add", kept);
          p.flash(u.ok ? { tone: "ok", msg: u.receipt } : refusalToast(u));
        }
      : null,
  });
  return true;
}
