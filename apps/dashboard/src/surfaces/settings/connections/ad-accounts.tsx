/**
 * Settings › Connections, "Ad accounts" (MOCKUP, drawn in a demo session only; decisions 7, 8 and 9 of 11 Oct 2026): a row for
 * Facebook and Instagram, Google and TikTok, drawn as the pane's other rows are (a face with no brand colour, the kit's state
 * pill, the acts in the group's column and, on a phone, behind the row), with what the account is, what is ready on it, and
 * the presses: Connect (which connects nothing here and says so), Change account, Disconnect, and the owner's setting that
 * pauses ads when the way in closes.
 *
 * The accounts are the Ads page's fixtures (useAdsStore: the example chosen there is the one drawn here, `running` at first),
 * and a press changes a copy held by this card (ad-accounts-mock.ts), never the fixtures and never anything outside the tab.
 * Disconnect while an ad runs is refused, with a door to Ads (decision 8); with none running it asks first. The words are
 * contracts' (words-connect.ts) and so is the fold that makes the rows (connectModel). Every press is the owner's (the pane's
 * owner gate, `team`): anyone else sees the rows and is told what the press would have done.
 */
import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import { ADS_ROUTE } from "@chanlytics/contracts";
import type { AdAccountRead, AdPlatform } from "@chanlytics/contracts";
import { CONNECT, connectModel } from "@chanlytics/contracts/ads-page";
import type { ConnectRowVM } from "@chanlytics/contracts/ads-page";
import { useAdsStore } from "../../campaigns/ads/store";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Face } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { MoreMenu } from "../../kit/more-menu/more-menu";
import { StatePill } from "../../kit/pill/state-pill";
import { RecordDisclosure } from "../../kit/record/disclosure";
import { RecordSwitch, RecordToggleGroup } from "../../kit/record/field";
import { gate, routeDoor, type LegacyFlash } from "../../legacy-verbs";
import { disconnected, usingAccount, withChoices } from "./ad-accounts-mock";

/** What a row is asked or told under it: Disconnect's question, its refusal, or the accounts to change to. */
type Ask = { platform: AdPlatform; what: "disconnect" | "refused" | "change" } | null;

/** What the card's rows can do, over the card's own state. */
interface Acts {
  connect: (r: ConnectRowVM) => void;
  disconnect: (r: ConnectRowVM) => void;
  confirm: (r: ConnectRowVM) => void;
  change: (r: ConnectRowVM) => void;
  use: (r: ConnectRowVM) => void;
  pick: (r: ConnectRowVM, value: string) => void;
  dismiss: () => void;
}

/** A row's acts in the pane's three shapes: a thumb's menu, the one Connect button, or nothing (a question is open). */
function offersOf(r: ConnectRowVM, asking: boolean): "menu" | "primary" | "none" {
  if (asking || r.status === "choose") return "none";
  return r.status === "connected" ? "menu" : "primary";
}

/** A row's acts in the group's column, on a desk. */
function actsOf(r: ConnectRowVM, acts: Acts): ReactNode {
  if (r.status === "connected") {
    return (
      <>
        {r.choices.length > 1 && (
          <Button
            size="sm"
            onClick={() => acts.change(r)}
            data-testid={`ad-change-${r.id}`}
            {...gate("team", CONNECT.gate.change)}
          >
            {CONNECT.change}
          </Button>
        )}
        <LinkButton
          tone="danger"
          onClick={() => acts.disconnect(r)}
          data-testid={`ad-disconnect-${r.id}`}
          {...gate("team", CONNECT.gate.disconnect)}
        >
          {CONNECT.disconnect}
        </LinkButton>
      </>
    );
  }
  if (r.status === "choose") return null;
  return (
    <Button
      size="sm"
      onClick={() => acts.connect(r)}
      data-testid={`ad-connect-${r.id}`}
      {...gate("team", CONNECT.gate.connect)}
    >
      {CONNECT.connect}
    </Button>
  );
}

/** The same acts behind a phone's ⋯. */
function menuOf(r: ConnectRowVM, acts: Acts) {
  const items = [
    ...(r.choices.length > 1
      ? [{ label: CONNECT.change, onClick: () => acts.change(r), gate: gate("team", CONNECT.gate.change) }]
      : []),
    {
      label: CONNECT.disconnect,
      danger: true,
      onClick: () => acts.disconnect(r),
      gate: gate("team", CONNECT.gate.disconnect),
    },
  ];
  return <MoreMenu items={items} title={`${r.title}: more`} escape testid={`ad-account-${r.id}-more`} />;
}

/** The dot rows of what an account stands on, in the words Ads' standing uses; an amber one says the step that mends it. */
function readyFold(r: ConnectRowVM) {
  return (
    <RecordDisclosure
      id={`ad-ready-${r.id}`}
      label={CONNECT.ready}
      mark={r.readyMark}
      forceOpen={r.ready.some((x) => x.tone === "warn")}
      testid={`ad-ready-${r.id}`}
    >
      <ul className="ads-dots set-ads-ready">
        {r.ready.map((x) => (
          <li key={x.id} className="ads-dotline" data-tone={x.tone}>
            <span className="ads-dot" data-state={x.tone} aria-hidden="true" />
            <span className="ads-dotline-text">{x.text}</span>
            {x.fix ? <span className="set-ads-fix">{x.fix}</span> : null}
          </li>
        ))}
      </ul>
    </RecordDisclosure>
  );
}

/** Disconnect's refusal while an ad runs: what to do first, and the door to the ads. */
function refusal(r: ConnectRowVM, acts: Acts) {
  return (
    <p className="set-ads-refused" role="status" data-testid={`ad-refused-${r.id}`}>
      <span>{CONNECT.refused(r.running)}</span>
      <LinkButton {...routeDoor(ADS_ROUTE)} data-testid={`ad-refused-door-${r.id}`}>
        {CONNECT.refusedDoor} <Icon name="chevron" size={11} />
      </LinkButton>
      <LinkButton onClick={acts.dismiss}>{CONNECT.refusedOk}</LinkButton>
    </p>
  );
}

/** The accounts there are to choose from, as a radio group of cards with their currency, and the press that uses one. */
function choosing(r: ConnectRowVM, picked: string | undefined, acts: Acts, changing: boolean) {
  const label = `ad-which-${r.id}`;
  return (
    <div className="set-ads-choose" data-testid={`ad-choose-${r.id}`}>
      <span className="set-row-label" id={label}>
        {CONNECT.which(r.id)}
      </span>
      <RecordToggleGroup
        id={`ad-pick-${r.id}`}
        labelledBy={label}
        value={picked ?? null}
        options={r.choices}
        onChange={(value) => acts.pick(r, value)}
        gate={gate("team", CONNECT.gate.change)}
      />
      <div className="set-acts">
        <Button
          size="sm"
          variant="primary"
          disabled={!picked}
          onClick={() => acts.use(r)}
          data-testid={`ad-use-${r.id}`}
          {...gate("team", CONNECT.gate.change)}
        >
          {CONNECT.use}
        </Button>
        {changing && <LinkButton onClick={acts.dismiss}>{CONNECT.cancel}</LinkButton>}
      </div>
    </div>
  );
}

/** What stands under a row: what connecting does, or the account's own facts, what is ready, and anything it was asked. */
function accountStackOf(r: ConnectRowVM, ask: Ask, picked: string | undefined, acts: Acts) {
  const mine = ask && ask.platform === r.id ? ask.what : null;
  const facts = [r.facts, r.read].filter(Boolean).join(" · ");
  const open = r.status === "choose" || mine === "change";
  const parts = [
    r.line ? (
      <p key="line" className="set-ads-facts">
        {r.line}
      </p>
    ) : null,
    facts ? (
      <p key="facts" className="set-ads-facts" data-testid={`ad-facts-${r.id}`}>
        {facts}
      </p>
    ) : null,
    r.ready.length > 0 ? <Fragment key="ready">{readyFold(r)}</Fragment> : null,
    r.adopted ? (
      <p key="adopted" className="set-ads-facts" data-testid={`ad-adopted-${r.id}`}>
        {r.adopted}
      </p>
    ) : null,
    mine === "refused" ? <Fragment key="refused">{refusal(r, acts)}</Fragment> : null,
    open ? <Fragment key="choose">{choosing(r, picked, acts, mine === "change")}</Fragment> : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <div className="set-row set-row-stack set-ads-stack" data-testid={`ad-account-${r.id}-under`}>
      {parts}
    </div>
  );
}

/** One platform: its face, its name beside the account, its state and its acts, then what stands under it. */
function platformRow(r: ConnectRowVM, ask: Ask, picked: string | undefined, acts: Acts) {
  const asking = ask !== null && ask.platform === r.id && ask.what === "disconnect";
  const offers = offersOf(r, asking);
  const connected = r.status === "connected";
  return (
    <Fragment key={r.id}>
      <div
        className="set-int-row"
        data-testid={`ad-account-${r.id}`}
        data-state={connected ? "connected" : "none"}
        data-offers={offers}
        data-asking={asking ? "true" : undefined}
      >
        <Face
          className="set-int-tile"
          data-on={connected ? "true" : undefined}
          glyph={<Icon name={r.icon} size={15} />}
        />
        <span className="set-team-body">
          <span className="set-int-head">
            <span className="set-team-name">
              {r.title}
              {r.detail ? (
                <span className="dim set-int-detail">
                  <span className="set-int-sep"> · </span>
                  {r.detail}
                </span>
              ) : null}
            </span>
          </span>
        </span>
        <StatePill kind="tone" value={r.tone} label={r.stateWords} testid={`ad-state-${r.id}`} />
        <span className="set-int-actions">{asking ? null : actsOf(r, acts)}</span>
        {offers === "menu" && <span className="set-int-more">{menuOf(r, acts)}</span>}
        {asking && (
          <Confirm
            className="set-row-ask"
            question={CONNECT.disconnectQ(r.id)}
            detail={CONNECT.disconnectDetail}
            yes={CONNECT.disconnectYes}
            no={CONNECT.disconnectNo}
            danger
            onYes={() => acts.confirm(r)}
            onNo={acts.dismiss}
            testid={`ad-disconnect-${r.id}`}
          />
        )}
      </div>
      {accountStackOf(r, ask, picked, acts)}
    </Fragment>
  );
}

/** The owner's setting, off unless chosen: pause the ads when the way in closes, instead of only telling them. */
function pauseRow(on: boolean, set: (on: boolean) => void) {
  return (
    <div className="set-row" data-testid="ad-pause">
      <div className="set-row-info">
        <span className="set-row-label" id="ad-pause-label">
          {CONNECT.pause.label}
        </span>
        <span className="set-row-hint" id="ad-pause-hint">
          {CONNECT.pause.line}
        </span>
      </div>
      <div className="set-row-control">
        <RecordSwitch
          labelledBy="ad-pause-label"
          describedBy="ad-pause-hint"
          on={on}
          onChange={set}
          gate={gate("team", CONNECT.gate.pause)}
          testid="ad-pause-switch"
        />
      </div>
    </div>
  );
}

export function AdAccounts({ flash }: { flash: (f: LegacyFlash) => void }) {
  const { read } = useAdsStore();
  const [mine, setMine] = useState<Partial<Record<AdPlatform, AdAccountRead>>>({});
  const [ask, setAsk] = useState<Ask>(null);
  const [picks, setPicks] = useState<Partial<Record<AdPlatform, string>>>({});
  const [pauses, setPauses] = useState(false);
  const accounts = read.accounts.map((a) => withChoices(mine[a.platform] ?? a));
  const rows = connectModel({ accounts, ads: read.ads, today: read.today });
  const put = (platform: AdPlatform, account: AdAccountRead) => setMine((m) => ({ ...m, [platform]: account }));
  const acts: Acts = {
    connect: (r) => flash({ msg: CONNECT.signIn(r.id) }),
    disconnect: (r) => setAsk({ platform: r.id, what: r.running > 0 ? "refused" : "disconnect" }),
    confirm: (r) => {
      put(r.id, disconnected(r.id));
      setAsk(null);
      flash({ msg: CONNECT.disconnected(r.id) });
    },
    change: (r) => {
      setPicks((p) => ({ ...p, [r.id]: r.chosen ?? undefined }));
      setAsk({ platform: r.id, what: "change" });
    },
    use: (r) => {
      const account = accounts.find((a) => a.platform === r.id);
      const to = picks[r.id];
      if (!account || !to) return;
      const next = usingAccount(account, to, read.readAt);
      put(r.id, next);
      setAsk(null);
      flash({ msg: CONNECT.using(r.id, next.name ?? "") });
    },
    pick: (r, value) => setPicks((p) => ({ ...p, [r.id]: value })),
    dismiss: () => setAsk(null),
  };
  const setPause = (on: boolean) => {
    setPauses(on);
    flash({ msg: on ? CONNECT.pause.on : CONNECT.pause.off });
  };
  return (
    <section
      className="rec-card set-card set-conn set-ads"
      data-testid="connections-ads"
      aria-labelledby="connections-ads-title"
    >
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="connections-ads-title">
          {CONNECT.title}
        </h2>
        <span className="rec-card-sub">{CONNECT.sub}</span>
      </div>
      {rows.map((r) => platformRow(r, ask, picks[r.id], acts))}
      {pauseRow(pauses, setPause)}
    </section>
  );
}
