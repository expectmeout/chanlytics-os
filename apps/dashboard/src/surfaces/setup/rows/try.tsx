/**
 * The numbers to try once the receptionist answers somewhere (moved from legacy/pages/setup.jsx, decision 0015): call it,
 * then open Live; text it, then open the Inbox.
 */
import type { SetupVM } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { navigate } from "../../legacy-verbs";

export const SetupTry = ({ tryIt }: { tryIt: NonNullable<SetupVM["tryIt"]> }) => (
  <section className="rec-card set-card setup-try" data-testid="setup-try">
    <div className="rec-card-head">
      <h2 className="rec-card-title">Try your receptionist</h2>
      <span className="rec-card-sub">from your own phone</span>
    </div>
    <div className="setup-try-rows">
      {tryIt.voice && (
        <div className="setup-try-row">
          <Icon name="phone" size={13} />
          <span className="setup-try-num">{tryIt.voiceLabel}</span>
          <Button size="sm" href={`tel:${tryIt.voice}`}>
            Call it
          </Button>
          <Button size="sm" variant="quiet" onClick={() => navigate("live")}>
            Then open Live <Icon name="arrow-right" size={10} />
          </Button>
        </div>
      )}
      {tryIt.whatsapp && (
        <div className="setup-try-row">
          <Icon name="chat" size={13} />
          <span className="setup-try-num">{tryIt.whatsappLabel}</span>
          <Button size="sm" variant="quiet" onClick={() => navigate("inbox")}>
            Text it, then open the Inbox <Icon name="arrow-right" size={10} />
          </Button>
        </div>
      )}
    </div>
  </section>
);
