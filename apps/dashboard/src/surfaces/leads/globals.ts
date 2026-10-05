/**
 * The one part of Leads a page that has not moved still draws by name (decision 0015): the plan card, which Ask's
 * palette calls for a lead_search card (legacy/pages/ask-turn.jsx, `window.LeadPlanCard`), hookless, as a function. The
 * app publishes it from seed-globals.ts before any page loads, and it is deleted with the last reader: Ask, when it moves
 * (step 12, the Ask Rewired program's).
 */
import { LeadPlanCard } from "./finder/plan-card";

export const LEADS_GLOBALS = { LeadPlanCard };
