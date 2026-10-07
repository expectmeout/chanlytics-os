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
 * or the panel's filled button with its words. The table's rows share one (LeadRowCall, LeadRowsCallMenu): a row draws
 * its glyph alone, and the table the menu once.
 */
import type { ReactNode } from "react";
import { LEAD_WORDS, formatPhoneDisplay, type LeadRowVM } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Menu, MenuTrigger, SharedMenu, menuHandle } from "../../kit/menu/menu";
import { MenuInPlace, menuGroups } from "../../people/menu-groups";
import type { CallActs, LeadCallHandle, LeadCallPayload } from "./types";

/** The menu's items: the number as its heading where one is given, then the three ways, each a door of the page's. */
const callGroups = (number: string | null, ways: { onDial: () => void; onCopy: () => void; onLog: () => void }) => {
  const W = LEAD_WORDS.callWays;
  return menuGroups([
    ...(number ? [{ header: number }] : []),
    { label: W.dial.label, icon: "phone", onClick: ways.onDial },
    { label: W.copy.label, icon: "copy", onClick: ways.onCopy },
    { label: W.log.label, icon: "check", meta: W.log.meta, onClick: ways.onLog },
  ]);
};

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
      <Menu label={title} trigger={trigger} groups={callGroups(heading ? number : null, { onDial, onCopy, onLog })} />
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

/** What ties the rows' Call controls to their one menu: made once, by the page that draws the rows (page/reads.ts). */
export const leadCallHandle = (): LeadCallHandle => menuHandle<LeadCallPayload>();

/**
 * A row's Call: its glyph alone, carrying its lead to the one menu the rows share (LeadRowsCallMenu), drawn as the row's
 * LeadCallMenu drew its control and named as it was. A menu on every row was a Base UI menu mounted two hundred times on
 * a switch to Leads at 200 rows (159 ms of a 4x-slowed CPU, 5 Oct 2026), where a row needs only its control until pressed.
 */
export const LeadRowCall = ({ l, handle }: { l: Pick<LeadRowVM, "id" | "name" | "phone">; handle: LeadCallHandle }) => {
  const title = `Call ${l.name}`;
  return (
    // Its press is its own: the row under it opens the lead (people/menu-groups.tsx MenuInPlace).
    <MenuInPlace>
      <MenuTrigger
        handle={handle}
        payload={{ id: l.id, name: l.name, number: formatPhoneDisplay(l.phone) || l.phone }}
        trigger={
          <Button
            iconOnly
            variant="quiet"
            size="sm"
            aria-label={title}
            title={title}
            data-testid="lead-call"
            className="ld-call"
          >
            <Icon name="phone" size={11} />
          </Button>
        }
      />
    </MenuInPlace>
  );
};

/** The rows' one Call menu: the ways of calling the lead whose row opened it, under its number. */
export const LeadRowsCallMenu = ({ handle, acts }: { handle: LeadCallHandle; acts: CallActs }) => (
  <SharedMenu
    handle={handle}
    label={(c) => `Call ${c.name}`}
    groups={(c) =>
      callGroups(c.number, {
        onDial: () => acts.onCall(c.id),
        onCopy: () => acts.onCopyPhone(c.id),
        onLog: () => acts.onLogCall(c.id),
      })
    }
  />
);
