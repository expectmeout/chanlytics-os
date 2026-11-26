/**
 * Campaigns › Ads once an account is or was connected: real ads, read from the owner's own Meta account (the Ads
 * plan's 4.4, as the canvas draws it on a phone and on a desk). At the left the notice where AI is stopped with ads
 * still on, or where Chanlytics is signed out or an ad was left running, then AI's one line and who from an ad needs
 * you, then the ads as a list under the headings every list wears (Ruben, 25 Nov 2026: fifty ads read as People's and the
 * Inbox's lists do): Needs you, On, Paused and Ended, Ended folded while anything else stands over it, each ad with where it
 * stands and its one number, narrowed by the filter and the find line in the bar (ad-list.ts); under them the people from
 * an ad Chanlytics cannot name, a quiet line each. What an ad made in Meta can do here, and whose people are not counted, are said in
 * the drawer of the ad they are about (ad-sheet.tsx). At the right, or at the foot on a phone, the ad account's card,
 * folded to its head while nothing needs the owner, and first on a phone where it says the one thing missing. Every
 * sentence is the model's (model.ts).
 */
import "./live.css";
import { useState, type ReactNode } from "react";
import { newAdRoute } from "@chanlytics/contracts";
import { EmptyState } from "../../../kit/empty/empty";
import { GroupHead } from "../../../kit/head/group-head";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { ListRow } from "../../../kit/list-row/list-row";
import { cx } from "../../../kit/variants";
import { gate, routeDoor } from "../../../frame-verbs";
import { cmRowPress } from "../../parts/head";
import { GATE } from "../model/words";
import { HEAD } from "../model/words-page";
import { adGroupsOf, useAdsLooked } from "./ad-list";
import { AdsLines } from "./lines";
import type { LiveNoticeVM, LiveRowVM, LiveVM } from "./model";
import { ADS_MANAGER, LIVE, META_TAB } from "./words";

function Notice({ notice }: { notice: LiveNoticeVM }) {
  return (
    <div className="ads-conn-need ads-live-notice" data-tone="warn" role="status" data-testid="ads-live-notice">
      <b>{notice.title}</b>
      <span>{notice.body}</span>
      {notice.door ? (
        <LinkButton href={ADS_MANAGER} {...META_TAB} data-testid="ads-live-notice-door">
          {notice.door} <Icon name="chevron" size={12} />
        </LinkButton>
      ) : null}
    </div>
  );
}

/**
 * An ad's row: its picture, its name over two lines at most, where it stands in its tone with the rest of its line quiet
 * after it, and at its end its one number. The whole row opens its drawer (cmRowPress).
 */
function Row({ row, onOpen }: { row: LiveRowVM; onOpen: (route: string) => void }) {
  return (
    <div className="ads-live-row" data-row-id={row.id} data-testid="ads-live-row">
      <ListRow
        // What it shows people, so an owner sees which ad is which (Ruben, 25 Nov 2026); its initials where nothing was read.
        face={{ person: { name: row.name }, ...(row.picture ? { photo: row.picture } : {}), tile: true, size: "xl" }}
        name={
          <LinkButton
            {...routeDoor(row.open, onOpen)}
            size="inherit"
            className="ads-live-name"
            data-row-open
            data-testid="ads-live-row-open"
          >
            {row.name}
          </LinkButton>
        }
        end={(place) => (
          <span className={cx(place, "ads-phone-end")}>
            {row.badge ? <span className="ads-live-said">{row.badge}</span> : null}
            {row.endTop ? <span className="ads-phone-top tabular">{row.endTop}</span> : null}
            {row.endSub ? <span className="ads-phone-sub">{row.endSub}</span> : null}
          </span>
        )}
        said={
          <span className="ads-phone-state">
            <span className="ads-dot" data-state={row.tone} aria-hidden="true" />
            <span className="ads-state-word" data-tone={row.tone}>
              {row.state}
            </span>
            {row.facts ? <span className="ads-state-facts">· {row.facts}</span> : null}
          </span>
        }
        className="ads-live-line"
        role="presentation"
        onClick={cmRowPress}
      />
    </div>
  );
}

/**
 * The ads under their headings, as the filter and the find line in the bar leave them (ad-list.ts): rows flush with the
 * list's edges and a hairline between two, as Made's, People's and the Inbox's rows stand. Ended, folded while another group
 * stands over it, opens and closes by its heading.
 */
function AdGroups({ rows, onOpen }: { rows: readonly LiveRowVM[]; onOpen: (route: string) => void }) {
  const looked = useAdsLooked();
  const [endedOpen, setEndedOpen] = useState(false);
  const groups = adGroupsOf(rows, looked);
  if (groups.length === 0)
    return (
      <p className="ads-hero-muted" data-testid="ads-live-none">
        {LIVE.noneFound}
      </p>
    );
  return (
    <div className="cnv-groups ads-groups" role="group" aria-label={LIVE.list} data-testid="ads-live-list">
      {groups.map((group) => (
        <section key={group.key} className="cnv-group" aria-label={group.label} data-testid={`ads-group-${group.key}`}>
          <GroupHead
            label={group.label}
            count={group.rows.length}
            needs={group.key === "needs"}
            fold={
              group.folds
                ? {
                    open: endedOpen,
                    onFold: () => setEndedOpen((open) => !open),
                    label: LIVE.endedFold(group.rows.length),
                    testid: "ads-ended-fold",
                  }
                : null
            }
          />
          {group.folds && !endedOpen ? null : group.rows.map((row) => <Row key={row.id} row={row} onOpen={onOpen} />)}
        </section>
      ))}
    </div>
  );
}

interface LiveBodyProps {
  vm: LiveVM;
  /** The ad account's card where it has something to say; null where the page's top says where the account stands. */
  card: ReactNode;
  /** The card says the one thing missing (a payment Meta can't take, a sign-out): on a phone it stands first. */
  cardFirst: boolean;
  /** AI stopped with ads still on (stop-notice.tsx), first on the page. */
  stop: ReactNode;
  onOpen: (route: string) => void;
  /** Pause an ad: AI's line for one on that AI can't answer is its Pause. */
  onPause: (id: string, version: number) => void;
}

/** The page under its head: the notice, the ads, the people no ad holds, and the card. */
export function LiveBody({ vm, card, cardFirst, stop, onOpen, onPause }: LiveBodyProps) {
  return (
    <div
      className="ads-hero ads-live"
      data-card-first={cardFirst || undefined}
      data-side={card ? "" : undefined}
      data-testid="ads-live"
    >
      <section className="ads-hero-main">
        {stop}
        {vm.notice ? <Notice notice={vm.notice} /> : null}
        {vm.stale ? (
          <p className="ads-hero-muted" data-testid="ads-live-stale">
            {vm.stale}
          </p>
        ) : null}
        <AdsLines ai={vm.ai} needsYou={vm.needsYou} onOpen={onOpen} onPause={onPause} />
        {vm.empty ? (
          <EmptyState
            kind="line"
            glyph="chat"
            title={vm.empty}
            // Where AI's line proposes the first ad, it is the way to New ad: the empty line says only what is true.
            action={
              vm.ai?.kind === "first"
                ? undefined
                : {
                    label: HEAD.newAd,
                    onClick: () => onOpen(newAdRoute()),
                    testid: "ads-live-empty-new",
                    gate: gate("approve", GATE.turnOn),
                  }
            }
            testid="ads-live-empty"
          />
        ) : null}
        {vm.rows.length > 0 ? <AdGroups rows={vm.rows} onOpen={onOpen} /> : null}
        {vm.notes.map((note) => (
          <p key={note} className="ads-hero-note" data-testid="ads-live-note">
            {note}
          </p>
        ))}
        {vm.again ? (
          <p className="ads-hero-muted" data-testid="ads-live-again">
            {vm.again}
          </p>
        ) : null}
      </section>
      {card ? <section className="ads-hero-side">{card}</section> : null}
    </div>
  );
}
