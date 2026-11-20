/**
 * A run waiting for a word, as Today, calm draws it (D15 and D17, 19 Nov 2026). The rows are the list's own
 * (waits/wait-rows.tsx `waitParts`, the very rows the Inbox's Needs you draws), so what waits and what its press does is
 * decided once. Here each is a line, its one fact first and whose it is under it, the whole line the press that opens it
 * over the page; or the page's card, where the head counts it and nobody waits before it: its fact the title, why under
 * it, and its verbs as the card's buttons.
 */
import { Button } from "../../kit/button/button";
import { Face } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import type { WaitPart } from "../../waits/wait-rows";
import { useTodayOnPhone } from "../phone";
import { Lead, CardActs } from "./lead";
import type { CalmLine } from "./lines";

/** A campaign's glyph, as its rows and its page wear it. */
const campaign = (size: number) => <Icon name="bolt" size={size} />;

/** A waiting run as a line: what waits, whose it is, and a press that opens it. */
export function waitLine(part: WaitPart): CalmLine {
  return {
    first: { mark: campaign(16) },
    name: part.head,
    facts: [part.whose],
    press: part.open,
    tight: true,
    testid: part.testid,
  };
}

/** A waiting run in the card: whose it is, what waits, why, and its verbs. */
export function WaitLead({ part }: { part: WaitPart }) {
  const phone = useTodayOnPhone();
  const size = phone ? "touch" : "lg";
  const kind = (
    <>
      <Face glyph={campaign(12)} tile size="sm" />
      <span className="calm-whose">{part.whose}</span>
    </>
  );
  return (
    <Lead
      holder="wait"
      id={part.key}
      label={part.name}
      kind={kind}
      title={part.head}
      why={part.why}
      testid={part.testid}
    >
      <CardActs>
        <Button
          variant="primary"
          size={size}
          onClick={part.cta.onClick}
          disabled={!!part.cta.busy}
          aria-busy={part.cta.busy || undefined}
          {...(part.cta.gate ?? {})}
          data-testid="today-card-act"
        >
          {part.cta.label}
        </Button>
        {part.also ? (
          <Button
            variant="quiet"
            size={size}
            onClick={part.also.onClick}
            disabled={!!part.also.busy}
            aria-busy={part.also.busy || undefined}
            {...(part.also.gate ?? {})}
          >
            {part.also.label}
          </Button>
        ) : null}
      </CardActs>
    </Lead>
  );
}
