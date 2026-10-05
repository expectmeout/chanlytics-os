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
 *
 * The kit's Menu (Base UI's, the interface kit's decision 15), as People's are (people/menu-groups.tsx): it was the
 * house's hand-written MoreMenu until 5 Oct 2026. `look` is how its control is drawn: the row's quiet glyph, or a card's
 * or the panel's filled button with its words.
 */
import type { ReactNode } from "react";
import { LEAD_WORDS, formatPhoneDisplay, type LeadRowVM } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
import { MenuInPlace, menuGroups } from "../../people/menu-groups";
import type { CallActs } from "./types";

/** How Call's control is drawn: the kit Button's kind and size, a glyph alone or words, and its place in the page's layout. */
interface CallLook {
  variant: "quiet" | "primary";
  size: "sm" | "md";
  iconOnly: boolean;
  className?: string;
}

interface LeadCallMenuProps {
  name: string;
  number: string | null;
  onDial: () => void;
  onCopy: () => void;
  onLog: () => void;
  look: CallLook;
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
  look,
  label = null,
  heading = true,
  size = 11,
  testid = "lead-call",
}: LeadCallMenuProps) => {
  const W = LEAD_WORDS.callWays;
  const title = `Call ${name}`;
  const trigger = look.iconOnly ? (
    <Button
      iconOnly
      variant={look.variant}
      size={look.size}
      aria-label={title}
      title={title}
      data-testid={testid}
      className={look.className}
    >
      <Icon name="phone" size={size} />
    </Button>
  ) : (
    <Button variant={look.variant} size={look.size} title={title} data-testid={testid} className={look.className}>
      {label} <Icon name="chevron-down" size={10} />
    </Button>
  );
  return (
    // Its presses are its own: the row and the card under it open the lead (people/menu-groups.tsx MenuInPlace).
    <MenuInPlace>
      <Menu
        label={title}
        trigger={trigger}
        groups={menuGroups([
          ...(heading && number ? [{ header: number }] : []),
          { label: W.dial.label, icon: "phone", onClick: onDial },
          { label: W.copy.label, icon: "copy", onClick: onCopy },
          { label: W.log.label, icon: "check", meta: W.log.meta, onClick: onLog },
        ])}
      />
    </MenuInPlace>
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
