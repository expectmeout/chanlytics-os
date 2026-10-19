/**
 * Campaigns' toast, held at the route's mount (route.tsx), so what a press says outlives the pane or sheet it was pressed
 * in: a send made from New's Send once closes New at once, and its toast, with its Stop and its "See who", must stay (the
 * Campaigns wiring review's lane 6). The sheets Campaigns opens over Sequences say theirs here too (sheets.tsx).
 */
import { createContext, useContext } from "react";
import type { useLegacyToast } from "../../legacy-verbs";

type Flash = ReturnType<typeof useLegacyToast>[1];

const CampaignsToastContext = createContext<Flash | null>(null);

/** The route's toast, given to everything drawn under Campaigns' mount. */
export const CampaignsToast = CampaignsToastContext.Provider;

/** The route's toast, or null outside Campaigns' mount (Sent's, a sheet over another page): the caller's own then. */
export const useCampaignsToast = (): Flash | null => useContext(CampaignsToastContext);
