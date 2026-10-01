/**
 * The lead peek's names that pages which have not moved still read, under the names they read (decision 0015). The
 * Leads page and People (leads-real.jsx, leads-scope.jsx, people.jsx, leads-cells.jsx) read them as globals: the peek and its
 * acts, the five whys the bulk bar asks again, the lightbox, Esc's one step, the focus rule, the watcher that asks once the
 * owner is back, the tip placement and the photo warmed before it is needed. Nothing here is behaviour: each is the
 * surface's own function, exactly as it draws or acts. The app publishes it from seed-globals.ts, before any page loads,
 * and it is deleted with the last page that reads a name (Leads).
 */
import { LeadPeekActions } from "./peek/acts";
import { LeadNotFitWhy } from "./peek/asks";
import { pkPlaceTip, pkScrolling } from "./peek/hint";
import { LeadLightbox } from "./peek/lightbox";
import { LeadPeek } from "./peek/peek";
import { leadArmOnReturn, leadPeekEscape, leadPeekFocus, leadPeekFollows, leadPhotoWarm } from "./peek/seams";

export const LEADS_GLOBALS = {
  LeadPeek,
  LeadPeekActions,
  LeadNotFitWhy,
  LeadLightbox,
  leadPeekEscape,
  leadPeekFollows,
  leadPeekFocus,
  leadArmOnReturn,
  pkPlaceTip,
  pkScrolling,
  leadPhotoWarm,
};
