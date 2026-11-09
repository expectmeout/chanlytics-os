/**
 * What was said on a row (one sheet, 9 Nov 2026): the real words, their last three at rest and all a row carries once the sheet
 * is pulled up, in place of two boxes that repeated the row. A reply that never reached them says so under it. With no thread
 * read, their own words if the row holds them; with none of those, nothing, and the sheet's own sentence says the rest.
 */
import { NEED_YOU_WORDS as W, type TodayQueueRowVM, type TodayRowSaid } from "@chanlytics/contracts";

/** How much of a thread stands at rest: a pull up shows the rest. */
const AT_REST = 3;

export function Said({ row, pulled = false }: { row: TodayQueueRowVM; pulled?: boolean }) {
  const said =
    row.said ?? (row.quoted && row.sentence ? [{ from: "them" as const, text: row.sentence, at_ms: 0 }] : []);
  return said.length ? <SaidLines said={said} pulled={pulled} /> : null;
}

/** The words themselves. */
export function SaidLines({ said, pulled = false }: { said: readonly TodayRowSaid[]; pulled?: boolean }) {
  const shown = pulled ? said : said.slice(-AT_REST);
  return (
    <div className="ny-said" data-testid="sheet-said">
      {shown.map((m, i) => (
        <div key={`${m.at_ms}-${i}`} className="ny-m" data-from={m.from}>
          {m.text}
        </div>
      ))}
      {shown.at(-1)?.from === "failed" ? <div className="ny-m-why">{W.failed.notReached}</div> : null}
    </div>
  );
}
