import "server-only";
import {
  bookingTemplate,
  campaignMessagesOf,
  runsWords,
  templateBlocked,
  templateHolds,
  templateParts,
  templateSends,
  templateSendsOf,
  templateUsage,
  type TemplateSends,
} from "@chanlytics/contracts";
// The database's count of the same sends (00374); contracts' templateSends is the fold it replaced, read below for a
// database before it.
import { templateSends as sendsByTemplate } from "@chanlytics/db";
import { stamp, type Reader, type ReaderContext } from "./index";

/**
 * `components` is read but never returned: the row keeps Meta's whole component
 * array (00045, written by the sync and by a create), and the one thing the
 * pages want out of it is the footer -- the line under the words. Sending the
 * array to the browser so three composers can each dig the same string out of it
 * would put Meta's shape in a .jsx file, where the compiler cannot see it.
 */
const COLUMNS =
  "id, channel, name, language, body_preview, variables, category, meta_status, quality, rejected_reason, synced_at, source, hidden_at, title, components";

/** Rows per page: PostgREST's max_rows (supabase config), which answers at most this many whatever a select asks for. */
const TEMPLATES_PAGE = 1000;

/**
 * Every row a read matches, a page at a time. PostgREST cuts an answer at
 * max_rows without saying so, and a count taken from the first thousand stops
 * growing on exactly the workspaces that send the most. The read must be
 * ordered by something unique, or a page boundary repeats one row and skips
 * another.
 */
async function everyRow<T>(
  what: string,
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (;;) {
    const { data, error } = await page(out.length, out.length + TEMPLATES_PAGE - 1);
    if (error) throw new Error(`${what}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < TEMPLATES_PAGE) return out;
  }
}

/**
 * How many of each message went out, and when the latest did, by its name: the database's count (template_sends, 00374),
 * one call whatever the history, or, on a database before it, for one release, the fold over every person a run sent
 * and every template the Inbox sent that WhatsApp took (contracts templateSends), as this reader read them. `runs` is
 * the reader's own read of every run, which the fold names each send's message by.
 */
async function templateSendsRead(
  rc: ReaderContext,
  runs: PromiseLike<readonly { id: string; template_name: string | null }[]>,
): Promise<Record<string, TemplateSends>> {
  const tenantId = rc.tenantId;
  const read = await sendsByTemplate(rc.ctx.supabase, tenantId);
  if (read !== "missing") {
    const sends = templateSendsOf(read);
    if (!sends) throw new Error("template_sends answered a shape it does not know");
    return sends;
  }
  const [runRows, recipients, inbox] = await Promise.all([
    runs,
    // What LEFT, person by person. A broadcast's `recipient_count` is the
    // audience it was scheduled for; the wire holds people back from it and a
    // run can stop part-way, and Reports › Campaigns counts "Messages sent"
    // from these rows, apart from "Delivered". Counted the way that page counts.
    everyRow("broadcast_recipients", (from, to) =>
      rc.ctx.supabase
        .from("broadcast_recipients")
        .select("broadcast_id, state, sent_at")
        .eq("tenant_id", tenantId)
        .eq("state", "sent")
        .order("broadcast_id")
        .order("contact_id")
        .range(from, to),
    ),
    // The one door a run does not cover: a template the Inbox sent into a closed
    // window, on its own message row. It left when WhatsApp took it -- the
    // wamid; a row still in its veto window, withdrawn or refused has none. A
    // run's own messages name no template (deliver records them without one),
    // so nothing counted on a recipient row above is counted again here.
    everyRow("messages", (from, to) =>
      rc.ctx.supabase
        .from("messages")
        .select("template_name, external_id, created_at")
        .eq("tenant_id", tenantId)
        .eq("direction", "outbound")
        .not("template_name", "is", null)
        .not("external_id", "is", null)
        .order("id")
        .range(from, to),
    ),
  ]);
  return templateSends({ runs: runRows, recipients, inbox });
}

/**
 * GET templates' body, as the route ran it: its answer's type is the body's own, as the route's was. `templates` are the
 * rows (the composers' unless `all`), `messages` the workspace's messages made of EVERY row (contracts
 * campaignMessagesOf), `held` what the composers' rows left out of WhatsApp's, counted by why, and `booking` the call's
 * text found among every WhatsApp row (contracts bookingTemplate), or null.
 */
async function templatesOf(rc: ReaderContext, all: boolean) {
  const tenantId = rc.tenantId;
  const { data, error } = await rc.ctx.supabase
    .from("templates")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .order("name");
  if (error) throw new Error(error.message);
  // The message as the customer receives it -- heading, footer, buttons -- and
  // why this product cannot send it, if it cannot. Meta's array stays behind:
  // three composers digging the same shapes out of it would put Meta's schema
  // in a .jsx file, where the compiler cannot see it. Only a WhatsApp row is
  // judged: an email's subject may hold a value ({{1}}), which reads as "a
  // heading that takes a value" on Meta's array and is no reason to hold the email.
  const every = (data ?? []).map(({ components, ...t }) => ({
    ...t,
    ...templateParts(components),
    blocked: t.channel === "whatsapp" ? templateBlocked({ components }) : null,
  }));
  // The composers: approved, and not hidden by the workspace. Settings sees everything. The ones left out are counted by
  // why, so an empty picker can say it (contracts noTemplateWords) -- the read that left them out is the one that knows.
  const offered = (t: { meta_status: string; hidden_at: string | null }) =>
    t.meta_status === "approved" && !t.hidden_at;
  const templates = all ? every : every.filter(offered);
  const held = templateHolds(every.filter((t) => !offered(t)));
  // The messages, from every row, the ones the composers leave out included: a WhatsApp version still in review keeps
  // its standing inside its message, and a message with no WhatsApp row is one. Whether a picker lists one is the
  // message's own `offered`.
  const messages = campaignMessagesOf(every);
  // The call's text: the WhatsApp message the phone agent texts a caller who asks to book, found among EVERY WhatsApp row
  // (a hidden one too), as the edge picks it (apps/edge/lib/voice/call-booking-link.ts) and as Settings says what sends it.
  // Campaigns' home says whether there is one (contracts bookingTemplate); null where there is none.
  const booking = bookingTemplate(every.filter((t) => t.channel === "whatsapp")) ?? null;
  // What sends each of them, and how many of each went out, for the page that
  // lists every one. The composers (`!all`) are choosing a template to send and
  // never ask, so they do not pay for the reads. A workspace can carry a message
  // nothing has ever sent -- one written in WhatsApp Manager, or a starter added
  // and never wired up -- and this list was the one place that could not say so.
  if (!all) return { templates, held, messages, booking };
  // Every run, a page at a time: a daily playbook alone passes a thousand of
  // them in three years, and a run cut off the end sent messages nobody is
  // credited with. A run's state says whether its playbook is waiting on the
  // owner; a name and a date let a message people send by hand name the latest
  // two.
  const runs = everyRow("broadcasts", (from, to) =>
    rc.ctx.supabase
      .from("broadcasts")
      .select("id, template_name, playbook_id, name, state, created_at")
      .eq("tenant_id", tenantId)
      .order("id")
      .range(from, to),
  );
  const [pb, runRows, sends] = await Promise.all([
    // Its clock, for the line under what sends it ("runs daily at 10:00").
    rc.ctx.supabase
      .from("playbooks")
      .select("id, name, template_name, state, trigger, run_hour, cadence_days")
      .eq("tenant_id", tenantId),
    runs,
    templateSendsRead(rc, runs),
  ]);
  if (pb.error) throw new Error(pb.error.message);
  const usedBy = templateUsage({
    playbooks: (pb.data ?? []).map((p) => ({ ...p, runs: runsWords(p) })),
    broadcasts: runRows,
    // The booking message is a WhatsApp template the receptionist sends: an email or a text of the same name is none.
    bookingName: booking?.name ?? null,
  });
  return { templates, held, messages, booking, usedBy, sends };
}

/** GET templates' answer: the rows and their messages, and for Settings (`all`) what sends each and how many went out. */
export type TemplatesRead = Awaited<ReturnType<typeof templatesOf>>;

/**
 * GET templates, as the route answers it: ONE workspace's templates, scoped explicitly and not by RLS alone. Unless
 * `all`, the composers' read: `templates` are the rows of every channel that are approved and not hidden by the
 * workspace (an email or a text is written approved; Meta refuses anything else at the wire), each row the message as
 * the customer receives it (templateParts) and why this product cannot send it (`blocked`, judged on a WhatsApp row
 * alone: null on an email's or a text's). `all` is Settings': every template with its status, what sends each and how
 * many went out. Both answer `messages`, beside `templates` and `held`: the messages (a name in a language) made of EVERY
 * row of the workspace by contracts campaignMessagesOf, not of the rows left in the list, so a WhatsApp version in
 * review keeps its status inside its message, and a message with no WhatsApp row is one. The route's body, moved here
 * whole, so the composers and Ask's campaigns.audiences read the same rows the same way; the route checks `?all=`. Each
 * template is a row a citation names, with no address of its own: it opens Templates, whichever read returned it.
 */
export const templates: Reader<{ all: boolean }, TemplatesRead> = {
  name: "templates",
  async read(rc, { all }) {
    const data = await templatesOf(rc, all);
    return {
      data,
      rows: data.templates.map((t) => ({
        kind: "template" as const,
        id: t.id,
        route: "messages",
        label: t.title || t.name,
      })),
      stamp: stamp(),
    };
  },
};
