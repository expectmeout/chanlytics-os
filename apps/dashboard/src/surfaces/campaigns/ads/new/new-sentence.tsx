/**
 * What stands under New ad's head on every step: the one sentence that grows as the steps are finished (the drawer's own
 * AdSentence, so the words are the same tinted ones), and above it, once, the dim line that says they can be pressed.
 * A word pressed here goes to its step's control rather than opening a list (AdSentence's `jump`), because the steps hold
 * the choices and what each one changes. On a phone the sentence is clamped to two lines until it is opened.
 */
import { useState } from "react";
import { NEW_AD, SENTENCE } from "@chanlytics/contracts/ads-page";
import type { ChipId, SentencePart } from "@chanlytics/contracts/ads-page";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { AdSentence } from "../drawer/sentence";
import type { Step } from "./new-state";

interface LeadProps {
  parts: readonly SentencePart[];
  step: Step;
  /** Say "Tap any highlighted word to change it": once, until the owner moves on. */
  hint: boolean;
  phone: boolean;
  /** A word of the sentence was pressed: go to its step. */
  onChip: (id: ChipId) => void;
}

export function NewLead({ parts, step, hint, phone, onChip }: LeadProps) {
  const [open, setOpen] = useState(false);
  const jump = {
    door: () => onChip("door"),
    offer: () => onChip("offer"),
    platform: () => onChip("platform"),
    area: () => onChip("area"),
    amount: () => onChip("amount"),
    end: () => onChip("end"),
  };
  return (
    <div className="ads-new-lead" data-clamp={phone && !open ? "true" : undefined} data-step={step}>
      {hint ? <p className="ads-new-hint">{SENTENCE.tapHint}</p> : null}
      <AdSentence parts={parts} editing jump={jump} />
      {phone ? (
        <LinkButton
          className="ads-new-more"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          data-testid="ads-new-more"
        >
          {open ? NEW_AD.sentenceLess : NEW_AD.sentenceMore}
          <Icon name={open ? "chevron-up" : "chevron-down"} size={11} />
        </LinkButton>
      ) : null}
    </div>
  );
}
