/**
 * How it reaches out (decision 0113): Where it sends from, When a lead writes back, and Rules it always keeps. The first
 * reads the mailbox as Connections says it and the month's share, and is changed on Connections and To send, never
 * here. The second is the one table of what a reply sets off (contracts readingPlan, said by writesBackRows): only what
 * the drafted answer offers is the owner's, a fold of the record; the rest is code's, with the lock and no act. The
 * rules are said from the numbers the code keeps (reachOutRuleLines), never a setting.
 */
import {
  REACH_OUT_SETTINGS_WORDS,
  REPLY_MODE_UNSET,
  REPLY_OFFERS,
  REPLY_OFFER_WORDS,
  TO_SEND_ROUTE,
  reachOutRuleLines,
  replyModeHint,
  writesBackRows,
  type ReplyOffer,
  textOrEmpty,
} from "@chanlytics/contracts";
import { gate, navigate } from "../../frame-verbs";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { StatePill } from "../../kit/pill/state-pill";
import { RecordToggleGroup } from "../../kit/record/field";
import { RecordRow } from "../../kit/record/row";
import { BtFold } from "../business/gestures/fold";
import { OutreachCard, type OutreachShared } from "./card";

const SENDS_CARDS = REACH_OUT_SETTINGS_WORDS;

/** The lock a row of code's carries where an act would stand. */
const Always = () => (
  <span className="ro-always" role="img" aria-label="Always">
    <Icon name="lock" size={11} />
  </span>
);

/** Where it sends from: the mailbox, the month's first emails, and the road without one. */
export function SendsFromCard(shared: OutreachShared) {
  const read = shared.read;
  const mailbox = read?.mailbox ?? null;
  return (
    <OutreachCard
      id="sends-from"
      title={SENDS_CARDS.sendsFrom.title}
      sub={SENDS_CARDS.sendsFrom.sub}
      mark={
        mailbox ? (
          <StatePill kind="tone" value={mailbox.tone} label={mailbox.pill} testid="rec-sends-from-pill" />
        ) : null
      }
    >
      <RecordRow
        id="send_mailbox"
        label={SENDS_CARDS.sendsFrom.mailbox}
        value={mailbox ? `${mailbox.address} · ${mailbox.provider === "google" ? "Google" : mailbox.provider}` : null}
        empty={SENDS_CARDS.sendsFrom.none}
        hint={mailbox ? (mailbox.ramp ?? mailbox.day) : null}
        act={{
          label: SENDS_CARDS.sendsFrom.connections,
          icon: "chevron",
          onClick: () => navigate("admin/integrations"),
        }}
      />
      {/* A month that could not be counted is said nowhere, never as a month of nothing (campaigns/month-sent.ts). */}
      {read?.month.sent === null ? null : (
        <RecordRow
          id="send_month"
          label={SENDS_CARDS.sendsFrom.month}
          value={read ? SENDS_CARDS.sendsFrom.monthValue(read.month.sent, read.month.of) : null}
          empty="…"
        />
      )}
      <RecordRow
        id="send_by_hand"
        label={SENDS_CARDS.sendsFrom.byHand}
        value={read ? SENDS_CARDS.sendsFrom.byHandValue(read.by_hand_per_day) : null}
        empty="…"
        act={{ label: SENDS_CARDS.sendsFrom.toSend, icon: "chevron", onClick: () => navigate(TO_SEND_ROUTE) }}
      />
    </OutreachCard>
  );
}

const isReplyOffer = (value: string): value is ReplyOffer => REPLY_OFFERS.some((o) => o === value);

/** When a lead writes back: what each reading sets off, and what the answer to an interested one offers. */
export function WritesBackCard(shared: OutreachShared) {
  const chosen = textOrEmpty(shared.config.reach_out?.reply_offer);
  const offer = isReplyOffer(chosen) ? chosen : undefined;
  const mode = shared.read?.reply_mode ?? REPLY_MODE_UNSET;
  const [first, ...fixed] = writesBackRows(offer, mode, !!shared.brain.booking_link?.trim());
  return (
    <OutreachCard id="writes-back" title={SENDS_CARDS.writesBack.title} sub={SENDS_CARDS.writesBack.sub}>
      {first ? (
        <BtFold
          canEdit={shared.canEdit}
          flash={shared.flash}
          saver={shared.saver}
          id="reply_offer"
          label={first.label}
          channel={null}
          light
          gate={gate("settings", "change what an answer to a lead offers")}
          row={{
            value: first.value,
            children: (
              <span className="rec-row-hint" data-testid="rec-reply-mode">
                {replyModeHint(mode) ?? ""}{" "}
                <LinkButton onClick={() => navigate("admin/autonomy")} data-testid="rec-reply-mode-door">
                  {SENDS_CARDS.writesBack.modeDoor} <Icon name="chevron" size={11} />
                </LinkButton>
              </span>
            ),
          }}
          body={(fields) => (
            <RecordToggleGroup<string>
              id="ro-reply-offer"
              labelledBy="rec-fold-reply_offer-label"
              value={textOrEmpty(fields.draft) || "booking_link"}
              options={REPLY_OFFERS.map((o) => ({ value: o, label: REPLY_OFFER_WORDS[o].choice }))}
              onChange={(v) => fields.update(() => v, ["reply_offer"])}
              readOnly={fields.readOnly}
              testid="rec-reply-offer-choice"
            />
          )}
        />
      ) : null}
      {fixed.map((row) => (
        <RecordRow key={row.id} id={`reply_${row.id}`} label={row.label} value={row.value} testid={`rec-row-${row.id}`}>
          <Always />
        </RecordRow>
      ))}
    </OutreachCard>
  );
}

/** Rules it always keeps: read from the numbers the code keeps, each a line with a check, no act. */
export function RulesCard() {
  return (
    <OutreachCard
      id="rules"
      title={SENDS_CARDS.rules.title}
      sub={SENDS_CARDS.rules.sub}
      mark={
        <span className="ro-always-lock">
          <Icon name="lock" size={11} /> {SENDS_CARDS.rules.mark}
        </span>
      }
    >
      <ul className="ro-rules" data-testid="rec-rules">
        {reachOutRuleLines().map((line) => (
          <li key={line}>
            <Icon name="check" size={12} />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </OutreachCard>
  );
}
