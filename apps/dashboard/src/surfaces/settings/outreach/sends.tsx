/**
 * How it reaches out (decision 0113): Where it sends from, When a lead writes back, and Rules it always keeps. The first
 * reads the mailbox as Connections says it and the month's share, and is changed on Connections and To send, never
 * here. The second is the one table of what a reply sets off (contracts readingPlan, said by writesBackRows): only what
 * the drafted answer offers is the owner's, a fold of the record; the rest is code's, with the lock and no act. The
 * rules are said from the numbers the code keeps (reachOutRuleLines), never a setting.
 */
import {
  REACH_OUT_SETTINGS_WORDS,
  REPLY_OFFERS,
  REPLY_OFFER_WORDS,
  TO_SEND_ROUTE,
  reachOutRuleLines,
  replyModeHint,
  writesBackRows,
  type ReplyOffer,
} from "@chanlytics/contracts";
import { gate, navigate } from "../../frame-verbs";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { StatePill } from "../../kit/pill/state-pill";
import { RecordToggleGroup } from "../../kit/record/field";
import { RecordRow } from "../../kit/record/row";
import { BtFold } from "../business/gestures/fold";
import { OutreachCard, type OutreachShared } from "./card";

const W = REACH_OUT_SETTINGS_WORDS;

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
      title={W.sendsFrom.title}
      sub={W.sendsFrom.sub}
      mark={
        mailbox ? (
          <StatePill kind="tone" value={mailbox.tone} label={mailbox.pill} testid="rec-sends-from-pill" />
        ) : null
      }
    >
      <RecordRow
        id="send_mailbox"
        label={W.sendsFrom.mailbox}
        value={mailbox ? `${mailbox.address} · ${mailbox.provider === "google" ? "Google" : mailbox.provider}` : null}
        empty={W.sendsFrom.none}
        hint={mailbox ? (mailbox.ramp ?? mailbox.day) : null}
        act={{ label: W.sendsFrom.connections, icon: "chevron", onClick: () => navigate("admin/integrations") }}
      />
      {/* A month that could not be counted is said nowhere, never as a month of nothing (campaigns/month-sent.ts). */}
      {read?.month.sent === null ? null : (
        <RecordRow
          id="send_month"
          label={W.sendsFrom.month}
          value={read ? W.sendsFrom.monthValue(read.month.sent, read.month.of) : null}
          empty="…"
        />
      )}
      <RecordRow
        id="send_by_hand"
        label={W.sendsFrom.byHand}
        value={read ? W.sendsFrom.byHandValue(read.by_hand_per_day) : null}
        empty="…"
        act={{ label: W.sendsFrom.toSend, icon: "chevron", onClick: () => navigate(TO_SEND_ROUTE) }}
      />
    </OutreachCard>
  );
}

const isReplyOffer = (value: string): value is ReplyOffer => REPLY_OFFERS.some((o) => o === value);
const textOf = (value: unknown): string => (typeof value === "string" ? value : "");

/** When a lead writes back: what each reading sets off, and what the answer to an interested one offers. */
export function WritesBackCard(shared: OutreachShared) {
  const chosen = textOf(shared.config.reach_out?.reply_offer);
  const offer = isReplyOffer(chosen) ? chosen : undefined;
  const mode = shared.read?.reply_mode ?? "ask";
  const [first, ...fixed] = writesBackRows(offer, mode);
  return (
    <OutreachCard id="writes-back" title={W.writesBack.title} sub={W.writesBack.sub}>
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
                  {W.writesBack.modeDoor} <Icon name="chevron" size={11} />
                </LinkButton>
              </span>
            ),
          }}
          body={(f) => (
            <RecordToggleGroup<string>
              id="ro-reply-offer"
              labelledBy="rec-fold-reply_offer-label"
              value={textOf(f.draft) || "booking_link"}
              options={REPLY_OFFERS.map((o) => ({ value: o, label: REPLY_OFFER_WORDS[o].choice }))}
              onChange={(v) => f.update(() => v, ["reply_offer"])}
              readOnly={f.readOnly}
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
      title={W.rules.title}
      sub={W.rules.sub}
      mark={
        <span className="ro-always-mark">
          <Icon name="lock" size={11} /> {W.rules.mark}
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
