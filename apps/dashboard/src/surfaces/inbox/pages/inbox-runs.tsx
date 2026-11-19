/**
 * What waits for an OK, in Needs you under its conversations (the wiring's second audit, S7-2): the whole list of what
 * waits for you, of which Today's queue is a part (the Campaigns wiring review's rule D, lane 4, 19 Oct 2026). The runs'
 * rows are the one builder's (surfaces/waits/wait-rows.tsx), Today's own: the same row with the same act, Approve in
 * place where an OK alone sends a run, Open where its screen answers it, two or more waiting for an OK one row whose
 * first opens and walks the rest. A run opens over the Inbox (rule C), so Back comes back here.
 *
 * People first (Ruben, 19 Nov 2026, decision 0142): these stood over the conversations, each four lines and a row of
 * verbs tall, saying its state three times, and two of them took the first screen of a phone before anyone waiting was
 * drawn. They stand under the conversations now, each a conversation's height (the builder's `slim`: its name, one fact
 * in the words Campaigns' list says it, one verb), and three or more are one line that opens in place into them.
 *
 * To send's row is one of them (Ruben's call 3): it opens the list as a sheet over the Inbox, as a run's row opens its
 * run (Ruben, 20 Oct 2026: it unfolded under its row). Each run's read is begun as its row is drawn, so its screen paints
 * at once. Outside the threads' list, whose keys walk threads alone.
 *
 * With them, the rest of what the one count holds for an OK that is no conversation (15 Nov 2026), each Today's own row
 * with its one door (today/need-you/sheet/row-words.tsx doorRow): a search waiting for its answer, which the badge counted
 * and the Inbox drew nowhere.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { joinWords, todayRunsSub, type TodayQueueRowVM } from "@chanlytics/contracts";
import { surfaceHook } from "@/bridge/surface-status";
import type { Flash } from "../../shell-doors";
import { warmRunDetail } from "../../campaigns/broadcasts/detail-read";
import { AttnRow } from "../../kit/attention/attn-row";
import { useNeedsYouParts } from "../../needs-you";
import { runsPending, useRunsActing } from "../../waits/run-acts";
import { doorRow } from "../../today/need-you/sheet/row-words";
import { waitRows } from "../../waits/wait-rows";
import { appNavigate } from "../shell";

// Drawn again when Sent's runs move (a run approved and another made keeps the count, and changes the rows).
const useMoved = surfaceHook({ useCallback, useSyncExternalStore });

/** A move to a route: the frame's, which opens a run, a search or a conversation over the Inbox (rule C). */
const nav = (to: string) => appNavigate(to);

/** From this many rows they are one line, which opens in place into them: two fit under the conversations, more push the fold of who has waited off the screen. */
const FOLD_FROM = 3;

/** The first two by name, then how many more: what the one line says it holds. */
const namedBriefly = (names: readonly string[]): string =>
  joinWords(names.length > 3 ? [...names.slice(0, 2), `${names.length - 2} more`] : [...names]);

export function InboxRunsWaiting({
  flash,
  rows,
}: {
  flash: (flash: Flash) => void;
  /** What the one count holds for an OK that is no conversation (needs-you-list.ts ixNeedsYouOf `approve`). */
  rows: readonly TodayQueueRowVM[];
}) {
  useMoved(["broadcasts"]);
  const parts = useNeedsYouParts();
  const acting = useRunsActing();
  const [open, setOpen] = useState(false);
  // The runs the badge counts (contracts runWaitsOnYou), once the Inbox is read: the rows' own list.
  const ids = parts?.runs
    ? runsPending()
        .waiting.map((r) => r.id)
        .join(",")
    : "";
  // Each run's read, begun before the press (one small read a run, held for the tab until a write): a row opens its run
  // over the Inbox (the Campaigns wiring review's rule C), so no page of its own is warmed for it.
  useEffect(() => {
    if (!ids) return;
    ids.split(",").forEach((id) => warmRunDetail(id));
  }, [ids]);
  if (!ids && !rows.length) return null;
  // The Inbox's verbs are quiet beside its threads: no row of a run is the page's one primary verb.
  const runs = ids ? waitRows({ nav, flash, verbKind: () => "ghost", acting, late: false, slim: true }) : null;
  const drawn = [...rows.map((r) => doorRow(r, nav)), ...(runs?.drawn ?? [])];
  const folded = drawn.length >= FOLD_FROM;
  return (
    <div className="ix-runs" data-slim="" data-testid="inbox-runs-waiting">
      {folded ? (
        <AttnRow
          glyph="bolt"
          initials=""
          name={todayRunsSub(drawn.length) ?? ""}
          sentence={namedBriefly([...rows.map((r) => r.who), ...(runs?.names ?? [])])}
          tone=""
          testid="inbox-approve-fold"
          onOpen={() => setOpen(!open)}
        />
      ) : null}
      {!folded || open ? drawn : null}
    </div>
  );
}
