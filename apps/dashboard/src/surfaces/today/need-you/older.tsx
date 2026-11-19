/**
 * Whoever has waited past a week, at the end of Need you and in no count (Today in three zones, 2 Nov 2026; drawn anew
 * 8 Nov 2026). One person is their own row: who, how long, what happened, Mark done at its right, and a press on the row
 * opens them as any other row does, so a number can be looked at before it is let go: their conversation, where a reply
 * is written (Today with colour, D8, 17 Nov 2026), else a phone's sheet or a desk's place. Mark done stays one press here. It
 * was one row that opened nothing, its only press Mark all done, whoever it was. Several are one row, how many and who, with
 * Mark all done, which asks first, and which opens in place into each of them. Never the page's coral: nobody counts them,
 * and "Nothing needs you" stands over them.
 */
import { useState } from "react";
import { NEED_YOU_WORDS as W, type TodayQueueRowVM } from "@chanlytics/contracts";
import { AttnRow } from "../../kit/attention/attn-row";
import { Confirm } from "../../kit/confirm/confirm";
import { gate } from "../shell";
import { NeedYouGroup } from "./groups";
import { handBackAll, handedBackWords, type HandedBack } from "./sheet/hand-back";
import { Done } from "./parts";
import { needYouRows, openInThread, type NeedYouRowsCtx } from "./people-rows";
import { olderWords } from "./sheet/row-words";
import { answersInThread, opensToWork } from "./rows";
import { useRowState } from "./row-state";

/** What Mark done, or Mark all done, came to in the row's place, with its one Undo. */
function handedWork(handed: HandedBack, undo: (() => void) | null, busy: boolean) {
  return <Done words={handedBackWords(handed)} act={undo ? { label: W.undo, onPress: undo, busy } : null} />;
}

/**
 * What a press on an old row opens: their conversation where its answer is written there (D8), else the row in place or
 * its own door.
 */
export function openOlder(row: TodayQueueRowVM, ctx: NeedYouRowsCtx): void {
  if (answersInThread(row) && row.conversationId) return openInThread(row, row.conversationId, ctx.nav);
  if (opensToWork(row)) return ctx.open(row.id);
  ctx.nav(row.cta.to);
}

/** One person past a week: their own row, which opens; opened or acted on, the row every other person's is. */
function OlderPerson({ row, ctx }: { row: TodayQueueRowVM; ctx: NeedYouRowsCtx }) {
  const [handed, setHanded] = useRowState<HandedBack | null>(row.id, "handedBack", null);
  const [busy, setBusy] = useState(false);
  // Opened in place only where its answer is not written in its conversation: one that is keeps its row and Mark done.
  const inPlace = ctx.focus === row.id && !answersInThread(row);
  if (!handed && (ctx.kept.has(row.id) || inPlace)) return <>{needYouRows([row], ctx)}</>;
  const mark = async () => {
    setBusy(true);
    // Kept before the door is asked: its refresh drops the hold from the read, and the row must stay to say so.
    ctx.keep(row);
    const back = await handBackAll([row]);
    setBusy(false);
    if (!back.done) {
      ctx.unkeep(row);
      ctx.flash({ tone: "danger", msg: <>{handedBackWords(back)}</> });
      return;
    }
    setHanded(back);
  };
  const undoIt = handed?.undo;
  const undo = undoIt
    ? async () => {
        setBusy(true);
        await undoIt();
        setBusy(false);
        setHanded(null);
        ctx.unkeep(row);
      }
    : null;
  const may = ctx.may && !!row.conversationId;
  return (
    <AttnRow
      {...olderWords(row)}
      testid="queue-older"
      ctaTestid="today-old-done"
      onOpen={handed ? undefined : () => openOlder(row, ctx)}
      cta={
        may && !handed
          ? {
              label: W.oldDone.yes,
              kind: "ghost",
              busy,
              onClick: () => void mark(),
              gate: gate("approve", "mark them done"),
            }
          : null
      }
      work={handed ? handedWork(handed, undo ? () => void undo() : null, busy) : null}
    />
  );
}

/** A second press's hand-back joined to the first's: what went in all, what the second refused, one Undo for both. */
function handedBoth(first: HandedBack, then: HandedBack): HandedBack {
  const undos = [first.undo, then.undo].filter((u): u is () => Promise<void> => !!u);
  return {
    done: first.done + then.done,
    refused: then.refused,
    undo: undos.length
      ? async () => {
          for (const u of undos) await u();
        }
      : null,
  };
}

/**
 * Several past a week, one row: how many and who, with Mark all done, which hands each back to the receptionist, says what
 * it came to in place and keeps one Undo for all of them. Refused whole, it says why and the press stays to try again;
 * refused in part, it says what went and offers the press again for the rest, whose Undo joins the first's.
 *
 * It asks first, in the row's own place, as the Inbox's fold does (contracts NEED_YOU_WORDS oldDone.ask; Ruben, 19 Nov
 * 2026, decision 0142): one press let all of them go, and a conversation nobody answered has no request to hand back, so
 * it is archived, which Undo does not bring back. The question says how many of them that is. The press again for the
 * rest goes at once: it was asked the first time.
 */
function OlderSummary({
  rows,
  ctx,
  handed,
  onHanded,
  onOpen,
}: {
  rows: readonly TodayQueueRowVM[];
  ctx: NeedYouRowsCtx;
  handed: HandedBack | null;
  onHanded: (h: HandedBack | null) => void;
  onOpen: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  // Who the press can let go: those whose conversation is held; and, of them, those archived for having no request.
  const going = rows.filter((r) => !!r.conversationId);
  const archived = going.filter((r) => r.closes === "archive").length;
  const may = going.length > 0 && ctx.may;
  const markAll = async () => {
    setBusy(true);
    const back = await handBackAll(rows);
    setBusy(false);
    setAsking(false);
    if (!back.done) return ctx.flash({ tone: "danger", msg: <>{handedBackWords(back)}</> });
    onHanded(handed ? handedBoth(handed, back) : back);
  };
  const ask = (
    <Confirm
      block
      question={W.oldDone.ask.question(going.length)}
      detail={W.oldDone.ask.detail(going.length, archived)}
      yes={W.oldDone.ask.yes(going.length)}
      no={W.oldDone.ask.no}
      busy={busy}
      busyLabel={W.oldDone.ask.busy}
      onYes={() => void markAll()}
      onNo={() => setAsking(false)}
      testid="today-old-ask"
    />
  );
  const undoAll = handed?.undo;
  const undo = undoAll
    ? async () => {
        setBusy(true);
        await undoAll();
        setBusy(false);
        onHanded(null);
      }
    : null;
  return (
    <AttnRow
      glyph="clock"
      initials=""
      name={W.older.row(rows.length)}
      sentence={rows.map((r) => r.who).join(", ")}
      tone=""
      testid="queue-older"
      ctaTestid="today-old-done"
      onOpen={handed ? undefined : onOpen}
      cta={
        may && !asking && (!handed || handed.refused > 0)
          ? {
              label: W.oldDone.act,
              kind: "ghost",
              busy,
              onClick: handed ? () => void markAll() : () => setAsking(true),
              gate: gate("approve", "mark them done"),
            }
          : null
      }
      work={asking ? ask : handed ? handedWork(handed, undo ? () => void undo() : null, busy) : null}
    />
  );
}

/**
 * Older's group, at Reply's foot: one person drawn as themself, under the group's name, several as one row that opens into
 * each, which says what they are ("14 older than a week") and so takes no head over it. `bare` where nothing else is
 * drawn above it: the row says what the group's name would, on a day whose head says nothing needs you.
 */
export function OlderGroup({
  rows,
  ctx,
  handed,
  onHanded,
  bare,
}: {
  rows: readonly TodayQueueRowVM[];
  ctx: NeedYouRowsCtx;
  handed: HandedBack | null;
  onHanded: (h: HandedBack | null) => void;
  bare: boolean;
}) {
  const [open, setOpen] = useRowState("today-older", "open", false);
  const [only] = rows;
  return (
    <NeedYouGroup kind="old" title={W.group.old} count={null} bare={bare || rows.length > 1} testid="today-group-old">
      {only && rows.length === 1 && !handed ? (
        <OlderPerson row={only} ctx={ctx} />
      ) : (
        <>
          <OlderSummary
            rows={rows}
            ctx={ctx}
            handed={handed}
            onHanded={onHanded}
            // On a phone it walks them, one by one, as its own walk (his call D7); a desk opens them in place.
            onOpen={() => (ctx.phone && only ? openOlder(only, ctx) : setOpen(!open))}
          />
          {open && !handed ? rows.map((r) => <OlderPerson key={r.id} row={r} ctx={ctx} />) : null}
        </>
      )}
    </NeedYouGroup>
  );
}
