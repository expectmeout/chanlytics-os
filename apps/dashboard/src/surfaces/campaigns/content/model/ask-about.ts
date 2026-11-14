/** What Ask is asked about from Content's page: the page itself (its ideas, Make's line, the empty state's link). */
import { CONTENT_ROUTE, CONTENT_WORDS } from "@chanlytics/contracts";

export const ABOUT_CONTENT = { kind: "page", id: CONTENT_ROUTE, label: CONTENT_WORDS.tab } as const;
