/**
 * Settings › How it reaches out (decision 0113): everything a cold email to a business a search found is written from,
 * on one page beside How it answers. A part of the business's record (business/tab.tsx BusinessPart "outreach"), so its
 * rows are folds of the one record saved through the tab's one saver, and what it shows beyond the config is the pane's
 * own read. The cards, in the order a person needs them: what you offer, what you can prove, how it writes, how it signs
 * off, where it sends from, what a reply sets off, the rules it keeps, what it is told, and one email before any goes.
 */
import type { FrameFlash } from "../../frame-verbs";
import type { BtSaver } from "../business/gestures/common";
import type { Brain, Config } from "../business/save";
import { useReachOutRead } from "./card";
import { OfferCard, ProofCard } from "./offer";
import { RulesCard, SendsFromCard, WritesBackCard } from "./sends";
import { ToldCard } from "./told";
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
  return (
    <>
      <OfferCard {...shared} />
      <ProofCard {...shared} />
      <WritesCard {...shared} again={again} />
      <SignOffCard {...shared} />
      <SendsFromCard {...shared} />
      <WritesBackCard {...shared} />
      <RulesCard />
      <ToldCard canEdit={canEdit} />
    </>
  );
}
