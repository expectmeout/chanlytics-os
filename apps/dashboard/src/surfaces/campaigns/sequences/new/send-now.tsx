/**
 * Send now's question (moved from new-draft.tsx, 9 Nov 2026): a one-off pressed to go now asks first, in the draft's foot,
 * who it reaches and how, when it goes with its Stop, and that delivered is delivered. Every word is contracts' (new-words.ts).
 */
import { NEW_WORDS as W, type NewDraftDto } from "@chanlytics/contracts";
import { Confirm } from "../../../kit/confirm/confirm";
import { cmFootAsk } from "../../parts/split";
import * as M from "./new-model";

/** Who a one-off sent now reaches on each channel ("180 by WhatsApp, 34 by email"), where the workspace counted it. */
function byWords(draft: NewDraftDto): string {
  // With WhatsApp's version still at Meta it goes by the others alone, which the question's count already says.
  if (M.reviewOf(draft)) return "";
  const by = draft.reach?.by ?? {};
  return draft.channels
    .flatMap((c) => ((by[c] ?? 0) > 0 ? [W.reach.byChannel(by[c] ?? 0, M.channelsSaidOf([c], ""))] : []))
    .join(", ");
}

/** What Send now's question is asked about, and its two answers. */
interface ConfirmSendProps {
  draft: NewDraftDto;
  /** The business's zone, which says when it goes. */
  tz: string;
  busy: boolean;
  onYes: () => void;
  onNo: () => void;
}

/**
 * Send now, asked where it was pressed. It is the foot (cmFootAsk: the kit's pair, its answers each half the foot on a
 * phone, the capsule rounded round its rows), and its answer takes focus where it stands: on a phone the foot is docked at
 * the screen's edge, and a plain focus there moved the page to its end (9 Nov 2026).
 */
export function ConfirmSend({ draft, tz, busy, onYes, onNo }: ConfirmSendProps) {
  const review = M.reviewOf(draft);
  // Who it reaches where the workspace counted it; asked without a number where nothing counts it (news to a list).
  const reaches = review ? review.can : (draft.reach?.can ?? null);
  const goes = M.sendsAt(tz, Date.now());
  const when = goes.moved ? W.confirm.opens(goes.time) : W.confirm.at(goes.time);
  const detail = [byWords(draft), when, W.confirm.after].filter(Boolean).join(". ");
  return cmFootAsk(
    <Confirm
      question={reaches === null ? W.confirm.titleNow(draft.name) : W.confirm.title(draft.name, reaches)}
      detail={`${detail}.`}
      yes={W.confirm.yes}
      no={W.confirm.no}
      busy={busy}
      onYes={onYes}
      onNo={onNo}
      docked
      testid="sq-nw-send"
    />,
  );
}
