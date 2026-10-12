/**
 * The Ads page's pane line (MOCKUP; spec C2, C9, C11): "Last 30 days · read 9:19 AM" with the Example pill, which is also the
 * kit's Menu that chooses the example; and at its right the three platforms, each a word and a 7px dot, then Accounts. A
 * platform's standing has ONE home, here: pressed, it opens the kit's Popover with what it stands on (dot rows), who charges
 * the card, and the door to Settings › Connections. No brand colour, logo or letter tile: a platform is its word. The dot rows
 * are also the first-ad checklist's (hero.tsx draws them), so they are exported. Under it, one quiet line for each account whose
 * last read failed (ReadNotes), with its "Try again". On a touch screen a standing and Accounts are 44px to reach (ads.css).
 */
import type { AdPlatform } from "@chanlytics/contracts";
import { ADS_DOORS, ADS_EXAMPLES, EXAMPLE, HEAD } from "@chanlytics/contracts/ads-page";
import type { AdsExample, FailedVM, StandRowVM, StandingVM } from "@chanlytics/contracts/ads-page";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Menu } from "../../kit/menu/menu";
import { Popover } from "../../kit/popover/popover";
import { routeDoor } from "../../legacy-verbs";
import { CmDot } from "../parts/head";

/** Dot rows of what a platform, or a first ad, stands on: green where it is in order, an amber ring where it needs you, a door to fix it. */
export function StandRows({ rows }: { rows: readonly StandRowVM[] }) {
  return (
    <ul className="ads-dots">
      {rows.map((r) => (
        <li key={r.text} className="ads-dotline" data-tone={r.tone}>
          <span className="ads-dot" data-state={r.tone} aria-hidden="true" />
          <span className="ads-dotline-text">{r.text}</span>
          {r.door ? (
            <LinkButton className="ads-dotline-door" {...routeDoor(r.door.to)}>
              {r.door.words} <Icon name="chevron" size={11} />
            </LinkButton>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** What a platform's word opens: the account and when it was read, what it stands on, who charges, and the door. */
function StandBox({ s }: { s: StandingVM }) {
  return (
    <>
      <p className="ads-stand-account">{s.account ?? s.word}</p>
      {s.rows.length > 0 ? <StandRows rows={s.rows} /> : null}
      <p className="ads-stand-note">{s.note}</p>
      <LinkButton className="ads-stand-door" {...routeDoor(s.door.to)}>
        {s.door.words} <Icon name="chevron" size={11} />
      </LinkButton>
    </>
  );
}

/** One platform: its dot and its name, which open its standing. */
function Stand({ s }: { s: StandingVM }) {
  return (
    <Popover
      label={s.name}
      align="end"
      className="ads-stand-box"
      trigger={
        <LinkButton
          className="ads-stand"
          aria-label={`${s.name}, ${s.word}`}
          data-state={s.state}
          data-testid={`ads-stand-${s.id}`}
        >
          <span className="ads-dot" data-state={s.state} aria-hidden="true" />
          {s.name}
        </LinkButton>
      }
    >
      <StandBox s={s} />
    </Popover>
  );
}

interface ExampleMenuProps {
  example: AdsExample;
  onExample: (next: AdsExample) => void;
}

/** The quiet Example pill, which is the kit's Menu that chooses the example (spec C11). Mockup only. */
function ExampleMenu({ example, onExample }: ExampleMenuProps) {
  const choose = (value: string) => {
    const next = ADS_EXAMPLES.find((e) => e === value);
    if (next) onExample(next);
  };
  return (
    <Menu
      label={EXAMPLE.label}
      align="start"
      groups={[
        {
          header: EXAMPLE.note,
          choose: {
            value: example,
            onChoose: choose,
            tick: <Icon name="check" size={13} />,
            options: ADS_EXAMPLES.map((id) => ({ value: id, label: EXAMPLE.choices[id] })),
          },
        },
      ]}
      trigger={
        <Button variant="quiet" size="sm" className="ads-example" data-testid="ads-example">
          {EXAMPLE.pill} <Icon name="chevron-down" size={11} />
        </Button>
      }
    />
  );
}

interface PaneLineProps extends ExampleMenuProps {
  /** `Last 30 days · read 9:19 AM`. */
  said: string;
  standing: readonly StandingVM[];
  /** v0 draws its platforms beside its hero, so the pane line does not say them twice. */
  showStanding: boolean;
}

interface ReadNotesProps {
  failed: readonly FailedVM[];
  /** Read the account again ("Try again"). */
  onAgain: (platform: AdPlatform) => void;
}

/**
 * One quiet line under the pane line for each account whose last read failed: which numbers, as of when, and the press that
 * reads it again. The rows of that platform hold their last numbers and say so (ledger/ledger.tsx). Nothing here is red: the
 * numbers are the last that were read, not wrong ones.
 */
export function ReadNotes({ failed, onAgain }: ReadNotesProps) {
  if (failed.length === 0) return null;
  return (
    <div className="ads-unread" role="status" data-testid="ads-unread">
      {failed.map((f) => (
        <p key={f.platform} className="ads-unread-line" data-testid="ads-unread-line">
          <span>{f.line}</span>
          <CmDot />
          <LinkButton onClick={() => onAgain(f.platform)} className="ads-unread-again" data-testid="ads-unread-again">
            {f.again}
          </LinkButton>
        </p>
      ))}
    </div>
  );
}

/** The pane line: what it covers and the Example pill at the left; the platforms and Accounts at the right. */
export function PaneLine({ said, standing, showStanding, example, onExample }: PaneLineProps) {
  return (
    <div className="ads-window" data-testid="ads-window">
      <p className="ads-window-said">
        <span data-testid="ads-window-said">{said}</span>
        <ExampleMenu example={example} onExample={onExample} />
      </p>
      {showStanding ? (
        // A row that scrolls across on a narrow phone takes its own touch: no swipe along it walks the strip.
        <div className="ads-stands" role="group" aria-label={HEAD.accounts} data-own-drag data-testid="ads-stands">
          {standing.map((s) => (
            <Stand key={s.id} s={s} />
          ))}
          <LinkButton className="ads-accounts" {...routeDoor(ADS_DOORS.accounts)} data-testid="ads-accounts">
            {HEAD.accounts} <Icon name="chevron" size={11} />
          </LinkButton>
        </div>
      ) : null}
    </div>
  );
}
