/**
 * What GET templates answers for a workspace's template rows, so the harness's server and its page's fixture say what the
 * route says: the rows (the composers' unless `all`), the messages made of EVERY row, what the composers left out, and the
 * call's text found among every WhatsApp row.
 *
 * The route's body is its reader's (apps/dashboard/src/server/readers/templates.ts templatesOf), which reads the database and
 * so cannot run here; this is its composition over the same contracts functions, held to the reader's own answer by
 * e2e-harness-campaigns.test.mjs, which runs the two over one workspace. A row is as the table holds it (`components`, Meta's
 * array, is read and not returned); an email's and a text's are approved the moment they are written.
 *
 * Nothing on the harness has sent a message, so what sends each template and how many went out are what a workspace with no
 * playbook, run or message of its own holds: the booking message's mark, and no send.
 */
import {
  bookingTemplate,
  campaignMessagesOf,
  templateBlocked,
  templateHolds,
  templateParts,
  templateSends,
  templateUsage,
} from "@chanlytics/contracts";

/** Whether the composers offer a row: approved, and not hidden by the workspace. */
const offered = (t) => t.meta_status === "approved" && !t.hidden_at;

/** The read for these rows. `all` is Settings': every row, with what sends each and how many went out. */
export function templatesRead(rows, { all }) {
  // The rows in the order of their names, as the route reads them, and each as the customer receives it, with why this
  // product cannot send it: judged on a WhatsApp row alone.
  const every = [...rows]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map(({ components, ...t }) => ({
      ...t,
      ...templateParts(components),
      blocked: t.channel === "whatsapp" ? templateBlocked({ components }) : null,
    }));
  const templates = all ? every : every.filter(offered);
  const held = templateHolds(every.filter((t) => !offered(t)));
  const messages = campaignMessagesOf(every);
  // The call's text, found among every WhatsApp row (a hidden one too), as the reader names it; null where there is none.
  const booking = bookingTemplate(every.filter((t) => t.channel === "whatsapp")) ?? null;
  if (!all) return { templates, held, messages, booking };
  const usedBy = templateUsage({
    playbooks: [],
    broadcasts: [],
    bookingName: booking?.name ?? null,
  });
  const sends = templateSends({ runs: [], recipients: [], inbox: [] });
  return { templates, held, messages, booking, usedBy, sends };
}
