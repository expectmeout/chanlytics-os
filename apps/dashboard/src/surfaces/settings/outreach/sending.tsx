/**
 * Cold email: Sending. Whether it is healthy, from where, how fast, how much of the month is left, and what happens before
 * each batch (contracts coldEmailSendingOf). The mailbox is changed on Connections, never here; "Send more" appears where
 * it is useful: a mailbox on the domain the business's customers write to, at its ceiling. Before each batch is Autonomy's
 * outreach row, the mode a new sequence starts as, and says so: each sequence keeps its own.
 */
import { useEffect, useRef } from "react";
import {
  CUSTOMER_DOMAIN_DAILY_MAX,
  REACH_OUT_SETTINGS_WORDS,
  SEQUENCE_MODE_LABEL,
  SEQUENCE_MODE_WORDS,
  sequenceModesFor,
  textOrEmpty,
  type ColdEmailCheck,
  type ColdEmailHealth,
} from "@chanlytics/contracts";
import { gate, navigate } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import { RecordToggleGroup } from "../../kit/record/field";
import { useRecordFold } from "../../kit/record/hooks";
import { recFolds } from "../../kit/record/registry";
import { RecordRow } from "../../kit/record/row";
import { RecordSheet } from "../../kit/record/sheet";
import { autonomyVerbs } from "../autonomy/verbs";
import { BtFold } from "../business/gestures/fold";
import { OutreachCard, type OutreachShared } from "./card";

const SEND_WORDS = REACH_OUT_SETTINGS_WORDS.sending;
const MORE_WORDS = REACH_OUT_SETTINGS_WORDS.sendMore;

const HEALTH_TONES: Record<ColdEmailHealth, string> = {
  healthy: "ok",
  attention: "warn",
  on_hold: "warn",
  reconnect: "danger",
  paused: "plain",
  none: "plain",
};

/** One check of the sheet: passed, failed, or could not be read, which is neither. */
const CheckLine = ({ check, n }: { check: ColdEmailCheck; n: number }) => (
  <li className="ro-check" data-ok={check.ok === null ? "unknown" : String(check.ok)} data-testid={`rec-check-${n}`}>
    <span className="ro-check-mark" aria-hidden="true">
      {check.ok === true ? (
        <Icon name="check" size={12} />
      ) : check.ok === false ? (
        <Icon name="alert" size={12} />
      ) : null}
    </span>
    <span className="ro-step-words">
      <span>{check.title}</span>
      <small>{check.detail}</small>
    </span>
  </li>
);

/** Send more: a second domain, and what it gives. Only where the mailbox shown is on the customer's own. */
function SendMoreSheet({ host }: { host: string | null }) {
  const fold = useRecordFold("send_more", { dirty: false });
  useEffect(() => recFolds.drawn("send_more"), []);
  if (!fold.open || !host) return null;
  return (
    <RecordSheet
      id="send_more"
      title={MORE_WORDS.title}
      onClose={fold.close}
      foot={
        <span data-foot-pair>
          <Button size="sm" onClick={fold.close} data-testid="rec-send-more-later">
            {MORE_WORDS.later}
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              fold.close();
              recFolds.request("connect");
            }}
            data-testid="rec-send-more-connect"
          >
            {MORE_WORDS.connect}
          </Button>
        </span>
      }
      testid="rec-send-more-sheet"
    >
      <div className="bt-stack">
        <p className="bt-fold-note">{MORE_WORDS.stays(host, CUSTOMER_DOMAIN_DAILY_MAX)}</p>
        <ul className="ro-steps">
          {[
            [MORE_WORDS.second, MORE_WORDS.secondLike(host)],
            [MORE_WORDS.each, MORE_WORDS.eachLimits],
            [MORE_WORDS.share, MORE_WORDS.shareBack],
          ].map(([title, detail]) => (
            <li className="ro-step" key={title}>
              <span className="ro-step-words">
                <span>{title}</span>
                <small>{detail}</small>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </RecordSheet>
  );
}

/** The sheet behind From: the checks that make it healthy, today, the month, and what to do next. */
function SendingSheet(shared: OutreachShared) {
  const fold = useRecordFold("sending", { dirty: false });
  useEffect(() => recFolds.drawn("sending"), []);
  const sending = shared.read?.sending;
  if (!fold.open || !sending) return null;
  return (
    <RecordSheet
      id="sending"
      title={SEND_WORDS.title}
      onClose={fold.close}
      foot={
        <span data-foot-pair>
          <Button
            size="sm"
            onClick={() => {
              fold.close();
              navigate("admin/integrations");
            }}
            data-testid="rec-sending-connections"
          >
            {SEND_WORDS.connections}
          </Button>
          {sending.customerHost ? (
            <Button
              size="sm"
              onClick={() => {
                fold.close();
                recFolds.request("send_more");
              }}
              data-testid="rec-sending-more"
            >
              {SEND_WORDS.sendMore}
            </Button>
          ) : null}
        </span>
      }
      testid="rec-sending-sheet"
    >
      <div className="bt-stack">
        {sending.from ? <p className="ro-try-lead">{sending.from}</p> : null}
        <ul className="ro-steps" data-testid="rec-sending-checks">
          {sending.checks.map((check, n) => (
            <CheckLine key={check.title} check={check} n={n} />
          ))}
        </ul>
        {sending.today ? (
          <p className="bt-fold-note" data-testid="rec-sending-today">
            {SEND_WORDS.today}: {SEND_WORDS.todayValue(sending.today.sent, sending.today.cap)}
          </p>
        ) : null}
        {sending.pace ? (
          <p className="bt-fold-note" data-testid="rec-sending-pace">
            {sending.pace}
            {sending.ceiling ? `. ${sending.ceiling}` : ""}
          </p>
        ) : null}
        {sending.month ? (
          <p className="bt-fold-note" data-testid="rec-sending-month">
            {SEND_WORDS.month}: {sending.month}
          </p>
        ) : null}
      </div>
    </RecordSheet>
  );
}

/** Before each batch: what a new sequence starts as, through Autonomy's own verb. Cold email never just goes. */
function BatchFold(shared: OutreachShared & { again: () => void }) {
  const mode = shared.read?.batch_mode ?? "ask";
  const saving = useRef(false);
  const door = {
    initial: mode as string,
    pending: () => saving.current,
    save: (next: string, done: () => void) => {
      saving.current = true;
      void autonomyVerbs.setPolicy("outreach", next, {}).then((r) => {
        saving.current = false;
        if (!r.ok) {
          shared.flash({ tone: "danger", msg: r.message });
          return;
        }
        shared.again();
        done();
      });
    },
  };
  return (
    <BtFold<string>
      canEdit={shared.canEdit}
      flash={shared.flash}
      id="batch_mode"
      label={SEQUENCE_MODE_LABEL}
      channel={null}
      light
      gate={gate("settings", "change what happens before each batch")}
      door={door}
      row={{ value: SEND_WORDS.batchAt[mode] }}
      body={(fields) => (
        <>
          <p className="bt-fold-note">{SEND_WORDS.batchNote}</p>
          <RecordToggleGroup<string>
            id="ro-batch-mode"
            labelledBy="rec-fold-batch_mode-label"
            value={textOrEmpty(fields.draft) || mode}
            options={sequenceModesFor("leads").map((m) => ({
              value: m,
              label: SEQUENCE_MODE_WORDS[m].choice,
              hint: m === "veto" || m === "ask" ? SEND_WORDS.batchDoes[m] : undefined,
            }))}
            onChange={(v) => fields.update(() => v, ["batch_mode"])}
            readOnly={fields.readOnly}
            testid="rec-batch-mode-choice"
          />
          <p className="bt-fold-note" data-testid="rec-batch-note">
            {SEND_WORDS.batchNew} {SEND_WORDS.batchWhich}
          </p>
        </>
      )}
    />
  );
}

/** Sending: healthy or not, from where, how fast, the month, and before each batch. */
export function SendingCard(shared: OutreachShared & { again: () => void }) {
  const sending = shared.read?.sending ?? null;
  const health = sending?.health ?? "none";
  const words = SEND_WORDS.health[health];
  const open = () => recFolds.request("sending");
  return (
    <OutreachCard
      id="sending"
      title={SEND_WORDS.title}
      mark={
        words ? <StatePill kind="tone" value={HEALTH_TONES[health]} label={words} testid="rec-sending-pill" /> : null
      }
    >
      <RecordRow
        id="send_from"
        label={SEND_WORDS.from}
        value={sending?.from ? `${sending.from}${sending.more ? ` ${SEND_WORDS.more(sending.more)}` : ""}` : null}
        empty={shared.read ? SEND_WORDS.none : "…"}
        act={{ label: "Details", onClick: open }}
      />
      {sending?.pace ? (
        <RecordRow
          id="send_pace"
          label={SEND_WORDS.pace}
          value={sending.pace}
          act={{ label: "Details", onClick: open }}
        />
      ) : null}
      {/* A month that could not be counted is said nowhere, never as a month of nothing (campaigns/month-sent.ts). */}
      {sending?.month ? (
        <RecordRow
          id="send_month"
          label={SEND_WORDS.month}
          value={sending.month}
          act={{ label: "Details", onClick: open }}
        />
      ) : null}
      <BatchFold {...shared} />
      <SendingSheet {...shared} />
      <SendMoreSheet host={sending?.customerHost ?? null} />
    </OutreachCard>
  );
}
