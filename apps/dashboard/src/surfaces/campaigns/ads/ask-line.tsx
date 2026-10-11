/**
 * The Ads page's Ask line on a desk (MOCKUP; spec C5): one proposal in one sentence with two presses, drawn only when it can
 * say something true (fix a blocked ad, extend one that ends within three days, move money between two). It is an inset line
 * with the ✦ in the accent; the press that spends opens the kit's Confirm, which says the whole consequence before it is
 * final, and whose No goes back to the sentence (the owner who hesitates keeps the line: only "Not now" on the sentence puts
 * it off for the session). (On a phone the same proposal is the last row of the list: ledger/phone.tsx.) Whether a press
 * happened, and what it changes, is the page's (ads-page.tsx): nothing here is sent anywhere.
 */
import { useState } from "react";
import { GATE } from "@chanlytics/contracts/ads-page";
import type { AskVM } from "@chanlytics/contracts/ads-page";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { Panel } from "../../kit/panel/panel";
import { gate } from "../../legacy-verbs";

/** A press that spends is the owner's; one that only opens an ad is anyone's. */
export const spends = (ask: AskVM): boolean => ask.kind !== "fix";

interface AskLineProps {
  ask: AskVM;
  /** The press: it does what the proposal says (after the consequence was read, where it has one), or opens the ad it names. */
  onYes: () => void;
  /** "Not now": the line goes for the session. */
  onNo: () => void;
}

/** The Ask line: the sentence and its two presses, or, once the first is pressed, the consequence and its Confirm. */
export function AskLine({ ask, onYes, onNo }: AskLineProps) {
  const [asking, setAsking] = useState(false);
  const press = () => {
    if (ask.confirm) setAsking(true);
    else onYes();
  };
  return (
    <Panel as="section" variant="inset" size="sm" className="ads-proposal" data-kind={ask.kind} data-testid="ads-ask">
      <Icon name="sparkle" size={15} className="ads-ask-spark" />
      {asking && ask.confirm ? (
        <Confirm
          question={ask.confirm}
          yes={ask.press}
          no={ask.dismiss}
          onYes={() => {
            setAsking(false);
            onYes();
          }}
          // The question's No takes the owner back to the sentence; only the line's own "Not now" puts it off.
          onNo={() => setAsking(false)}
          className="ads-ask-sure"
          testid="ads-ask"
        />
      ) : (
        <>
          <p className="ads-ask-said">{ask.text}</p>
          <div className="ads-ask-acts">
            <Button
              variant="primary"
              size="sm"
              className="ads-ask-go"
              onClick={press}
              data-testid="ads-ask-press"
              {...(spends(ask) ? gate("approve", GATE.change) : null)}
            >
              {ask.press}
            </Button>
            <Button variant="quiet" size="sm" onClick={onNo} data-testid="ads-ask-not">
              {ask.dismiss}
            </Button>
          </div>
        </>
      )}
    </Panel>
  );
}
