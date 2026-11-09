/**
 * Whoever has waited past a week, at the end of Need you and in no count (Today in three zones, 2 Nov 2026; drawn anew
 * 8 Nov 2026). One person is their own row: who, how long, what happened, Mark done at its right, and a press on the row
 * opens them as any other row does (a phone's sheet, a desk's place), so a number can be looked at before it is let go. It
 * was one row that opened nothing, its only press Mark all done, whoever it was. Several are one row, how many and who, with
 * Mark all done, which opens in place into each of them. Never the page's coral: nobody counts them, and "Nothing needs you"
 * stands over them.
 */
import { useState } from "react";
import { NEED_YOU_WORDS as W, phoneAsWritten, tollFreeNumber, type TodayQueueRowVM } from "@chanlytics/contracts";
import { AttnRow } from "../../kit/attention/attn-row";
import { gate } from "../shell";
import { NeedYouGroup, handBackAll, handedBackWords, type HandedBack } from "./groups";
import { Done } from "./parts";
import { needYouRows, rowWords, type NeedYouRowsCtx } from "./people-rows";
import { opensToWork } from "./rows";
import { useRowState } from "./row-state";

/** What Mark done, or Mark all done, came to in the row's place, with its one Undo. */
function handedWork(handed: HandedBack, undo: (() => void) | null, busy: boolean) {
  return <Done words={handedBackWords(handed)} act={undo ? { label: W.undo, onPress: undo, busy } : null} />;
}

/** One person past a week: their own row, which opens; opened or acted on, the row every other person's is. */
function OlderPerson({ row, ctx }: { row: TodayQueueRowVM; ctx: NeedYouRowsCtx }) {
  const [handed, setHanded] = useRowState<HandedBack | null>(row.id, "handedBack", null);
  const [busy, setBusy] = useState(false);
  if (!handed && (ctx.kept.has(row.id) || ctx.focus === row.id)) return <>{needYouRows([row], ctx)}</>;
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
  const words = rowWords(row);
  const may = ctx.may && !!row.conversationId;
  return (
    <AttnRow
      {...words}
      trail={tollFreeNumber(row.phone ?? row.who) ? W.older.tollFree : words.trail}
      // A number's face is already the phone: one glyph says it.
      via={phoneAsWritten(row.who) ? null : words.via}
      // How long, in the plain ink: past a week is what the row is, and the amber is for who waits now.
      wait={words.wait ? { words: words.wait.words, long: false } : null}
      testid="queue-older"
      ctaTestid="today-old-done"
      onOpen={handed ? undefined : () => (opensToWork(row) ? ctx.open(row.id) : ctx.nav(row.cta.to))}
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
  const may = rows.some((r) => !!r.conversationId) && ctx.may;
  const markAll = async () => {
    setBusy(true);
    const back = await handBackAll(rows);
    setBusy(false);
    if (!back.done) return ctx.flash({ tone: "danger", msg: <>{handedBackWords(back)}</> });
    onHanded(handed ? handedBoth(handed, back) : back);
  };
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
        may && (!handed || handed.refused > 0)
          ? {
              label: W.oldDone.act,
              kind: "ghost",
              busy,
              onClick: () => void markAll(),
              gate: gate("approve", "mark them done"),
            }
          : null
      }
      work={handed ? handedWork(handed, undo ? () => void undo() : null, busy) : null}
    />
  );
}

/**
 * Older's group: one person drawn as themself, several as one row that opens into each. `bare` where nothing else is drawn
 * above it: the row says what the group's name would, on a day whose head says nothing needs you.
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
    <NeedYouGroup title={W.group.old} count={null} pane={!!ctx.phone} bare={bare} testid="today-group-old">
      {only && rows.length === 1 && !handed ? (
        <OlderPerson row={only} ctx={ctx} />
      ) : (
        <>
          <OlderSummary rows={rows} ctx={ctx} handed={handed} onHanded={onHanded} onOpen={() => setOpen(!open)} />
          {open && !handed ? rows.map((r) => <OlderPerson key={r.id} row={r} ctx={ctx} />) : null}
        </>
      )}
    </NeedYouGroup>
  );
}
