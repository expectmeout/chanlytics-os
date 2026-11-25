/**
 * Campaigns › Ads once an account is or was connected: real ads, read from the owner's own Meta account (the Ads
 * plan's 4.4, as the canvas draws it on a phone and on a desk). At the left the notice where AI is stopped with ads
 * still on, or where Chanlytics is signed out or an ad was left running, then AI's one line and who from an ad needs
 * you, then "Your ads": each ad with where it stands and what it brought; under them the quiet
 * lines (what an ad made in Meta can do here, whose people are not counted, the people from an ad Chanlytics cannot
 * name). At the right, or at the foot on a phone, the ad account's card and the line for the platforms that come
 * later. An ad opens in its drawer (ad-sheet.tsx). Every sentence is the model's (model.ts).
 */
import "./live.css";
import type { ReactNode } from "react";
import { newAdRoute } from "@chanlytics/contracts";
import { EmptyState } from "../../../kit/empty/empty";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { ListRow } from "../../../kit/list-row/list-row";
import { Panel } from "../../../kit/panel/panel";
import { cx } from "../../../kit/variants";
import { gate, routeDoor } from "../../../frame-verbs";
import { cmRowPress } from "../../parts/head";
import { CARD } from "../connect/words";
import { GATE } from "../model/words";
import { HEAD } from "../model/words-page";
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

function Row({ row, onOpen }: { row: LiveRowVM; onOpen: (route: string) => void }) {
  return (
    <div className="cmh-phone-row ads-live-row" data-opens="true" data-row-id={row.id} data-testid="ads-live-row">
      <ListRow
        bare
        name={
          <LinkButton
            {...routeDoor(row.open, onOpen)}
            size="inherit"
            className="cmh-row-name"
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
          <span className="ads-phone-state" data-tone={row.tone}>
            <span className="ads-dot" data-state={row.tone} aria-hidden="true" />
            {row.line}
          </span>
        }
        className="cmh-phone-line"
        role="presentation"
        onClick={cmRowPress}
      />
    </div>
  );
}

interface LiveBodyProps {
  vm: LiveVM;
  /** The ad account's card, as the page draws it everywhere. */
  card: ReactNode;
  /** AI stopped with ads still on (stop-notice.tsx), first on the page. */
  stop: ReactNode;
  onOpen: (route: string) => void;
  /** Pause an ad: AI's line for one on that AI can't answer is its Pause. */
  onPause: (id: string, version: number) => void;
}

/** The page under its head: the notice, the ads, the quiet lines, and the card. */
export function LiveBody({ vm, card, stop, onOpen, onPause }: LiveBodyProps) {
  return (
    <div className="ads-hero ads-live" data-testid="ads-live">
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
        {vm.rows.length > 0 ? (
          <>
            <p className="ads-live-list-head" data-testid="ads-live-list-head">
              <b>{LIVE.list}</b> <span className="tabular">{vm.rows.length}</span>
            </p>
            <Panel
              as="section"
              size="flush"
              className="cmh-block ads-phone-list"
              aria-label={LIVE.list}
              data-testid="ads-live-list"
            >
              {vm.rows.map((row) => (
                <Row key={row.id} row={row} onOpen={onOpen} />
              ))}
            </Panel>
          </>
        ) : null}
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
      <section className="ads-hero-side">
        {card}
        <p className="ads-conn-later" data-testid="ads-later">
          {CARD.later}
        </p>
      </section>
    </div>
  );
}
