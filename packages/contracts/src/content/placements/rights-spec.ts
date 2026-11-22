/**
 * AI's two cards for rights per person (00682; the content loop PRD's 5.3, 12.2, call 13): who is in a photo or a video, as
 * the owner or an operator tells AI (never read from a face), and one person's own yes, kept with where it was said. The
 * ask itself is a reply to that person in their conversation, drafted by AI and sent by the owner through the one send
 * door (the reply card); these keep what it came to. Each opens the file.
 */
import { asText, rec, type ProposalSpec, type ProposalSpecAboveOperator } from "../../ask/proposals/spec";
import { fileYesUsesIn } from "../../files/yes";
import { contentRouteOf } from "../address";

const openFile = ({ payload }: { payload: Record<string, unknown> }) => {
  const id = asText(payload.file_id);
  return id ? contentRouteOf({ list: "library", view: "all", open: id }) : null;
};

/** The people a card names, as the door takes them. */
function peopleIn(value: unknown): { name: string; label: string; contact_id: string | null }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((one) => {
    const person = rec(one);
    const name = asText(person.name).trim();
    const label = asText(person.label);
    return name ? [{ name, label: label || "client", contact_id: asText(person.contact_id) || null }] : [];
  });
}

/** Who is in it: these people, nobody, or the owner is not sure. An operator may say it, as they add the footage. */
export const filePeopleSpec: ProposalSpec = {
  needs: "operator",
  gate: "approve",
  commit: ({ payload }) => {
    const state = asText(payload.state);
    const people = peopleIn(payload.people);
    return {
      route: "POST files/[id]/people",
      params: { id: asText(payload.file_id) },
      body: state === "named" ? { state, people } : { state },
    };
  },
  receipt: ({ payload }) =>
    asText(payload.state) === "none"
      ? "Kept: nobody is in it."
      : asText(payload.state) === "unsure"
        ? "Kept: not sure who is in it. Nothing new is posted until you say."
        : `Kept: ${peopleIn(payload.people)
            .map((p) => p.name)
            .join(", ")} in it.`,
  open: openFile,
};

/** One person's own yes for each use, said in a message (its evidence), in person, or to AI. */
export const personYesSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "keep a person's yes",
  gate: "settings",
  commit: ({ payload }) => {
    const message = asText(payload.message_id);
    return {
      route: "PATCH files/[id]/people",
      params: { id: asText(payload.file_id) },
      body: {
        subject_id: asText(payload.subject_id),
        uses: fileYesUsesIn(payload.uses),
        said_in: asText(payload.said_in) || "ai",
        ...(message ? { message_id: message } : {}),
      },
    };
  },
  receipt: ({ payload }) => `Kept ${asText(payload.who)}'s yes.`,
  open: openFile,
};
