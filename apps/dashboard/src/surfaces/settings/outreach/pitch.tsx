/**
 * Cold email: Your pitch. Four questions anyone can answer, each a fold of the record, one key of the config's reach_out
 * section, saved through the tab's one saver (business/fold-shapes.ts holds what each opens with, writes and refuses). A
 * row with nothing set says what the writers read in its place, and why (contracts reachOutOfferOf); its box opens on
 * those words (box.tsx). Each sheet says what the change reaches, at the moment it matters.
 */
import {
  REACH_OUT_LIMITS,
  REACH_OUT_SETTINGS_WORDS,
  REPLY_OFFERS,
  REPLY_OFFER_WORDS,
  reachOutOfferOf,
  textOrEmpty,
  type ReplyOffer,
} from "@chanlytics/contracts";
import { gate, navigate } from "../../frame-verbs";
import { LinkButton } from "../../kit/link-button/link-button";
import { RecordToggleGroup } from "../../kit/record/field";
import { BtFold } from "../business/gestures/fold";
import { settingsRowRoute } from "../frame/tabs";
import { reachOutFold } from "./box";
import { OutreachCard, storedReachOut, type OutreachShared } from "./card";

const PITCH_WORDS = REACH_OUT_SETTINGS_WORDS.pitch;

const isReplyOffer = (value: string): value is ReplyOffer => REPLY_OFFERS.some((o) => o === value);

/** What should they do next: three choices, each saying what it does, and whether there is a link to offer. */
function NextStepFold(shared: OutreachShared) {
  const stored = textOrEmpty(shared.config.reach_out?.reply_offer);
  const link = shared.brain.booking_link?.trim() || null;
  // Nothing stored is the booking link, as it was before the page (contracts writeReachOutKey); with no link there is nothing
  // to book through, and answers just reply, so that is what the row says and the sheet opens on.
  const chosen: ReplyOffer = isReplyOffer(stored) ? stored : link ? "booking_link" : "answer";
  return (
    <BtFold
      canEdit={shared.canEdit}
      flash={shared.flash}
      saver={shared.saver}
      id="reply_offer"
      label={PITCH_WORDS.next}
      channel={null}
      light
      gate={gate("settings", "change what they should do next")}
      row={{ value: REPLY_OFFER_WORDS[chosen].choice }}
      body={(fields) => {
        const draft = textOrEmpty(fields.draft) || chosen;
        return (
          <>
            <RecordToggleGroup<string>
              id="ro-reply-offer"
              labelledBy="rec-fold-reply_offer-label"
              value={draft}
              options={REPLY_OFFERS.map((o) => ({
                value: o,
                label: REPLY_OFFER_WORDS[o].choice,
                hint: REPLY_OFFER_WORDS[o].does,
              }))}
              onChange={(v) => fields.update(() => v, ["reply_offer"])}
              readOnly={fields.readOnly}
              testid="rec-reply-offer-choice"
            />
            {draft === "booking_link" ? (
              <p className="bt-fold-note" data-testid="rec-reply-offer-link">
                {link ? (
                  PITCH_WORDS.bookingOn(link)
                ) : (
                  <LinkButton
                    onClick={() => navigate(settingsRowRoute("booking_link"))}
                    data-testid="rec-reply-offer-add-link"
                  >
                    {PITCH_WORDS.bookingNone}
                  </LinkButton>
                )}
              </p>
            ) : null}
          </>
        );
      }}
    />
  );
}

/** Your pitch: what you sell, who should hear from you, what problem you solve, and what they should do next. */
export function PitchCard(shared: OutreachShared) {
  const about = shared.read?.about ?? null;
  const fallback = storedReachOut(shared, "offer") ? null : reachOutOfferOf(shared.config, about);
  return (
    <OutreachCard id="pitch" title={PITCH_WORDS.title}>
      {reachOutFold(shared, {
        id: "offer",
        key: "offer",
        label: PITCH_WORDS.sell,
        rows: 3,
        max: REACH_OUT_LIMITS.offer,
        placeholder: PITCH_WORDS.placeholders.sell,
        empty: PITCH_WORDS.empty,
        rule: PITCH_WORDS.reachSell,
        fallback,
        from: PITCH_WORDS.from[shared.read?.about_from ?? "goal"],
      })}
      {reachOutFold(shared, {
        id: "who_for",
        key: "who_for",
        label: PITCH_WORDS.whoFor,
        rows: 1,
        max: REACH_OUT_LIMITS.whoFor,
        placeholder: PITCH_WORDS.placeholders.whoFor,
        empty: PITCH_WORDS.empty,
        rule: `${PITCH_WORDS.whoForNote} ${PITCH_WORDS.reachWords}`,
        known: shared.read?.known.newest_search,
      })}
      {reachOutFold(shared, {
        id: "fixes",
        key: "fixes",
        label: PITCH_WORDS.fixes,
        rows: 2,
        max: REACH_OUT_LIMITS.fixes,
        placeholder: PITCH_WORDS.placeholders.fixes,
        empty: PITCH_WORDS.empty,
        rule: PITCH_WORDS.reachWords,
      })}
      <NextStepFold {...shared} />
    </OutreachCard>
  );
}
