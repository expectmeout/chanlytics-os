// Chanlytics — Settings › Hours & booking: Booking.
//
// The second card of Hours & booking (Ruben, 17 Oct 2026, the "Settings, split" canvas): what the business books with,
// the link it sends, and the rules for a booking, which were three cards apart on one long page (When you're open,
// Who you are, What you offer). They are the facts the Calendar's "Hours and rules" shows and doors into, so they are
// kept on one page with the hours they apply to.
//
// It composes rows that live with their own cards' files and holds no hook of its own (its rows hold theirs): the
// booking tool's fold (open-bookings.tsx), the booking link's row (who.tsx) and the rules' folds (offer.tsx).

import type { LegacyFlash } from "../../legacy-verbs";
import { BtBookingTool } from "./open-bookings";
import { BtBookingRuleRows } from "./offer";
import type { Brain, Config, Saver } from "./save";
import { BtBookingLinkRow } from "./who";

export const BtBookingCard = ({
  brain,
  base = null,
  config = null,
  canEdit,
  flash,
  saver,
}: {
  brain: Brain;
  base?: Config | null;
  config?: Config | null;
  canEdit: boolean;
  flash: (flash: LegacyFlash) => void;
  saver: Saver;
}) => (
  <section className="rec-card" data-testid="rec-card-booking" aria-labelledby="bt-booking-title">
    <div className="rec-card-head">
      <h2 className="rec-card-title" id="bt-booking-title">
        Booking
      </h2>
      <span className="rec-card-sub">What people book with, and the rules for it</span>
    </div>

    {/* What the business books with: one row and its fold, which a door on another page draws as a sheet where it was
        pressed (booking-tool/). */}
    <BtBookingTool brain={brain} config={config} canEdit={canEdit} flash={flash} saver={saver} />

    <BtBookingLinkRow brain={brain} base={base} canEdit={canEdit} flash={flash} saver={saver} />

    <BtBookingRuleRows brain={brain} canEdit={canEdit} flash={flash} saver={saver} />
  </section>
);
