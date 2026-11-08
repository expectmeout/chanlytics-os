/**
 * Settings › How it reaches out (decision 0113): everything a cold email to a business a search found is written from,
 * on one page beside How it answers. A part of the business's record (business/tab.tsx BusinessPart "outreach"), so its
 * rows are folds of the one record saved through the tab's one saver, and what it shows beyond the config is the pane's
 * own read. The cards, in the order a person needs them: what you offer, what you can prove, how it writes, how it signs
 * off, where it sends from, what a reply sets off, the rules it keeps, what it is told, and one email before any goes.
 */
import { REACH_OUT_SETTINGS_WORDS, reachOutOfferOf } from "@chanlytics/contracts";
import type { FrameFlash } from "../../frame-verbs";
import { LinkButton } from "../../kit/link-button/link-button";
import { recFolds } from "../../kit/record/registry";
import type { BtSaver } from "../business/gestures/common";
import type { Brain, Config } from "../business/save";
import { useReachOutRead } from "./card";
import { OfferCard, ProofCard } from "./offer";
import { RulesCard, SendsFromCard, WritesBackCard } from "./sends";
import { ToldCard } from "./told";
import { TryCard } from "./try";
import { SignOffCard, WritesCard } from "./writes";

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
  // Its own one line, on this page alone, where a cold email would have nothing to say of what the business offers:
  // no offer here, nothing it does, no goal (contracts reachOutOfferOf). Never in the receptionist's gap line or the
  // rail, where a business that writes no cold email would be asked for it on every page.
  const offerless = read !== null && reachOutOfferOf(config, read.about) === null;
  return (
    <>
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
      <OfferCard {...shared} />
      <ProofCard {...shared} />
      <WritesCard {...shared} again={again} />
      <SignOffCard {...shared} />
      <SendsFromCard {...shared} />
      <WritesBackCard {...shared} />
      <RulesCard />
      <ToldCard canEdit={canEdit} />
      <TryCard
        read={read}
        signedBy={typeof config.reach_out?.signed_by === "string" ? config.reach_out.signed_by : null}
        claims={config.reach_out?.proof ?? []}
      />
    </>
  );
}
