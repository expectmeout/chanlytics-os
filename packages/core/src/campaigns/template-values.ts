import {
  AppError,
  campaignMessageOf,
  cleanParam,
  parseParamSpec,
  UUID,
  type CampaignMessage,
  type ParamSpec,
} from "@chanlytics/contracts";
import type { TemplateValuesPorts } from "./ports";

/** The refusals a message's values meet for a link the workspace has not given, in the words the composer shows. */
export const TEMPLATE_VALUE_WORDS = {
  noBookingLink: "This message takes the booking link, and none is on file. Add it in Settings › Business first.",
  noReviewLink: "Connect your Google listing so the review link can be filled.",
} as const;

/**
 * The message a version's id names, read once from the rows this workspace holds of it (contracts campaignMessageOf):
 * the one verb a broadcast, a playbook and Ask's proposals read a message by. The id is any version's, WhatsApp's or an
 * email's or a text's, and names the same message; a message needs no WhatsApp row. Refused: an id that is not one
 * ("Pick a template.") and a version this workspace does not hold ("Template not found.", a 404). Whether a channel can
 * send the message is each tick's to say (message-channels.ts), so a version WhatsApp has not approved is no refusal here.
 */
export async function readCampaignMessage(
  ports: Pick<TemplateValuesPorts, "message">,
  id: string,
): Promise<CampaignMessage> {
  if (!UUID.test(id)) throw new AppError("validation", "Pick a template.");
  const rows = await ports.message(id);
  const row = rows.find((r) => r.id === id);
  const message = row ? campaignMessageOf(rows, row.name, row.language) : null;
  if (!message) throw new AppError("not_found", "Template not found.", 404);
  return message;
}

/**
 * The message and the values as its channels will accept them: what a broadcast and a playbook both name, judged once.
 * As many values as the message takes (contracts' one count, whichever version carries it); each typed text once or a
 * value the job fills per person; a booking-link slot needs a link on file, and a review-link slot the link the Google
 * listing keeps. Every refusal is a sentence for the person composing.
 */
export async function templateValues(
  ports: TemplateValuesPorts,
  /** `visits`: a visit playbook, whose run knows each visit; `proposal`: the follow-up, whose run knows each link. */
  cmd: { templateId: string; params: unknown; visits: boolean; proposal: boolean },
): Promise<{ message: CampaignMessage; specs: ParamSpec[] }> {
  const message = await readCampaignMessage(ports, cmd.templateId);
  const expected = message.slots;
  const rawParams = Array.isArray(cmd.params) ? cmd.params : [];
  if (rawParams.length !== expected) {
    throw new AppError(
      "validation",
      expected === 0
        ? "This template takes no values."
        : `This template takes ${expected} value${expected === 1 ? "" : "s"}.`,
    );
  }
  // Each slot: typed text once, or a value the job fills per person.
  const specs: ParamSpec[] = [];
  for (const p of rawParams) {
    const spec = parseParamSpec(p);
    if (!spec)
      throw new AppError(
        "validation",
        "Each value is typed text, their first name, the business name, the booking link, the review link, the booked time or service, or a proposal's link.",
      );
    if (spec.kind === "text") {
      const v = cleanParam(spec.value);
      if (v === null)
        throw new AppError(
          "validation",
          "Every value is needed, without line breaks or tabs, and under 1024 characters.",
        );
      specs.push({ kind: "text", value: v });
    } else {
      // A visit's words exist only on a visit playbook's run, one person's visit at a time; anywhere else every
      // person would be held back as a missing value and the send would read as sent.
      if ((spec.kind === "visit_when" || spec.kind === "visit_service") && !cmd.visits) {
        throw new AppError(
          "validation",
          "Only a reminder the day before or the check the day after can fill in the booked time or service.",
        );
      }
      // A proposal's link exists only on the follow-up's run, one proposal at a time (0006).
      if (spec.kind === "proposal_link" && !cmd.proposal) {
        throw new AppError("validation", "Only the proposal follow-up can fill in a proposal's link.");
      }
      specs.push(spec);
    }
  }
  await refuseWithoutBookingLink(ports, specs);
  await refuseWithoutReviewLink(ports, specs);
  return { message, specs };
}

/**
 * A booking-link slot needs a link on file: refused in words where none is, and the link read only where a slot asks
 * for it. The one rule a message's values (templateValues) and a starter card (the dashboard's checkStarterPlaybook,
 * before anything is filed) are held to.
 */
export async function refuseWithoutBookingLink(
  ports: Pick<TemplateValuesPorts, "bookingLink">,
  specs: readonly ParamSpec[],
): Promise<void> {
  if (specs.some((s) => s.kind === "booking_link") && !(await ports.bookingLink())) {
    throw new AppError("conflict", TEMPLATE_VALUE_WORDS.noBookingLink, 409);
  }
}

/**
 * A review-link slot needs the link the workspace's Google listing keeps (a bound Business Profile's, 00394): refused
 * in words where there is none, and the link read only where a slot asks for it, as the booking link is.
 */
export async function refuseWithoutReviewLink(
  ports: Pick<TemplateValuesPorts, "reviewLink">,
  specs: readonly ParamSpec[],
): Promise<void> {
  if (specs.some((s) => s.kind === "review_link") && !(await ports.reviewLink())) {
    throw new AppError("conflict", TEMPLATE_VALUE_WORDS.noReviewLink, 409);
  }
}
