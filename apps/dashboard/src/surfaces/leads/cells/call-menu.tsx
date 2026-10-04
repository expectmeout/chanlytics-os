/**
 * Call asks first (moved from legacy/pages/leads-cells.jsx, decision 0015). It dialled the instant it was pressed -- a real
 * call to a real business, from a row you might only have been skimming -- and a call made from a desk phone could not be
 * recorded at all, because the six outcomes are armed by that button alone. The ways are contracts' (LEAD_CALL_WAYS), and
 * the receptionist is not among them: it answers your line and never rings a customer, which the Business page tells the
 * owner in those words (business-tab.ts CANNOT_ROWS). The number is the menu's heading, so you see what you would dial.
 *
 * One menu wherever Call is: a lead's row, its card, the map's card and the lead's own panel. It takes what it says and
 * what each way does, not a lead, because the row and the panel hold a lead in two shapes. `number` is the menu's heading
 * where the button is only a glyph; a button that says the number already leaves it out.
 */
import type { ReactNode } from "react";
import { LEAD_WORDS, formatPhoneDisplay, type LeadRowVM } from "@chanlytics/contracts";
import { MoreMenu } from "../../kit/more-menu/more-menu";
import type { CallActs } from "./types";

interface LeadCallMenuProps {
  name: string;
  number: string | null;
  onDial: () => void;
  onCopy: () => void;
  onLog: () => void;
  btnClass: string;
  label?: ReactNode;
  heading?: boolean;
  size?: number;
  testid?: string;
}

export const LeadCallMenu = ({
  name,
  number,
  onDial,
  onCopy,
  onLog,
  btnClass,
  label = null,
  heading = true,
  size = 11,
  testid = "lead-call",
}: LeadCallMenuProps) => {
  const W = LEAD_WORDS.callWays;
  return (
    <MoreMenu
      align="right"
      escape
      icon="phone"
      size={size}
      title={`Call ${name}`}
      btnClass={btnClass}
      label={label}
      testid={testid}
      items={[
        ...(heading ? [{ header: number }] : []),
        { label: W.dial.label, icon: "phone", onClick: onDial },
        { label: W.copy.label, icon: "copy", onClick: onCopy },
        { label: W.log.label, icon: "check", meta: W.log.meta, onClick: onLog },
      ]}
    />
  );
};

/** What a lead's row, card or map card hands the menu: its name, its number as a person reads it, and the three ways. */
export const ldCallProps = (l: Pick<LeadRowVM, "id" | "name" | "phone">, acts: CallActs) => ({
  name: l.name,
  number: formatPhoneDisplay(l.phone) || l.phone,
  onDial: () => acts.onCall(l.id),
  onCopy: () => acts.onCopyPhone(l.id),
  onLog: () => acts.onLogCall(l.id),
});
