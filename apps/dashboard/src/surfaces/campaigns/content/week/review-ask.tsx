/**
 * The plan's proposal to ask every client for a review (the content loop's pass 6; the content canvas's Loop4, approved by
 * Ruben on 24 Nov 2026): a row at the Week's foot, beside what to film, and the card it opens. The card says why in AI's
 * words, shows the after-visit message as it is live (its slots named, never a client's words), its three facts, and two
 * presses: Approve starts the ask by its starter (POST playbooks; its first batch waits for the owner's OK, as every
 * campaign's does), and Not now rests the proposal for 30 days. Nothing here turns anything on by itself.
 */
import { useState } from "react";
import {
  REVIEW_ASK_WORDS as W,
  reviewAskLineOf,
  starterByKey,
  starterText,
  type ReviewAskDto,
} from "@chanlytics/contracts";
import { restTheReviewAsk, startReviewAsk } from "@/bridge/verbs/week";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { Sheet } from "../../../kit/sheet/sheet";

/** The after-visit message as it is live, its slots named: whose name, which business, which link. */
function liveMessage(): string | null {
  const starter = starterByKey("after_visit_review");
  if (!starter) return null;
  const slot: Readonly<Record<string, string>> = {
    "1": "[first name]",
    "2": "[your business]",
    "3": "[your review link]",
  };
  return starterText(starter, "en_US").body.replace(/\{\{(\d)\}\}/g, (_, n: string) => slot[n] ?? "");
}

/** The row at the Week's foot: a star, the ask, why and when, and Open. */
export function ReviewAskRow({ ask, onOpen }: { ask: ReviewAskDto; onOpen: () => void }) {
  return (
    <div className="cwk-film cwk-ask" data-testid="cwk-review-ask">
      <span className="cwk-film-glyph" aria-hidden="true">
        <Icon name="star" size={14} />
      </span>
      <span className="cwk-words">
        <b>{W.title}</b>
        <span>{reviewAskLineOf(ask)}</span>
      </span>
      <Button size="sm" onClick={onOpen} data-testid="cwk-review-ask-open">
        {W.open}
      </Button>
    </div>
  );
}

/** The card the row opens: AI's line, the message, its facts, Approve and Not now. */
export function ReviewAskSheet({ ask, open, onClose }: { ask: ReviewAskDto; open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const press = async (act: "approve" | "rest") => {
    setBusy(true);
    const answer = act === "approve" ? await startReviewAsk() : await restTheReviewAsk();
    setBusy(false);
    // Done, the Week reads again (the refresh map) and the proposal is gone from it: the card closes with it.
    if (!answer.ok) return setSaid(answer.message);
    setSaid(null);
    return onClose();
  };
  const message = liveMessage();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={W.card.title}
      sub={W.card.head}
      close={{ label: W.card.close, glyph: <Icon name="x" size={13} /> }}
      testid="cwk-review-ask-card"
      foot={
        <div className="cwk-ask-acts">
          <Button variant="primary" onClick={() => void press("approve")} disabled={busy} data-testid="cwk-ask-approve">
            {W.card.approve}
          </Button>
          <Button onClick={() => void press("rest")} disabled={busy} data-testid="cwk-ask-rest">
            {W.card.notNow}
          </Button>
        </div>
      }
    >
      <div className="cwk-ask-card">
        <p className="cwk-ask-says">
          <Icon name="three" size={14} />
          <span>{W.card.says[ask.why]}</span>
        </p>
        {message ? <p className="cwk-ask-message">{message}</p> : null}
        <ul className="cwk-ask-facts">
          {W.card.facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
        {said ? (
          <p className="cwk-ask-said" role="status">
            {said}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
