/**
 * The two lines over the ads on the connected Ads page (the Ads plan's 4.4 and 6.3, as the canvas draws them): AI's one
 * line, its mark at rest beside what it proposes, and who from an ad needs you, in amber as every Needs you is. Each is
 * one press the width of the column, with a chevron that says it opens. Their words and where they go are the model's
 * (model.ts aiLineOf, needsYouLineOf); the layout is live.css's.
 */
import type { ReactNode } from "react";
import { Icon } from "../../../kit/icon/icon";
import { Press } from "../../../kit/press";
import { gate, routeDoor } from "../../../frame-verbs";
import { GATE } from "../model/words";
import type { AiLineVM, NeedsYouLineVM } from "./model";

/** What a line holds: its mark, its words, and the chevron that says it opens. */
function LineParts({ mark, children }: { mark: ReactNode; children: ReactNode }) {
  return (
    <>
      {mark}
      <span className="ads-line-said">{children}</span>
      <Icon name="chevron" size={12} className="ads-line-go" />
    </>
  );
}

/**
 * AI's one line: an ad on that AI can't answer is paused by the line itself, the owner's press, as its drawer's Pause;
 * keeping an ad going is Meta's own page, in a tab of its own; the first ad is New ad opened over the page, as + New
 * opens it and under the same gate, so Back closes it.
 */
function AiLine({ line, onOpen, onPause }: { line: AiLineVM } & Pick<AdsLinesProps, "onOpen" | "onPause">) {
  const parts = <LineParts mark={<Icon name="three" size={16} />}>{line.text}</LineParts>;
  const common = { className: "ads-ai-line", "data-kind": line.kind, "data-testid": "ads-ai-line" } as const;
  if (line.kind === "way_in") {
    const { ad } = line;
    return (
      <Press onClick={() => onPause(ad.id, ad.version)} {...gate("approve", GATE.change)} {...common}>
        {parts}
      </Press>
    );
  }
  if (line.kind === "extend")
    return (
      <Press href={line.href} target="_blank" rel="noopener noreferrer" {...common}>
        {parts}
      </Press>
    );
  const { route } = line;
  return (
    <Press onClick={() => onOpen(route)} {...gate("approve", GATE.turnOn)} {...common}>
      {parts}
    </Press>
  );
}

/** Who an ad brought and needs you now: a door to the longest wait's conversation, in the Inbox's Needs you. */
function NeedsYouLine({ line }: { line: NeedsYouLineVM }) {
  const mark = <span className="ads-dot" data-state="warn" aria-hidden="true" />;
  return (
    <Press {...routeDoor(line.open)} className="ads-needs-line" data-tone="warn" data-testid="ads-needs-you">
      <LineParts mark={mark}>
        <b>{line.title}</b> {line.who}
      </LineParts>
    </Press>
  );
}

interface AdsLinesProps {
  ai: AiLineVM | null;
  needsYou: NeedsYouLineVM | null;
  /** Open an address over the page, pushed so Back closes it (New ad). */
  onOpen: (route: string) => void;
  /** Pause an ad, as its drawer's Pause does. */
  onPause: (id: string, version: number) => void;
}

/** AI's line and who needs you, each where it has something to say; nothing where neither has. */
export function AdsLines({ ai, needsYou, onOpen, onPause }: AdsLinesProps) {
  if (!ai && !needsYou) return null;
  return (
    <div className="ads-lines">
      {ai ? <AiLine line={ai} onOpen={onOpen} onPause={onPause} /> : null}
      {needsYou ? <NeedsYouLine line={needsYou} /> : null}
    </div>
  );
}
