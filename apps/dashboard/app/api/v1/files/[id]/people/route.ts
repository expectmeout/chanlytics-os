import { z } from "zod";
import { FILE_YES_USES, SUBJECT_LABELS, UUID } from "@chanlytics/contracts";
import { write } from "@/server/shared/route";
import { fileScope } from "@/server/files/file";
import { keepPersonsNo, keepPersonsYes, sayAsked, sayWhoIsInIt, takePersonsYesBack } from "@/server/files/people";

const SUBJECT = z.string().regex(UUID, "Which person?");
const USES = z.array(z.enum(FILE_YES_USES)).min(1).max(FILE_YES_USES.length);

/**
 * POST /api/v1/files/:id/people — `{ state, people? }`: who is in this file, as the owner or an operator says it, never
 * from a face (00691; the content loop PRD's 5.3, principle 6): `named` with each person (their name, a client, staff or
 * someone else, and the person in People where the workspace knows them), `none`, or `unsure` (no new use until the
 * owner says). The door asks the add_files permission itself.
 *
 * PUT — `{ subject_id, via, uses }`: that the member sent that person the ask (a reply in their own conversation, through
 * POST conversations/:id/reply), on which channel and about which uses. Whoever may reply may note it.
 *
 * PATCH — what that person answered, as the owner read it. `{ subject_id, uses, said_in, message_id? }` (or with
 * `said: "yes"`): their own yes for each use, said to AI, in a message (the message named is its evidence) or in person.
 * `{ subject_id, said: "no" }`: they said no. `{ subject_id, said: "took_back", uses? }`: their yes taken back (every use
 * where none is named), which holds what waits, asks down what is up and pauses the ads that show them. Each door asks the
 * settings permission itself.
 *
 * The handles are in src/server/files/people.ts.
 */
export const POST = write({
  scope: fileScope,
  role: "operator",
  rate: "settings",
  input: z.strictObject({
    state: z.enum(["named", "none", "unsure"]),
    people: z
      .array(
        z.strictObject({
          name: z.string().trim().min(1).max(120),
          label: z.enum(SUBJECT_LABELS),
          contact_id: z.string().regex(UUID, "Which person?").nullish(),
        }),
      )
      .max(20)
      .optional(),
  }),
  handle: ({ ctx, member, row, input }) => sayWhoIsInIt(ctx, member, row, input),
});

export const PUT = write({
  scope: fileScope,
  role: "operator",
  rate: "settings",
  input: z.strictObject({ subject_id: SUBJECT, via: z.string().trim().min(1).max(40), uses: USES }),
  handle: ({ ctx, member, input }) => sayAsked(ctx, member, input),
});

export const PATCH = write({
  scope: fileScope,
  role: "partner",
  rate: "settings",
  input: z.union([
    z.strictObject({
      subject_id: SUBJECT,
      said: z.literal("yes").optional(),
      uses: USES,
      said_in: z.enum(["ai", "message", "in_person"]),
      message_id: z.string().regex(UUID, "Which message?").optional(),
    }),
    z.strictObject({ subject_id: SUBJECT, said: z.literal("no") }),
    z.strictObject({ subject_id: SUBJECT, said: z.literal("took_back"), uses: USES.optional() }),
  ]),
  handle: ({ ctx, member, input }) => {
    if (input.said === "no") return keepPersonsNo(ctx, member, input);
    if (input.said === "took_back") return takePersonsYesBack(ctx, member, input);
    return keepPersonsYes(ctx, member, input);
  },
});
