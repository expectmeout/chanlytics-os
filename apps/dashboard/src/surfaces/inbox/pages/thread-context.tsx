/**
 * Who a real thread is with, beside it on a wide desk (the thread canvas, 1 Nov 2026): their face and name, where they
 * work, how to reach them and the door to their page, then what People's row says of them -- how the receptionist stands
 * with them, when they first came and how, the last contact, how much has passed, their visit, deal and next step, and
 * what they agreed to (contracts threadPersonFactsOf). It was a page away, behind the header's door, while the member
 * decided what to answer. A thread with no person behind it (a caller never added) has no rail, and the page draws it only
 * past the desk's breakpoint (inbox.css .ix-context): the header's door is the way there on anything narrower.
 */
import { threadPersonFactsOf, WORKS_AT_WORDS } from "@chanlytics/contracts";
import { Face } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { routeDoor } from "../../legacy-verbs";
import { personOnThread, useThreadPersonMoved } from "../../people/want-person";
import { usePeopleMoved } from "../thread/shell-thread";
import type { RealThread } from "../types";

/** The rail's own words: its name to a screen reader, its door, and the beat before People's row is read. */
const CONTEXT_WORDS = {
  about: (who: string) => `About ${who}`,
  open: "Open their page",
  reading: "Reading…",
} as const;

export const ThreadContext = ({
  thread,
  onOpenClient,
}: {
  thread: RealThread;
  onOpenClient: (clientId: string) => void;
}) => {
  usePeopleMoved(); // drawn again when People's rows land
  useThreadPersonMoved(); // and when the thread's own read of its person lands (the header asks for it)
  const clientId = thread.clientId;
  if (!clientId) return null;
  const row = personOnThread(thread.conversationId, clientId)?.row ?? null;
  const works = row && !row.standIn && row.worksAt && !row.worksAt.gone ? row.worksAt.name : null;
  return (
    <aside className="ix-context" aria-label={CONTEXT_WORDS.about(thread.who)} data-testid="ix-context">
      <div className="ix-context-who">
        <Face person={{ name: thread.who, initials: thread.avatar }} size="xl" />
        <div className="ix-context-name">{thread.who}</div>
        {works ? (
          <div className="ix-context-line" data-testid="ix-context-works">
            {WORKS_AT_WORDS.title} {works}
          </div>
        ) : null}
        {row && row.email ? (
          <div className="ix-context-line">
            <Icon name="mail" size={12} className="ix-context-glyph" />
            <span className="ix-context-words">{row.email}</span>
          </div>
        ) : null}
        {thread.phoneDisplay ? (
          <div className="ix-context-line">
            <Icon name="phone" size={12} className="ix-context-glyph" />
            <span className="ix-context-words">{thread.phoneDisplay}</span>
          </div>
        ) : null}
        <LinkButton
          className="ix-context-door"
          {...routeDoor(`clients/${clientId}`, () => onOpenClient(clientId))}
          data-testid="ix-context-door"
        >
          {CONTEXT_WORDS.open} <Icon name="chevron" size={10} />
        </LinkButton>
      </div>
      {row ? (
        <dl className="ix-context-facts">
          {threadPersonFactsOf(row).map((f) => (
            <div
              key={f.key}
              className="ix-context-fact"
              data-none={f.none ? "" : undefined}
              data-testid={`ix-context-${f.key}`}
            >
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="ix-context-reading" aria-busy="true">
          {CONTEXT_WORDS.reading}
        </p>
      )}
    </aside>
  );
};
