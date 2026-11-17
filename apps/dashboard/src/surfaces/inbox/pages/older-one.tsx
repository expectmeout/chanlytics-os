/**
 * One person past a week, at the foot of the Inbox's Needs you (17 Nov 2026): their own row, as Today draws them
 * (today/need-you/older.tsx), where the Inbox drew a fold of one, "1 waiting over a week", under a card that said nobody
 * was waiting. Who, what happened, how long, "toll-free" beside a toll-free number, and Mark done at its right, which
 * hands them back to the receptionist (today/need-you/sheet/hand-back.ts) and says so in a toast with its Undo, since the
 * row leaves with the hold. A press on the row opens their conversation where the Inbox holds it, else their row's door.
 */
import { useState } from "react";
import { NEED_YOU_WORDS as W, type TodayQueueRowVM } from "@chanlytics/contracts";
import { AttnRow } from "../../kit/attention/attn-row";
import type { Flash } from "../../shell-doors";
import { handBackAll, handedBackWords } from "../../today/need-you/sheet/hand-back";
import { olderWords } from "../../today/need-you/sheet/row-words";
import { gate } from "../shell";

export function OlderOne({
  row,
  onOpen,
  flash,
}: {
  row: TodayQueueRowVM;
  onOpen: () => void;
  flash: (flash: Flash) => void;
}) {
  const [busy, setBusy] = useState(false);
  const mark = async () => {
    setBusy(true);
    const back = await handBackAll([row]);
    setBusy(false);
    const undo = back.undo;
    flash(
      back.done
        ? { msg: handedBackWords(back), undo: undo ? () => void undo() : null }
        : { tone: "danger", msg: handedBackWords(back) || W.oldDone.failed(1) },
    );
  };
  return (
    <AttnRow
      {...olderWords(row)}
      testid="inbox-older-one"
      ctaTestid="inbox-older-done"
      onOpen={onOpen}
      cta={
        row.conversationId
          ? {
              label: W.oldDone.yes,
              kind: "ghost",
              busy,
              onClick: () => void mark(),
              gate: gate("approve", "mark them done"),
            }
          : null
      }
    />
  );
}
