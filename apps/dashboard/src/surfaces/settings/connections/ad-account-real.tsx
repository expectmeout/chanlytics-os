/**
 * Settings › Connections, a workspace's own ad account: a row like every other connection's, read and pressed through
 * the same hook the Ads page's card is (the Ads plan's 4.10; decision 0049, call 1: an ad account's home is Connections).
 * The row is its name, its state and one press: Connect before an account is held, and once one is, the row itself,
 * which opens the card's own sheet (the checks, changing the account, Disconnect). What waits on the owner (the one thing
 * missing, the one question, AI stopped with ads still on) and the checks while they run stand under the row, as a
 * row's live notes do. Ruben, 21 Nov 2026: the card stood in the list as a box of its own, its facts always open.
 *
 * It stands among the page's groups by its account: in Connected, under the Meta row, once an account is connected or
 * Meta signed Chanlytics out of it; in Available before, and while the owner has two to choose from. Under the Meta row
 * it is that row's child, its name where Meta's name starts. Its name says it is the ads, so it is never read as the
 * Meta row beside it. The pane draws the place it goes in (pane.tsx), the row is drawn into that place, and it tells the
 * pane where it stands, so the group's count holds it.
 */
import { useEffect, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAdsConnection } from "../../campaigns/ads/connect/use-card";
import { CardChecks, CardNeed, CardQuestion, type AdCardActs } from "../../campaigns/ads/connect/card";
import type { ConnectCardVM } from "../../campaigns/ads/connect/card-model";
import { CARD } from "../../campaigns/ads/connect/words";
import { StopNotice, type StopHere } from "../../campaigns/ads/live/stop-notice";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import type { ConnectionState, ConnectionTone } from "./model/setup";

/**
 * What the pane hands the row, all of it what the page loads at once: the rows' press (row.tsx connRowPress), the face,
 * and the state's pill. Imported here, the face and the pill made this lazy chunk share kit modules with the page, and
 * Turbopack moved route modules into Settings' first load: +12.7 KB gzipped on #2505's first build, and 203.5 KB again,
 * under main's, without them (measured locally, 21 Nov 2026).
 */
export interface AdsRowKit {
  press: (event: MouseEvent<HTMLDivElement>) => void;
  face: (on: boolean) => ReactNode;
  pill: (tone: ConnectionTone, label: string) => ReactNode;
}

/** Where the card stands among the page's groups, and what it counts as in its group's head. */
export interface AdsPlace {
  group: "connected" | "available";
  state: ConnectionState;
}

/**
 * Where the card stands, by its account's status and the card it draws: null until the account is read. A connected
 * account with something that stops its ads, ads still on while AI is stopped, or an account Meta signed Chanlytics
 * out of, needs attention, as a row would.
 */
export function adsPlaceOf(status: string | null, vm: ConnectCardVM | null, stopped = false): AdsPlace | null {
  if (vm === null) return null;
  if (status === "revoked") return { group: "connected", state: "attention" };
  if (status === "connected")
    return { group: "connected", state: vm.need?.tone === "warn" || stopped ? "attention" : "connected" };
  if (vm.state === "question") return { group: "available", state: "waiting_you" };
  return { group: "available", state: vm.state === "checking" ? "waiting_them" : "none" };
}

/** The row's state as every row says it: On while it works; otherwise the card's own word, in the tone of its state. */
const PILL: Record<ConnectionState, ConnectionTone> = {
  connected: "ok",
  attention: "warn",
  off: "plain",
  waiting_you: "info",
  waiting_them: "info",
  none: "plain",
  later: "plain",
};
const pillWordsOf = (vm: ConnectCardVM, state: ConnectionState): string =>
  state === "connected" ? "On" : state === "attention" && vm.state === "connected" ? "Needs attention" : vm.word;

/** What stands under the row: the one thing missing, the one question, AI stopped with ads on, the checks running. */
function AdsBelow({ vm, acts, stop }: { vm: ConnectCardVM; acts: AdCardActs; stop: StopHere | null }) {
  const stale = vm.stale ? <p className="ads-conn-says">{vm.stale}</p> : null;
  if (!vm.need && !vm.question && !stop && vm.state !== "checking" && !stale) return null;
  return (
    <div className="set-int-open conn-ads-below" data-testid="conn-ads-below">
      {vm.state === "checking" ? <CardChecks checks={vm.checks} /> : null}
      {stale}
      {stop ? <StopNotice stop={stop} className="ads-conn-need" /> : null}
      {vm.need ? <CardNeed need={vm.need} onConnect={acts.connect} /> : null}
      {vm.question ? <CardQuestion question={vm.question} onChoose={acts.choose} /> : null}
    </div>
  );
}

/** The ad account as a connection's row: its face (or, under Meta's row, its place), name, state and one press. */
function AdsRow(props: {
  vm: ConnectCardVM;
  acts: AdCardActs;
  stop: StopHere | null;
  place: AdsPlace;
  child: boolean;
  kit: AdsRowKit;
}) {
  const { vm, acts, stop, place, child, kit } = props;
  const joins = vm.state === "none" || vm.state === "left";
  const opens = vm.state === "connected" || vm.state === "signed-out";
  // Before an account is held, what it costs and who may connect it is said on the row, never behind a press.
  const before = joins ? vm.says.filter((line) => line.strong).map((line) => line.text) : [];
  return (
    // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-static-element-interactions -- a pointer's press on the whole row, as a connection's row is (row.tsx connRowPress); a keyboard reaches the row's own Settings or Fix button
    <div
      className="set-int-row"
      data-testid="conn-ads-real"
      data-state={place.state}
      data-child={child ? "true" : undefined}
      data-offers={joins && vm.button ? "primary" : opens ? "one" : "none"}
      onClick={opens ? kit.press : undefined}
    >
      {child ? <span aria-hidden="true" /> : kit.face(place.group === "connected")}
      <span className="set-team-body">
        <span className="set-int-head">
          <span className="set-team-name">{CARD.inConnections}</span>
        </span>
        {before.length ? <span className="set-int-notes">{before.join(" ")}</span> : null}
      </span>
      {kit.pill(PILL[place.state], pillWordsOf(vm, place.state))}
      <span className="set-int-actions">
        {joins && vm.button ? (
          <Button size="sm" variant="secondary" onClick={acts.connect} data-testid="conn-ads-connect">
            {vm.button}
          </Button>
        ) : null}
        {opens ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={acts.open}
            aria-label={`${CARD.inConnections} settings`}
            data-testid="conn-ads-settings"
          >
            Settings
          </Button>
        ) : null}
      </span>
      {opens ? (
        <span className="set-int-chev" aria-hidden="true">
          <Icon name="chevron" size={11} />
        </span>
      ) : null}
      <AdsBelow vm={vm} acts={acts} stop={stop} />
    </div>
  );
}

export function RealAdAccount({
  slot,
  child,
  kit,
  onPlace,
}: {
  /** The place for the row in its group; null until the pane has drawn it. */
  slot: HTMLElement | null;
  /** The row stands under the Meta row, as its child. */
  child: boolean;
  /** The rows' press, face and pill, the pane's (AdsRowKit). */
  kit: AdsRowKit;
  onPlace: (place: AdsPlace | null) => void;
}) {
  // Until the account says its own zone, a day is said in the zone of whoever is looking.
  const connection = useAdsConnection(
    true,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    CARD.inConnections,
    "card",
  );
  const place = adsPlaceOf(connection.account.dto?.meta?.status ?? null, connection.vm, connection.stop !== null);
  const group = place?.group ?? null;
  const state = place?.state ?? null;
  // Told only when it moves: the pane draws the place in that group, and counts the row there.
  useEffect(() => {
    onPlace(group && state ? { group, state } : null);
  }, [group, state, onPlace]);
  const { vm, parts } = connection;
  if (slot === null || vm === null || parts === null || place === null) return null;
  return createPortal(
    <>
      <AdsRow vm={vm} acts={parts.acts} stop={connection.stop} place={place} child={child} kit={kit} />
      {parts.sheets}
    </>,
    slot,
  );
}
