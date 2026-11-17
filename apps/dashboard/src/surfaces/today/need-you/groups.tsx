/**
 * Need you's parts around its rows (Today in three zones, 2 Nov 2026): each group under its own small head (Up next,
 * Waiting on you, To decide, To do, Older; contracts need-you/groups.ts) with a press at its foot to what it could not hold,
 * The old ones are let go at once, each handed back to the receptionist with one Undo for all of them, by
 * sheet/hand-back.ts, which the Inbox's Needs you reads too.
 */
import { useId, type ReactNode } from "react";
import { routeDoor } from "../../frame-verbs";
import { Icon } from "../../kit/icon/icon";
import { doorGlyph } from "../shell";

/** What each group is, as its head's mark draws it: a word to write, an OK to give, a thing to do, a wait gone long. */
type NeedYouGroupKind = "reply" | "approve" | "do" | "old";

const GROUP_GLYPH: Record<NeedYouGroupKind, string> = { reply: "chat", approve: "check", do: "list", old: "clock" };

/**
 * A group of Need you's rows under its small head, on a desk and a phone alike (one list, 9 Nov 2026: a phone drew five
 * cards): its kind's mark, its words, how many where it says so, and at its foot a press to what it could not hold. The
 * head reads as a heading in the page's own type, its mark neutral as every mark is; its count is amber where it counts
 * people waiting on you, warn's own meaning, as the menu's count and the head's dot say them (his look, 17 Nov 2026: the
 * small capitals read as a label of the code's, hard on the eyes).
 */
export function NeedYouGroup({
  kind,
  title,
  count,
  bare = false,
  more = null,
  foot = null,
  testid,
  children,
}: {
  kind: NeedYouGroupKind;
  title: string;
  count: number | null;
  /** No head drawn, its name for a reader alone: its rows say what the head would. */
  bare?: boolean;
  /** What the group could not hold: how many, in words, and where they are. */
  more?: { label: string; to: string } | null;
  /** An act on the group's rows as a whole, at its foot over the press to the rest (To do's Mark all kept). */
  foot?: ReactNode;
  testid: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div
      className="ny-group"
      role="group"
      aria-labelledby={bare ? undefined : id}
      aria-label={bare ? title : undefined}
      data-testid={testid}
    >
      {bare ? null : (
        <div className="ny-group-head">
          <span className="mark" aria-hidden="true">
            <Icon name={GROUP_GLYPH[kind]} size={13} />
          </span>
          <span className="ny-group-title" id={id}>
            {title}
          </span>
          {count !== null ? (
            <span className="ny-group-n tabular" data-tone={kind === "reply" ? "warn" : undefined}>
              {count}
            </span>
          ) : null}
        </div>
      )}
      <div className="tq-list">
        {children}
        {foot}
        {more ? (
          <a className="ny-more" {...routeDoor(more.to)} data-testid={`${testid}-more`}>
            {more.label}
            <Icon name={doorGlyph()} size={11} />
          </a>
        ) : null}
      </div>
    </div>
  );
}
