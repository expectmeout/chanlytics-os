/**
 * Who a real thread is with, beside it on a wide desk (the thread canvas, 1 Nov 2026): their face and name, where they
 * work, how to reach them and the door to their page, then what People's row says of them -- how the receptionist stands
 * with them, when they first came and how, the last contact, how much has passed, their visit, deal and next step, and
 * what they agreed to (contracts threadPersonFactsOf). It was a page away, behind the header's door, while the member
 * decided what to answer. A thread with no person behind it (a caller never added) has no rail, and the page draws it only
 * past the desk's breakpoint (inbox.css .ix-context): the header's door is the way there on anything narrower.
 */
import { addressOf, threadPersonFactsOf, WORKS_AT_WORDS, type ThreadPersonFact } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Face, faceTileOf } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { routeDoor } from "../../legacy-verbs";
import { personOnThread, useThreadPersonMoved } from "../../people/want-person";
import { usePeopleMoved } from "../thread/shell-thread";
import { visitWordHere } from "../../workspace-word";
import type { RealThread } from "../types";

/** The rail's own words: its name to a screen reader, its door, and the beat before People's row is read. */
const CONTEXT_WORDS = {
  about: (who: string) => `About ${who}`,
  open: "Open profile",
  reading: "Reading…",
  /** What the thread waits on, at the rail's head while it needs you: how long, and why. */
  waiting: "Waiting",
  why: "Why",
} as const;

/** The rail's facts in the canvas's three groups: the thread and the receptionist, what has passed, what they agreed to. */
const NOW_KEYS = new Set(["receptionist"]);
const AGREED_KEYS = new Set(["consent"]);

/** One group of facts on the key column, its keys' test ids the rail's. */
function factsList(facts: ReadonlyArray<ThreadPersonFact>, lead: ReadonlyArray<ThreadPersonFact> = []) {
  const all = [...lead, ...facts];
  if (!all.length) return null;
  return (
    <dl className="ix-context-facts">
      {all.map((f) => (
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
  );
}

/**
 * People's facts of them in the canvas's three groups, a hairline between each: while the thread needs you, how long it has
 * waited and why at the head, beside how the receptionist stands with them; then what has passed between you; then what
 * they agreed to.
 */
function contextFacts(thread: RealThread, facts: ThreadPersonFact[]) {
  const waits: ThreadPersonFact[] =
    thread.state === "escalated"
      ? [
          ...(thread.waited ? [{ key: "waiting" as const, label: CONTEXT_WORDS.waiting, value: thread.waited }] : []),
          ...(thread.holdLine ? [{ key: "why" as const, label: CONTEXT_WORDS.why, value: thread.holdLine }] : []),
        ]
      : [];
  return (
    <>
      {factsList(
        facts.filter((f) => NOW_KEYS.has(f.key)),
        waits,
      )}
      {factsList(facts.filter((f) => !NOW_KEYS.has(f.key) && !AGREED_KEYS.has(f.key)))}
      {factsList(facts.filter((f) => AGREED_KEYS.has(f.key)))}
    </>
  );
}

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
        <Face
          person={{ name: thread.who, initials: thread.avatar }}
          size="xl"
          hue={faceTileOf(thread.who)}
          className="ix-context-round"
        />
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
        <Button
          variant="outline"
          size="lg"
          className="ix-context-door"
          {...routeDoor(addressOf({ kind: "person", id: clientId }), () => onOpenClient(clientId))}
          data-testid="ix-context-door"
        >
          {CONTEXT_WORDS.open}
          <Icon name="chevron" size={12} />
        </Button>
      </div>
      {row ? (
        contextFacts(thread, threadPersonFactsOf(row, visitWordHere()))
      ) : (
        <p className="ix-context-reading" aria-busy="true">
          {CONTEXT_WORDS.reading}
        </p>
      )}
    </aside>
  );
};
