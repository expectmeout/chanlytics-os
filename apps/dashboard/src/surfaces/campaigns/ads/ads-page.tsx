/**
 * Campaigns › Ads: one real page, drawn where the workspace's settings read says Ads is here (shown.ts). With nothing
 * connected it says what is true today (the Ads plan's 4.1): how new people first reached the business over the last
 * 30 days, from People's own report (first-touch.ts), beside the ad account's card, with Connect as the coral button.
 * Once an account is or was connected, the page is the workspace's own ads, read from Meta (live/live-ads.tsx: 4.4,
 * 4.5, 4.8 and 4.9). New ad's one screen (new/sheet.tsx) and an ad's drawer open by the address, so Back closes them.
 */
// The page's own rules, loaded with it: the page is loaded on demand (campaigns/home/route.tsx), so no other page pays
// for them (as the Inbox's new-conversation sheet loads sheet.css). The drawer's rules hold the frame New ad reuses.
import "./ads.css";
import "./drawer/drawer.css";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { ADS_ROUTE, ADS_WORDS, ASK_ADS_VIEW, adRoute, newAdRoute, parseAds } from "@chanlytics/contracts";
import type { AdsAddress } from "@chanlytics/contracts";
import { workspaceOverride } from "@/bridge/surface-data";
import { HEAD } from "./model/words-page";
import { nothingConnectedOf } from "./model/page-v0";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import {
  askAbout,
  askOnScreenKey,
  backFrom,
  navigate,
  replaceRoute,
  setAskOnScreen,
  useFrameToast,
} from "../../frame-verbs";
import { CmHead } from "../parts/head";
import { type CmView, useCmPhone } from "../parts/split";
import { useAdsConnection } from "./connect/use-card";
import { CARD } from "./connect/words";
import { useFirstTouch } from "./first-touch";
import { V0Page } from "./hero";
import { LiveAds } from "./live/live-ads";
import { LIVE } from "./live/words";
import { V0 } from "./model/words-page";
import { LinkButton } from "../../kit/link-button/link-button";
import { NewAd } from "./new/sheet";
import { LIVE_AD_SOURCE } from "./new/source";

/**
 * Opening and closing what the address names: an ad's drawer or New ad. Opening pushes an entry, so Back closes it (a
 * peek's rule: Leads', the Pipeline's, Messages'). A sheet that opened over the page stood on has the page behind it,
 * whoever pushed it: closing goes back. One a link arrived at has no entry of the page's behind it: closing replaces
 * the address with the Ads page itself. New ad that Run as an ad opened from a piece in Content goes back to that piece,
 * by the frame's own Back (frame-verbs backFrom), where the owner left it.
 */
function useAdsNav(address: AdsAddress) {
  // How many entries stand over the page: the drawer, and New ad opened over it.
  const pushed = useRef(0);
  const open = address.ad !== null || address.compose !== null;
  const wasOpen = useRef(open);
  // Opened by Run as an ad: kept while New ad stays open, its address saying New ad alone once the draft is made.
  const fromPiece = useRef(false);
  if (address.compose?.from?.how === "piece") fromPiece.current = true;
  if (address.compose === null) fromPiece.current = false;
  useEffect(() => {
    if (!open) pushed.current = 0;
    else if (!wasOpen.current && pushed.current === 0) pushed.current = 1;
    wasOpen.current = open;
  }, [open]);
  const push = (route: string) => {
    pushed.current += 1;
    navigate(route);
  };
  const close = () => {
    if (pushed.current > 0 && typeof window !== "undefined" && window.history) {
      pushed.current -= 1;
      window.history.back();
    } else if (fromPiece.current) {
      fromPiece.current = false;
      backFrom(ADS_ROUTE, { replace: true });
    } else replaceRoute(ADS_ROUTE);
  };
  return { push, close };
}

/**
 * Ask is told what this page shows: what is true of the workspace. Taken back as the page goes, so an address of it
 * Sequences draws is asked about as Sequences.
 */
function useAskKnowsThePage() {
  useEffect(() => {
    setAskOnScreen({ key: "ads", ids: [], view: ASK_ADS_VIEW.today });
    return () => {
      if (askOnScreenKey() === "ads") setAskOnScreen(null);
    };
  }, []);
}

/** The zone a day is said in until the account says its own: the workspace's, else whoever is looking. */
const zoneHere = (): string =>
  workspaceOverride.current()?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

/** What the head's acts need: the coral button's word where the card gives one, and its press. */
interface HeadActsProps {
  phone: boolean;
  /** Connect, or Connect again: the card's own word for the coral button, where an owner may press it. */
  connect: string | null;
  onConnect: () => void;
}

/**
 * The head's acts with no account held: Ask (quiet) and Connect, the owner's press, straight to Meta's own window (the
 * Ads plan's D1 and D2). On a phone (and a tablet, which wears its head) the shell's ✦ is Ask's door.
 */
function HeadActs({ phone, connect, onConnect }: HeadActsProps) {
  return (
    <>
      {phone ? null : (
        <Button
          variant="quiet"
          size="sm"
          className="cmh-ask"
          onClick={() => askAbout({ about: { kind: "page", id: "campaigns/ads", label: ADS_WORDS.adsTab } })}
          data-testid="ads-ask-door"
        >
          <Icon name="sparkle" size={13} /> {HEAD.ask}
        </Button>
      )}
      {connect !== null ? (
        <Button variant="primary" size="sm" onClick={onConnect} data-testid="ads-head-connect">
          {connect}
        </Button>
      ) : null}
    </>
  );
}

/**
 * An account is held and its ads are on their way, or their read did not come: a line that says which, beside the
 * card. Never the page with nothing connected, whose counts would say nobody came from an ad.
 */
function HeldLoading({ failed, again, card }: { failed: boolean; again: () => void; card: ReactNode }) {
  return (
    <div className="ads-hero" data-testid="ads-held">
      <section className="ads-hero-main">
        {failed ? (
          <p className="ads-hero-muted" role="alert" data-testid="ads-held-failed">
            {LIVE.loadFailed}{" "}
            <LinkButton onClick={again} data-testid="ads-held-again">
              {V0.again}
            </LinkButton>
          </p>
        ) : (
          <p className="ads-hero-muted" data-testid="ads-held-loading">
            {LIVE.loading}
          </p>
        )}
      </section>
      <section className="ads-hero-side">
        {card}
        <p className="ads-conn-later">{CARD.later}</p>
      </section>
    </div>
  );
}

/**
 * Under the head while it is not known whether an account is held: nothing while the account's read is on its way (the
 * view opens on it, ./first-reads.ts), so the page is drawn once and as the one it is; where that read failed, that, and the way
 * to ask again. Never the page with nothing connected, which an account would then replace.
 */
function AccountUnread({ failed, again }: { failed: boolean; again: () => void }) {
  if (!failed) return null;
  return (
    <p className="ads-hero-muted" role="alert" data-testid="ads-account-failed">
      {LIVE.loadFailed}{" "}
      <LinkButton onClick={again} data-testid="ads-account-again">
        {V0.again}
      </LinkButton>
    </p>
  );
}

interface AdsPageProps {
  /** The address's param, `campaigns/<param>`: `ads`, an ad open, or New ad. */
  param: string;
  /** The deck's seat and the side it comes in from, as Campaigns' other kept views take theirs (home/route.tsx). */
  view?: CmView;
}

export function AdsPage({ param, view }: AdsPageProps) {
  const address = parseAds(param);
  const nav = useAdsNav(address);
  const [toastNode, flash] = useFrameToast();
  const phone = useCmPhone();
  const timezone = zoneHere();
  // The ad account, its card, and, with an account held, the workspace's own ads read from Meta (live/).
  const { account, held, live, ...connect } = useAdsConnection(true, timezone, CARD.name, "page");
  // Whether an account is held is known once the account's read is in (the view opens on it, ./first-reads.ts). Until then the
  // page draws its head and nothing under it: never the page with nothing connected, which an account would then replace.
  const known = account.dto !== null;
  // How new people first came is read where no account is held, the page with nothing connected saying it; never before
  // that is known, since it is the dearest read a workspace has and a connected page draws none of it.
  const touch = useFirstTouch(known && !held);
  useAskKnowsThePage();
  const connectWord = connect.vm?.button ?? null;
  if (held && live.dto)
    return (
      <LiveAds
        dto={live.dto}
        address={address}
        view={view}
        phone={phone}
        timezone={timezone}
        card={connect.card}
        connect={{ word: connectWord, press: account.connect }}
        need={connect.vm?.need ?? null}
        stop={connect.stop}
        nav={{ push: nav.push, close: nav.close }}
        again={() => {
          live.again();
          account.again();
        }}
        flash={flash}
        toast={toastNode}
      />
    );
  const vm = nothingConnectedOf(touch.firstTouch);
  const sentence = (
    <>
      <b>{vm.head.strong}</b>
      {vm.head.rest}
    </>
  );
  return (
    <div
      ref={view?.ref}
      className="cmh ads"
      data-slide={view?.slide}
      data-testid="campaigns-ads"
      data-phone={phone ? "true" : undefined}
      data-ad={address.ad ?? undefined}
    >
      <CmHead
        title="Campaigns"
        quiet
        allowance={false}
        testid="ads-head"
        sub={known && !held ? sentence : null}
        right={<HeadActs phone={phone} connect={connectWord} onConnect={account.connect} />}
      />
      {!known ? (
        <AccountUnread failed={account.failed} again={account.again} />
      ) : held ? (
        <HeldLoading failed={live.failed} again={live.again} card={connect.card} />
      ) : (
        <>
          {phone ? (
            <p className="ads-lead" data-testid="ads-lead">
              {sentence}
            </p>
          ) : null}
          <div className="ads-window" data-testid="ads-window">
            <p className="ads-window-said">
              <span data-testid="ads-window-said">{vm.pane}</span>
            </p>
          </div>
          <V0Page v0={vm.v0} touch={touch} card={connect.card} />
        </>
      )}
      {/* New ad on an address with no account held says the one thing missing: an ad account, and Connect. With one
          held, New ad is the live page's (live/live-ads.tsx), drawn once its ads are read: one sheet, so a cold open
          asks for the draft, and AI for its words, once (21 Nov 2026: two sheets one after the other asked twice). */}
      <NewAd
        open={address.compose !== null && account.dto !== null && !held}
        source={LIVE_AD_SOURCE}
        need={connect.vm?.need ?? null}
        onClose={nav.close}
        onConnect={account.connect}
        onGo={navigate}
        onSee={(adId) => navigate(adRoute(adId))}
        start={address.compose?.from ?? null}
        onDrafted={() => replaceRoute(newAdRoute())}
      />
      {toastNode}
    </div>
  );
}
