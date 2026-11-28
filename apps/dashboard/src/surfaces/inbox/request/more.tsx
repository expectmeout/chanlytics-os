/**
 * Needs you's line that reads on past the requests it lists (00726). Today's read holds the newest 200 requests nobody
 * has answered, and the one count counts every one: the rest were counted and could not be reached. This line says how
 * many are beyond and, pressed, reads the next ones from where the list ended (GET forms/requests/more), each drawn as
 * the row Needs you gives every request, with its one door. Pressed again it reads on from the last it drew, until
 * none is left. Nothing is counted here: the one count already holds them.
 */
import { useState, useSyncExternalStore } from "react";
import { formRequestRowOf, type FormOpenRequestDto } from "@chanlytics/contracts";
import { readFormRequestsMore } from "@/bridge/verbs/forms";
import { EmptyState } from "../../kit/empty/empty";
import { hearNeedsYou } from "../../needs-you";
import { surfaceValue } from "../../surface-values";
import { doorRow } from "../../today/need-you/sheet/row-words";
import { appNavigate } from "../shell";
import { REQUEST_WORDS as W } from "./words";

/** What Today's read says is beyond its list: how many, and the request it ended on. Null: none beyond. */
const beyondNow = () => surfaceValue("today")?.queue.requests_beyond ?? null;
const beyondKey = (): string => {
  const beyond = beyondNow();
  return beyond ? `${beyond.count}:${beyond.after}` : "";
};

/** What the line has read on to: the requests, and whether its last read is under way or did not come back. */
interface ReadOn {
  /** Where Today's list ended, and its count, when these were read (beyondKey): either moved, and they are read again. */
  from: string;
  rows: FormOpenRequestDto[];
  state: "idle" | "reading" | "unread";
}

/** The line and the rows it read on to; nothing where the list holds every request. */
export function RequestsMore() {
  useSyncExternalStore(hearNeedsYou, beyondKey, beyondKey);
  const beyond = beyondNow();
  const [read, setRead] = useState<ReadOn | null>(null);
  const [now] = useState(() => new Date());
  if (!beyond) return null;
  // Today's list or its count moved (one was answered, one came): what was read on before may hold a request that is
  // answered now, so it is dropped, and read again when asked.
  const from = beyondKey();
  const mine = read?.from === from ? read : null;
  const rows = mine?.rows ?? [];
  const left = Math.max(0, beyond.count - rows.length);
  const readOn = async () => {
    const after = rows.at(-1)?.id ?? beyond.after;
    setRead({ from, rows, state: "reading" });
    const answer = await readFormRequestsMore(after).catch(() => null);
    setRead({
      from,
      rows: answer?.ok ? [...rows, ...answer.data.requests] : rows,
      state: answer?.ok ? "idle" : "unread",
    });
  };
  const unread = mine?.state === "unread";
  return (
    <>
      {rows.length > 0 ? (
        <div className="ix-runs" data-testid="ix-rq-more-rows">
          {rows.map((request) => doorRow(formRequestRowOf(request, now), (to) => appNavigate(to)))}
        </div>
      ) : null}
      {left > 0 ? (
        <EmptyState
          kind="line"
          glyph="note"
          title={unread ? W.more.unread : W.more.title(left)}
          body={unread ? "" : W.more.body}
          action={
            mine?.state === "reading"
              ? null
              : { label: unread ? W.more.again : W.more.act, onClick: () => void readOn(), testid: "ix-rq-more-go" }
          }
          testid="ix-rq-more"
        />
      ) : null}
    </>
  );
}
