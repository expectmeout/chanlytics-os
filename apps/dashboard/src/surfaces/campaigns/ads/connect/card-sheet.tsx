/**
 * The ad account's card, opened from its caret (the canvas's Step2 board, scene "card"): who Meta charges, the Page
 * and Meta's own limit, then all five checks with what each is needed for, the quiet line on what needs none, and at
 * its foot the two things an owner does here: change the ad account or the Page, and disconnect. Both foot acts are the
 * owner's alone, and the page hands them in where it offers them.
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
function footOf({ onChange, onDisconnect }: Pick<CardSheetProps, "onChange" | "onDisconnect">): ReactNode {
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

export function CardSheet({ open, vm, onClose, onChange, onDisconnect }: CardSheetProps) {
  const met = vm.checks.filter((check) => check.state === "ok").length;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={CARD.name}
      sub={vm.connectedOn ?? undefined}
      close={{ label: "Close", glyph: <Icon name="x" size={13} /> }}
      foot={footOf({ onChange, onDisconnect })}
      flatFoot
      fit
      testid="ads-conn-sheet"
    >
      <div className="ads-conn ads-conn-open">
        <CardFacts facts={vm.facts} />
        <div className="ads-conn-checks-head">
          <b>{CARD.checks}</b>
          <span>{CARD.ready(met, vm.checks.length)}</span>
          <span className="ads-conn-for">{CARD.neededFor}</span>
        </div>
        <CardChecks checks={vm.checks} neededFor />
        <p className="ads-conn-says">{vm.quiet}</p>
      </div>
    </Sheet>
  );
}
