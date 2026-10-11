/**
 * The Ads page on a phone (MOCKUP; directions PHONE, spec C2 and C3): content first. The head's sentence, the muted lines and
 * the pane line are the page's (ads-page.tsx); this is what follows them: one list in one pane, with the people waiting on
 * you first (one amber row: how many, who by name, and the longest wait in amber; one person is a door to their conversation or
 * page, several open as a list of doors), then each ad as the kit's ListRow `bare` on the Messages phone row's shape (a 22px door
 * ring, the name the door to its drawer, the bookings over what each cost at the end, the platform and door, the state as a dot
 * and a word), then the Ask line as the LAST row; then Coming, What came back in one line, and the quiet footnote with its door to
 * Results. No group heads, no platform tile: the door is in each row's line, and a platform's standing is the pane line's.
 */
import { useState } from "react";
import { ADS_WORDS, adsResultsRoute } from "@chanlytics/contracts";
import { GATE, PHONE } from "@chanlytics/contracts/ads-page";
import type { AdRowVM, AdWaitingRowVM, AdsVM, AskVM } from "@chanlytics/contracts/ads-page";
import type { ReactNode } from "react";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import type { LinkButtonProps } from "../../../kit/link-button/link-button";
import { ListRow } from "../../../kit/list-row/list-row";
import { Panel } from "../../../kit/panel/panel";
import { cx } from "../../../kit/variants";
import { gate, routeDoor } from "../../../legacy-verbs";
import { cmRowPress } from "../../parts/head";
import { spends } from "../ask-line";
import { CameBackBlock, ComingBlock } from "../tiles";

interface WrapRowProps {
  glyph: string;
  tone: "warn" | "ask";
  /** The press: a door or an act. Its words wrap to as many lines as they need. */
  press: LinkButtonProps;
  testid: string;
  children: ReactNode;
  /** A second line under the words, in the dim ink. */
  sub?: ReactNode;
  /** What stands at the row's end before its chevron, in amber: how long. */
  since?: ReactNode;
  /** What opens under the row, at its whole width. */
  more?: ReactNode;
}

/** A row whose words are a sentence (the people waiting, the Ask line): a ring, the words wrapping, a chevron. */
function WrapRow({ glyph, tone, press, testid, children, sub = null, since = null, more = null }: WrapRowProps) {
  return (
    <div className="cmh-phone-row" data-opens="true" data-testid={testid}>
      <span className="cmh-group-ring ads-phone-ring" data-tone={tone} aria-hidden="true">
        <Icon name={glyph} size={12} />
      </span>
      <LinkButton {...press} className="ads-wrap-press" data-testid={`${testid}-row`}>
        <span className="ads-wrap-said">
          {children}
          {sub ? <span className="ads-wrap-sub">{sub}</span> : null}
        </span>
        {since ? <span className="ads-wrap-since">{since}</span> : null}
        <Icon name="chevron" size={12} />
      </LinkButton>
      {more}
    </div>
  );
}

interface OpenProps {
  /** Open an ad over the page, pushed so Back closes it. */
  onOpen: (route: string) => void;
}

/** One person who waits: a door to their conversation or page, the ad and when, and the days in amber. */
function WaitingPerson({ person }: { person: AdWaitingRowVM }) {
  return (
    <li className="ads-waiting-person" data-testid="ads-needs-person">
      <LinkButton
        {...routeDoor(person.open)}
        className="ads-waiting-door"
        aria-description={person.tip}
        data-testid="ads-needs-door"
      >
        <span className="ads-waiting-who">
          <b>{person.name}</b>
          <span className="ads-waiting-line">{person.line}</span>
          <span className="ads-waiting-where">{person.tip}</span>
        </span>
        <span className="ads-since">{person.since}</span>
      </LinkButton>
    </li>
  );
}

interface WaitingProps {
  people: readonly AdWaitingRowVM[];
  /** `2 people from your ads are waiting on you`. */
  needs: string;
  /** `Jordan P. · Amy G.`. */
  names: string;
  /** The longest wait: `6 days`. */
  since: string;
}

/**
 * The people from ads who wait on the owner: the one amber row. One person is a door to their conversation (their page where
 * there is none); several open as a list of doors, one each, so no one is reached only by being first.
 */
function WaitingRow({ people, needs, names, since }: WaitingProps) {
  const [open, setOpen] = useState(false);
  const first = people.at(0);
  if (!first) return null;
  const many = people.length > 1;
  const press: LinkButtonProps = many
    ? { onClick: () => setOpen((was) => !was), "aria-expanded": open }
    : { ...routeDoor(first.open), "aria-description": first.tip };
  const list =
    many && open ? (
      <ul className="ads-waiting-list" data-testid="ads-needs-list">
        {people.map((person) => (
          <WaitingPerson key={person.personId} person={person} />
        ))}
      </ul>
    ) : null;
  return (
    <WrapRow glyph="notice" tone="warn" press={press} testid="ads-needs" sub={names} since={since} more={list}>
      {needs}
    </WrapRow>
  );
}

/** One ad: the door ring, the name, the bookings over the cost, the platform and door, and its state. */
function AdPhoneRow({ row, onOpen, arrived }: OpenProps & { row: AdRowVM; arrived: boolean }) {
  const { state, phone } = row;
  return (
    <div
      className="cmh-phone-row"
      data-row={row.id}
      data-opens="true"
      data-arrived={arrived ? "true" : undefined}
      data-testid="ads-row"
    >
      <span className="cmh-group-ring ads-phone-ring" aria-hidden="true">
        <Icon name={row.glyph} size={12} />
      </span>
      <ListRow
        bare
        name={
          <LinkButton
            {...routeDoor(row.open, onOpen)}
            size="inherit"
            className="cmh-row-name"
            data-row-open
            data-testid="ads-row-open"
          >
            {row.name}
          </LinkButton>
        }
        end={(place) => (
          <span className={cx(place, "ads-phone-end")}>
            <span className="ads-phone-top tabular">{phone.endTop}</span>
            {phone.endSub ? <span className="ads-phone-sub">{phone.endSub}</span> : null}
          </span>
        )}
        said={phone.line}
        facts={[
          <span key="state" className="ads-phone-state" data-tone={state.tone}>
            <span className="ads-dot" data-state={state.tone} aria-hidden="true" />
            {state.word}
          </span>,
          // What blocks an ad is said on its row; the rest of a state's second line is the drawer's. A running ad with
          // something to tell the owner (a price that changed) says that.
          state.tone === "warn" || row.alert ? state.second : null,
        ]}
        className="cmh-phone-line"
        role="presentation"
        onClick={cmRowPress}
      />
    </div>
  );
}

interface AskRowProps {
  ask: AskVM;
  onYes: (ask: AskVM) => void;
  onNo: () => void;
}

/**
 * The Ask line as the list's last row: the short sentence and a chevron. A tap opens the whole consequence under it, the
 * primary (46px) above "Not now"; a tap on the row again puts it away, which is not "Not now" (only that puts the line off for
 * the session). A proposal that only opens an ad opens it at the tap. A press that spends is the owner's.
 */
function AskRow({ ask, onYes, onNo }: AskRowProps) {
  const [open, setOpen] = useState(false);
  const answer = (yes: boolean) => {
    setOpen(false);
    if (yes) onYes(ask);
    else onNo();
  };
  const more =
    open && ask.confirm ? (
      <div className="ads-ask-open" data-testid="ads-ask-open">
        <p>{ask.confirm}</p>
        <Button
          variant="primary"
          className="ads-ask-big"
          onClick={() => answer(true)}
          data-testid="ads-ask-press"
          {...(spends(ask) ? gate("approve", GATE.change) : null)}
        >
          {ask.press}
        </Button>
        <Button variant="quiet" className="ads-ask-big" onClick={() => answer(false)} data-testid="ads-ask-not">
          {ask.dismiss}
        </Button>
      </div>
    ) : null;
  const press = () => {
    if (ask.confirm) setOpen((was) => !was);
    else onYes(ask);
  };
  return (
    <WrapRow
      glyph="sparkle"
      tone="ask"
      press={{ onClick: press, "aria-expanded": ask.confirm ? open : undefined }}
      testid="ads-ask"
      more={more}
    >
      {ask.short}
    </WrapRow>
  );
}

interface AdsPhoneProps extends OpenProps {
  vm: AdsVM;
  /** The Ask line, if it has something true to say and was not put off. */
  ask: AskVM | null;
  onYes: (ask: AskVM) => void;
  onNo: () => void;
  /** The ad just turned on, if any. */
  arrived: string | null;
}

/** The phone page from its list down: who waits, the ads, the Ask line, Coming, What came back, the footnote and Results. */
export function AdsPhone({ vm, ask, onOpen, onYes, onNo, arrived }: AdsPhoneProps) {
  const rows = vm.groups.flatMap((g) => g.rows);
  const waiting = vm.tiles ? vm.tiles.waiting.rows : [];
  const phone = vm.phone;
  return (
    <>
      <Panel
        as="section"
        size="flush"
        className="cmh-block ads-phone-list"
        aria-label={ADS_WORDS.adsTab}
        data-testid="ads-phone-list"
      >
        {phone && phone.needs && phone.names && phone.since ? (
          <WaitingRow people={waiting} needs={phone.needs} names={phone.names} since={phone.since} />
        ) : null}
        {rows.map((row) => (
          <AdPhoneRow key={row.id} row={row} onOpen={onOpen} arrived={arrived === row.id} />
        ))}
        {ask ? <AskRow key={`${ask.kind}:${ask.adId}`} ask={ask} onYes={onYes} onNo={onNo} /> : null}
      </Panel>
      {vm.tiles ? (
        <>
          <ComingBlock tile={vm.tiles.coming} onOpen={onOpen} />
          <CameBackBlock tile={vm.tiles.cameBack} phone link={vm.link} />
        </>
      ) : null}
      {phone ? (
        <p className="ads-footnote" data-testid="ads-footnote">
          <span>{phone.footnote}</span>
          <LinkButton
            {...routeDoor(adsResultsRoute(), onOpen)}
            className="ads-results-door"
            data-testid="ads-results-door"
          >
            {PHONE.results} <Icon name="chevron" size={11} />
          </LinkButton>
        </p>
      ) : null}
    </>
  );
}
