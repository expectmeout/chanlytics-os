/**
 * Cold email: When someone replies. Worth knowing once, and no one can change most of it, so one line and a sheet: the
 * one table of what a reply sets off (contracts readingPlan, said by writesBackRows). What an answer offers is the
 * owner's, on Your pitch; whether one is drafted is Autonomy's Replies row, linked from here.
 */
import { useEffect } from "react";
import {
  REACH_OUT_SETTINGS_WORDS,
  REPLY_MODE_UNSET,
  REPLY_OFFERS,
  replyLineOf,
  textOrEmpty,
  writesBackRows,
  type ReplyOffer,
} from "@chanlytics/contracts";
import { navigate } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { useRecordFold } from "../../kit/record/hooks";
import { recFolds } from "../../kit/record/registry";
import { RecordRow } from "../../kit/record/row";
import { RecordSheet } from "../../kit/record/sheet";
import { OutreachCard, type OutreachShared } from "./card";

const REPLY_WORDS = REACH_OUT_SETTINGS_WORDS.replies;

const isReplyOffer = (value: string): value is ReplyOffer => REPLY_OFFERS.some((o) => o === value);

export function RepliesCard(shared: OutreachShared) {
  const fold = useRecordFold("replies", { dirty: false });
  useEffect(() => recFolds.drawn("replies"), []);
  const stored = textOrEmpty(shared.config.reach_out?.reply_offer);
  const mode = shared.read?.reply_mode ?? REPLY_MODE_UNSET;
  const rows = writesBackRows(isReplyOffer(stored) ? stored : undefined, mode, !!shared.brain.booking_link?.trim());
  return (
    <OutreachCard id="replies" title={REPLY_WORDS.title}>
      <RecordRow
        id="replies"
        stacked
        label={replyLineOf(mode)}
        act={{ label: "See how", onClick: () => fold.request() }}
      />
      {fold.open ? (
        <RecordSheet
          id="replies"
          title={REPLY_WORDS.sheetTitle}
          onClose={fold.close}
          foot={
            <span data-foot-pair>
              <Button
                size="sm"
                onClick={() => {
                  fold.close();
                  navigate("admin/autonomy");
                }}
                data-testid="rec-reply-mode-door"
              >
                {REPLY_WORDS.autonomy}
              </Button>
              {shared.canEdit ? (
                <Button
                  size="sm"
                  onClick={() => {
                    fold.close();
                    recFolds.request("reply_offer");
                  }}
                  data-testid="rec-replies-change"
                >
                  {REPLY_WORDS.change}
                </Button>
              ) : null}
            </span>
          }
          testid="rec-replies-sheet"
        >
          <div className="bt-stack">
            <p className="bt-fold-note">{REPLY_WORDS.sheetSub}</p>
            <ul className="ro-steps" data-testid="rec-replies-rows">
              {rows.map((row) => (
                <li className="ro-step" key={row.id} data-testid={`rec-reply-${row.id}`}>
                  <span className="ro-step-words">
                    <span>{row.label}</span>
                    <small>{row.value}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </RecordSheet>
      ) : null}
    </OutreachCard>
  );
}
