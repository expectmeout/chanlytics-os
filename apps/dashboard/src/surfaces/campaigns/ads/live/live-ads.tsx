/**
 * Campaigns › Ads with an account connected, signed out or let go: the whole page, real (the Ads plan's 4.4, 4.5, 4.8
 * and 4.9). The head says the page's one sentence beside Ask; the coral button is Connect again or Connect where the
 * card gives one, and absent while connected (New ad arrives with the step that makes an ad). Under it who is charged
 * or what was spent, then the page's body (live-page.tsx), and an ad's drawer, open by the address, so Back closes it.
 */
import { ADS_WORDS } from "@chanlytics/contracts";
import type { AdsAddress, AdsLiveDto } from "@chanlytics/contracts";
import type { ReactNode } from "react";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { askAbout } from "../../../frame-verbs";
import type { FrameFlash } from "../../../frame-verbs";
import { CmHead } from "../../parts/head";
import type { CmView } from "../../parts/split";
import { HEAD } from "../model/words-page";
import { AdSheet } from "./ad-sheet";
import { LiveBody } from "./live-page";
import { liveModel, sheetModel } from "./model";
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
  nav: { push: (route: string) => void; close: () => void };
  again: () => void;
  flash: (flash: FrameFlash) => void;
  toast: ReactNode;
}

export function LiveAds(p: LiveAdsProps) {
  const { dto, address, phone } = p;
  const said = { timezone: dto.account.timezone ?? p.timezone };
  const vm = liveModel(dto, said);
  const sheet = sheetModel(dto, address.ad, said);
  const acts = useAdPresses({ ads: dto.ads, again: p.again, flash: p.flash });
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
          </>
        }
      />
      {phone ? (
        <p className="ads-lead" data-testid="ads-lead">
          {sentence}
        </p>
      ) : null}
      <p className="ads-money" data-testid="ads-money">
        {vm.line}
      </p>
      <LiveBody vm={vm} card={p.card} onOpen={p.nav.push} />
      <AdSheet vm={sheet} timezone={said.timezone} acts={acts} onClose={p.nav.close} onGo={p.nav.push} />
      {p.toast}
    </div>
  );
}
