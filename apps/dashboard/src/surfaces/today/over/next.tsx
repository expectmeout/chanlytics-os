/**
 * Next, in the conversation sheet over Today (Working for you, W4, 21 Nov 2026): once your reply leaves the person this sheet
 * opened on no longer waiting, the next person who waits stands at its foot with Open, so three replies between clients
 * are three presses in one sheet, as a visit's sheet walks on to the next visit to mark. Nothing where they were not waiting
 * as it opened, or nobody else waits: the sheet's own Close is the way back to Today.
 */
import { useRef } from "react";
import { addressOf, namesAPerson, type TodayQueueRowVM } from "@chanlytics/contracts";
import { needsYouRowsNow, useNeedsYou } from "../../needs-you";
import { Button } from "../../kit/button/button";
import { Face } from "../../kit/face/face";
import { TODAY_LINE_WORDS } from "../model/lines";
import { rowWords } from "../need-you/sheet/row-words";
import { goFromToday } from "./open";

/** The people who wait now, in Need you's order, each with their conversation. */
function peopleWaiting(): TodayQueueRowVM[] {
  const rows = needsYouRowsNow();
  return rows ? [...rows.groups.next, ...rows.groups.waiting].filter((r) => !!r.conversationId) : [];
}

/**
 * The next person who waits, once the one this sheet opened on no longer does; null before, and where they were not
 * waiting as it opened. Drawn again as the one count moves (needs-you.ts), which a reply sent moves.
 */
function useNextAfter(conversationId: string): TodayQueueRowVM | null {
  useNeedsYou();
  const rows = peopleWaiting();
  const here = rows.some((r) => r.conversationId === conversationId);
  // Whether they waited as the sheet opened, once Today's read is there to say.
  const waited = useRef<boolean | null>(null);
  if (waited.current === null && needsYouRowsNow() !== null) waited.current = here;
  if (!waited.current || here) return null;
  return rows.find((r) => r.conversationId !== conversationId) ?? null;
}

/** The next person, at the conversation sheet's foot: who, what they said, and Open, their conversation in this sheet. */
export function NextUp({ conversationId }: { conversationId: string }) {
  const row = useNextAfter(conversationId);
  if (!row?.conversationId) return null;
  const words = rowWords(row);
  const to = addressOf({ kind: "conversation", id: row.conversationId });
  return (
    <div className="calm-next" data-testid="today-next">
      <span className="calm-next-word">{TODAY_LINE_WORDS.next}</span>
      <Face
        {...(namesAPerson(row) ? { person: { name: row.who, initials: row.initials } } : { initials: row.initials })}
        size="sm"
      />
      <span className="calm-next-tx">
        <b>{words.name}</b>
        <small>{words.sentence}</small>
      </span>
      <Button size="sm" variant="secondary" onClick={() => goFromToday(to)} data-testid="today-next-open">
        {TODAY_LINE_WORDS.open}
      </Button>
    </div>
  );
}
