/**
 * Campaigns › Ads with an account connected, signed out or let go: the whole page, real (the Ads plan's 4.4, 4.5, 4.8
 * and 4.9). The head says the page's one sentence beside Ask; the coral button is never hidden (the plan's D1):
 * Connect again or Connect where the card gives one, and + New once an account is connected. Under it who is charged
 * or what was spent, then the page's body (live-page.tsx), an ad's drawer and New ad's one screen (new/sheet.tsx),
 * each open by the address, so Back closes it. While AI is stopped with ads still on, the page says so at its top, with
 * the owner's press that pauses them all (stop-notice.tsx; the Ads plan's G17).
 */
import { ADS_WORDS, adRoute, newAdRoute } from "@chanlytics/contracts";
import type { AdsAddress, AdsLiveDto } from "@chanlytics/contracts";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { ActWords } from "../../../kit/head/act-words";
import { askAbout, gate, navigate, replaceRoute } from "../../../frame-verbs";
import type { FrameFlash } from "../../../frame-verbs";
import { CmHead } from "../../parts/head";
import type { CmView } from "../../parts/split";
import type { NeedVM } from "../connect/card-model";
import { rememberAdNames } from "../crumb-names";
import { GATE } from "../model/words";
import { HEAD } from "../model/words-page";
import { NewAd } from "../new/sheet";
import { LIVE_AD_SOURCE } from "../new/source";
import { AdSheet } from "./ad-sheet";
import { LiveBody } from "./live-page";
import { liveModel, sheetModel } from "./model";
import { StopNotice } from "./stop-notice";
import type { StopHere } from "./stop-notice";
import { useAdChanges } from "./use-change";
import { useAdPresses } from "./use-press";

interface LiveAdsProps {
  dto: AdsLiveDto;
  address: AdsAddress;
  view: CmView | undefined;
  phone: boolean;
  /** The workspace's zone, where the account names none. */
  timezone: string;
  /** The ad account's card, and its word for the coral button where an owner may press it. */
  card: ReactNode;
  connect: { word: string | null; press: () => void };
  /** The ad account's own need, as its card says it: New ad says the same line for a card check not met. */
  need: NeedVM | null;
  /** AI stopped with ads still on, and the press that pauses them all; null otherwise. */
  stop: StopHere | null;
  nav: { push: (route: string) => void; close: () => void };
  again: () => void;
  flash: (flash: FrameFlash) => void;
  toast: ReactNode;
}

export function LiveAds(p: LiveAdsProps) {
  const { dto, address, phone } = p;
  const said = { timezone: dto.account.timezone ?? p.timezone, nowMs: Date.now() };
  const vm = liveModel(dto, said);
  const sheet = sheetModel(dto, address.ad, said);
  const presses = useAdPresses({ ads: dto.ads, again: p.again, flash: p.flash });
  const changes = useAdChanges({
    ads: dto.ads,
    currency: dto.account.currency,
    again: p.again,
    flash: p.flash,
    onGo: p.nav.push,
  });
  // The frame's crumb names an ad open in its drawer by the name the page last read (campaigns/routes.ts).
  useEffect(() => rememberAdNames(dto.ads), [dto.ads]);
  const sentence = (
    <>
      {vm.head.strong ? <b>{vm.head.strong}</b> : null}
      {vm.head.rest}
    </>
  );
  return (
    <div
      ref={p.view?.ref}
      className="cmh ads"
      data-slide={p.view?.slide}
      data-testid="campaigns-ads"
      data-phone={phone ? "true" : undefined}
      data-live={dto.account.status}
      data-ad={address.ad ?? undefined}
    >
      <CmHead
        title="Campaigns"
        quiet
        allowance={false}
        testid="ads-head"
        sub={sentence}
        right={
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
            {p.connect.word !== null ? (
              <Button variant="primary" size="sm" onClick={p.connect.press} data-testid="ads-head-connect">
                {p.connect.word}
              </Button>
            ) : null}
            {p.connect.word === null && dto.account.status === "connected" ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => p.nav.push(newAdRoute())}
                data-testid="ads-head-new"
                {...gate("approve", GATE.turnOn)}
              >
                <ActWords icon={<Icon name="plus" size={14} />} words={HEAD.newAd} />
              </Button>
            ) : null}
          </>
        }
      />
      {/* With no ad in the account the page says so once, where the ads would be (live-page.tsx). */}
      {phone && vm.empty === null ? (
        <p className="ads-lead" data-testid="ads-lead">
          {sentence}
        </p>
      ) : null}
      <p className="ads-money" data-testid="ads-money">
        {vm.line}
      </p>
      <LiveBody
        vm={vm}
        card={p.card}
        stop={p.stop ? <StopNotice stop={p.stop} className="ads-conn-need ads-live-notice" /> : null}
        onOpen={p.nav.push}
        onPause={presses.pause}
      />
      <AdSheet
        vm={sheet}
        timezone={said.timezone}
        acts={{ ...presses, ...changes }}
        onClose={p.nav.close}
        onGo={p.nav.push}
      />
      <NewAd
        open={address.compose !== null}
        source={LIVE_AD_SOURCE}
        need={p.need}
        onClose={p.nav.close}
        onConnect={p.connect.press}
        onGo={navigate}
        onSee={(adId) => {
          p.again();
          p.nav.push(adRoute(adId));
        }}
        start={address.compose?.from ?? null}
        onDrafted={() => replaceRoute(newAdRoute())}
      />
      {p.toast}
    </div>
  );
}
