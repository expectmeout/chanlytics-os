/**
 * What opens over Today (the second look of 20 Nov 2026, N1 to N3): a visit to mark, in the Calendar's own sheet for it,
 * and a conversation, in the Inbox's one pane for it, each by the page's address (`?see=visit:<id>:<day>`,
 * `?see=thread:<id>`: see/over.ts), so Back closes it and a reload opens it again. A press on either on Today opens it
 * here (see/see-over.ts inPlace); anywhere else it goes to its page. Today draws them, not the frame: they open over Today
 * alone, and they are made of the Calendar's and the Inbox's reads, which Today reads from already. This module is its
 * own chunk, asked for as one opens, so Today pays nothing for either until then.
 */
import { useCallback, type ReactNode } from "react";
import { goToRoute } from "@/bridge/workspace";
import { SEE_WORDS, seeHomeOf, type SeeRef } from "../../see/over";
import { closeSeeOver, openSeeOver } from "../../see/see-over";
import { PaneSheet } from "../../campaigns/home/pane-sheet";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { useReadsHere } from "../../use-surface";
import type { Flash } from "../shell";
import { ThreadOver } from "./thread";
import { VisitOver } from "./visit";

/** The door from a thing over Today to its own page: a visit's day on the Calendar, a conversation in the Inbox. */
function HomeDoor({ seeRef, words }: { seeRef: SeeRef; words: string }) {
  return (
    <Button
      size="sm"
      className="see-home"
      onClick={() => goToRoute(seeHomeOf(seeRef), { home: true })}
      data-testid="see-home"
    >
      {words} <Icon name="chevron" size={11} />
    </Button>
  );
}

/**
 * A visit over Today: the Calendar's sheet for it (its peek on a desk), which draws its own frame, from the Calendar's
 * read and the campaigns around it. Its Next opens the next visit to mark in its place; one the read does not hold opens
 * at its home.
 */
function VisitHere({ seeRef, flash }: { seeRef: Extract<SeeRef, { kind: "visit" }>; flash: (f: Flash) => void }) {
  useReadsHere(["calendar", "calendar_runs"]);
  const missing = useCallback(() => goToRoute(seeHomeOf(seeRef), { home: true }), [seeRef]);
  return (
    <VisitOver
      id={seeRef.id}
      day={seeRef.day}
      onClose={closeSeeOver}
      onWalk={(next) => openSeeOver({ kind: "visit", ...next })}
      onMissing={missing}
      flash={(text) => flash({ msg: text })}
      home={<HomeDoor seeRef={seeRef} words={SEE_WORDS.homeVisit} />}
    />
  );
}

/** A conversation over Today, in the sheet a run opens in, its door to the Inbox in the sheet's head. */
function ThreadHere({
  seeRef,
  open,
  flash,
}: {
  seeRef: Extract<SeeRef, { kind: "thread" }>;
  open: boolean;
  flash: (f: Flash) => void;
}) {
  useReadsHere(["inbox", "conversations", "settings", "reply_drafts"]);
  return (
    <PaneSheet
      open={open}
      title={<span className="see-kicker">{SEE_WORDS.thread}</span>}
      tools={<HomeDoor seeRef={seeRef} words={SEE_WORDS.homeThread} />}
      toolsInLine
      onClose={closeSeeOver}
      wide
      over
      testid="see-thread"
    >
      <ThreadOver id={seeRef.id} flash={flash} />
    </PaneSheet>
  );
}

/** The thing open over Today, or the one last open while its sheet leaves (`open` false). */
export function TodayOver({ seeRef, open, flash }: { seeRef: SeeRef; open: boolean; flash: (f: Flash) => void }) {
  let drawn: ReactNode = null;
  if (seeRef.kind === "visit") drawn = open ? <VisitHere seeRef={seeRef} flash={flash} /> : null;
  if (seeRef.kind === "thread") drawn = <ThreadHere seeRef={seeRef} open={open} flash={flash} />;
  return drawn;
}
