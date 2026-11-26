/**
 * The ad account's card, opened from its caret (the canvas's Step2 board, scene "card"; Ruben, 25 Nov 2026: what is which,
 * and nothing to read past it): three short parts, a hairline between them. The ad account, its Page and Meta's limit;
 * whether it may run ads, one line where every check is met; where the people an ad brings reach the business (WhatsApp,
 * Instagram). At its foot the two things an owner does here: change the ad account or the Page, and disconnect. Both foot
 * acts are the owner's alone, and the page hands them in where it offers them.
 */
import type { ReactNode } from "react";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { Sheet } from "../../../kit/sheet/sheet";
import { CardChecks, CardFacts } from "./card";
import type { ConnectCardVM } from "./card-model";
import { CARD } from "./words";

interface CardSheetProps {
  open: boolean;
  vm: ConnectCardVM;
  onClose: () => void;
  /** Change the ad account or the Page, and Disconnect: absent for a member who may do neither. */
  onChange?: (() => void) | undefined;
  onDisconnect?: (() => void) | undefined;
}

/** The foot's two acts, where the member may take them. */
function cardSheetFoot({ onChange, onDisconnect }: Pick<CardSheetProps, "onChange" | "onDisconnect">): ReactNode {
  if (!onChange && !onDisconnect) return null;
  return (
    <>
      {onChange ? (
        <Button variant="quiet" onClick={onChange} data-testid="ads-conn-change">
          {CARD.change}
        </Button>
      ) : null}
      {onDisconnect ? (
        <Button variant="quiet" tone="danger" onClick={onDisconnect} data-testid="ads-conn-disconnect">
          {CARD.disconnect}
        </Button>
      ) : null}
    </>
  );
}

/** Whether the account may run ads: one line where every check is met; where one is not, how many are and each one. */
function CardReady({ checks }: { checks: ConnectCardVM["checks"] }) {
  const met = checks.filter((check) => check.state === "ok").length;
  if (met === checks.length)
    return (
      <p className="ads-conn-all" data-testid="ads-conn-all">
        <span className="ads-dot" data-state="ok" aria-hidden="true" />
        {CARD.allReady}
      </p>
    );
  return (
    <div className="ads-conn-part">
      <p className="ads-conn-checks-head">
        <b>{CARD.ready(met, checks.length)}</b>
      </p>
      <CardChecks checks={checks} />
    </div>
  );
}

export function CardSheet({ open, vm, onClose, onChange, onDisconnect }: CardSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={CARD.name}
      sub={vm.connectedOn ?? undefined}
      close={{ label: "Close", glyph: <Icon name="x" size={13} /> }}
      foot={cardSheetFoot({ onChange, onDisconnect })}
      flatFoot
      fit
      testid="ads-conn-sheet"
    >
      <div className="ads-conn ads-conn-open ads-conn-parts">
        <CardFacts facts={vm.facts} />
        <CardReady checks={vm.checks} />
        {vm.reach.length > 0 ? <CardFacts facts={vm.reach} testid="ads-conn-reach" /> : null}
      </div>
    </Sheet>
  );
}
