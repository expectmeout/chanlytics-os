/**
 * Settings › Cold email (decisions 0113, 0115): what Chanlytics says when it writes to businesses for you. A part of the
 * business's record (business/tab.tsx BusinessPart "outreach"), so its rows are folds of the one record saved through the
 * tab's one saver, and what it shows beyond the config is the pane's own read. In the order an owner cares: where it
 * stands, an email, what wrote it, how it goes out, and last what cannot be changed. Where the pane is wide enough the
 * email stays in view beside the rows, so a change is seen as it is made; on a phone it follows the status.
 */
import { REACH_OUT_SETTINGS_WORDS, reachOutOfferOf } from "@chanlytics/contracts";
import type { FrameFlash } from "../../frame-verbs";
import { LinkButton } from "../../kit/link-button/link-button";
import { recFolds } from "../../kit/record/registry";
import type { BtSaver } from "../business/gestures/common";
import type { Brain, Config } from "../business/save";
import { useReachOutRead } from "./card";
import { ConnectSheets } from "./connect";
import { EndingCard } from "./ending";
import { FactsCard } from "./facts";
import { KeptCard } from "./kept";
import { NeverCard } from "./never";
import { PitchCard } from "./pitch";
import { RepliesCard } from "./replies";
import { SampleCard } from "./sample";
import { SendingCard } from "./sending";
import { SoundCard } from "./sound";
import { StandingCard } from "./standing";

export function OutreachCards({
  brain,
  config,
  canEdit,
  flash,
  saver,
}: {
  brain: Brain;
  config: Config;
  canEdit: boolean;
  flash: (flash: FrameFlash) => void;
  saver: BtSaver;
}) {
  const { read, again } = useReachOutRead();
  const shared = { brain, config, canEdit, flash, saver, read };
  // Its own one line, on this page alone, where a cold email would have nothing to say of what the business sells:
  // nothing here, nothing it or its website says it does, no goal (contracts reachOutOfferOf). Never in the
  // receptionist's gap line or the rail, where a business that writes no cold email would be asked for it on every page.
  const offerless = read !== null && reachOutOfferOf(config, read.about) === null;
  return (
    <div className="ro-page">
      <div className="ro-grid">
        <div className="ro-top">
          <p className="ro-sub" data-testid="rec-outreach-sub">
            {REACH_OUT_SETTINGS_WORDS.sub}
          </p>
          <StandingCard standing={read?.standing ?? null} canEdit={canEdit} />
          {offerless ? (
            <p className="bt-gap" data-testid="rec-offer-gap">
              <span className="bt-gap-dot" aria-hidden="true" />
              {canEdit ? (
                // How it answers' gap line's door (business/tab.tsx): its ink, its underline, a line's height on a phone.
                <LinkButton
                  className="bt-gap-door"
                  onClick={() => recFolds.request("offer")}
                  data-testid="rec-offer-gap-door"
                >
                  {REACH_OUT_SETTINGS_WORDS.gap}
                </LinkButton>
              ) : (
                <span className="bt-gap-words">{REACH_OUT_SETTINGS_WORDS.gap}</span>
              )}
            </p>
          ) : null}
        </div>
        <div className="ro-side">
          <SampleCard
            read={read}
            signedBy={typeof config.reach_out?.signed_by === "string" ? config.reach_out.signed_by : null}
            claims={config.reach_out?.proof ?? []}
          />
        </div>
        <div className="ro-main">
          <PitchCard {...shared} />
          {canEdit ? null : (
            <p className="bt-fold-note" data-testid="rec-viewer-note">
              {REACH_OUT_SETTINGS_WORDS.viewer}
            </p>
          )}
          <FactsCard {...shared} />
          <SoundCard {...shared} again={again} />
          <EndingCard {...shared} />
          <SendingCard {...shared} again={again} />
          <RepliesCard {...shared} />
          <NeverCard {...shared} />
          <KeptCard canEdit={canEdit} />
        </div>
      </div>
      <ConnectSheets again={again} flash={flash} />
    </div>
  );
}
